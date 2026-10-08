/**
 * The /invite code-entry screen (SVC-322 part 3). Pinned: Join waits for six
 * digits, the clipboard pre-fills but never submits, success lands in the Pro
 * app, every refusal shows its own copy, and someone already on a team is told
 * so rather than given a form that can only fail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const { acceptMutate, navigate, proMe, toast } = vi.hoisted(() => ({
  acceptMutate: vi.fn(),
  navigate: vi.fn(),
  proMe: { value: null as unknown },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/usePro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/usePro")>()),
  useProMe: () => ({ data: proMe.value }),
  useAcceptInvite: () => ({ mutate: acceptMutate, isPending: false }),
}));
vi.mock("sonner", () => ({ toast }));

import { Route } from "@/routes/invite";

const InvitePage = (Route as unknown as { component: () => React.ReactElement }).component;

function setClipboard(
  text: string | { reject: unknown },
  permission: PermissionState | "unsupported" = "granted",
) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText:
        typeof text === "string"
          ? vi.fn().mockResolvedValue(text)
          : vi.fn().mockRejectedValue(text.reject),
    },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: {
      query:
        permission === "unsupported"
          ? vi.fn().mockRejectedValue(new TypeError("unknown permission"))
          : vi.fn().mockResolvedValue({ state: permission }),
    },
  });
}

const codeInput = () => screen.getByLabelText("Invite code") as HTMLInputElement;
const joinButton = () => screen.getByRole("button", { name: /join team/i });

beforeEach(() => {
  vi.clearAllMocks();
  proMe.value = null;
  sessionStorage.clear();
  setClipboard("");
});

describe("entering the code", () => {
  it("keeps Join disabled until six digits", () => {
    render(<InvitePage />);
    expect(joinButton()).toBeDisabled();
    fireEvent.change(codeInput(), { target: { value: "48291" } });
    expect(joinButton()).toBeDisabled();
    fireEvent.change(codeInput(), { target: { value: "482913" } });
    expect(joinButton()).toBeEnabled();
  });

  it("pre-fills a six-digit code from the clipboard, without submitting it", async () => {
    setClipboard("482913");
    render(<InvitePage />);
    await waitFor(() => expect(codeInput().value).toBe("482913"));
    expect(acceptMutate).not.toHaveBeenCalled();
  });

  it("leaves the field empty when the clipboard holds something else", async () => {
    setClipboard("Your OTP is 1234");
    render(<InvitePage />);
    await act(async () => {});
    expect(codeInput().value).toBe("");
  });

  it("doesn't read on load unless the browser already allows it (no prompt on open)", async () => {
    setClipboard("482913", "prompt");
    render(<InvitePage />);
    await act(async () => {});
    expect(codeInput().value).toBe("");
    expect(navigator.clipboard.readText).not.toHaveBeenCalled();
  });

  it("doesn't read on load in Safari, which has no clipboard permission to ask about", async () => {
    setClipboard("482913", "unsupported");
    render(<InvitePage />);
    await act(async () => {});
    expect(codeInput().value).toBe("");
  });

  it("pastes from a tap on Paste code", async () => {
    setClipboard("482913", "prompt");
    render(<InvitePage />);
    fireEvent.click(screen.getByRole("button", { name: /paste code/i }));
    await waitFor(() => expect(codeInput().value).toBe("482913"));
  });

  it("says the clipboard was refused, not that it was empty (found on device)", async () => {
    setClipboard({ reject: new DOMException("denied", "NotAllowedError") }, "prompt");
    render(<InvitePage />);
    fireEvent.click(screen.getByRole("button", { name: /paste code/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringMatching(/couldn’t read the clipboard/i)),
    );
  });

  it("carries on quietly when the WebView won't let us read the clipboard", async () => {
    setClipboard({ reject: new DOMException("denied", "NotAllowedError") });
    render(<InvitePage />);
    await act(async () => {});
    expect(codeInput().value).toBe("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("joining", () => {
  function enterAndJoin(code = "482913") {
    render(<InvitePage />);
    fireEvent.change(codeInput(), { target: { value: code } });
    fireEvent.click(joinButton());
  }

  it("sends the code and lands in the Pro app", () => {
    sessionStorage.setItem("eazyserv:pending-invite", "1");
    acceptMutate.mockImplementation((_code, { onSuccess }) => onSuccess({}));
    enterAndJoin();

    expect(acceptMutate).toHaveBeenCalledWith("482913", expect.anything());
    expect(navigate).toHaveBeenCalledWith({ to: "/pro", replace: true });
    // Nothing left to come back to after signup.
    expect(sessionStorage.getItem("eazyserv:pending-invite")).toBeNull();
  });

  it("treats 'already on this team' as joined", () => {
    acceptMutate.mockImplementation((_code, { onError }) =>
      onError(new ApiError(409, "x", undefined, "ALREADY_ON_TEAM")),
    );
    enterAndJoin();
    expect(navigate).toHaveBeenCalledWith({ to: "/pro", replace: true });
  });

  it("shows the refusal and stays put", () => {
    acceptMutate.mockImplementation((_code, { onError }) =>
      onError(new ApiError(404, "x", undefined, "INVITE_NOT_FOUND")),
    );
    enterAndJoin();
    expect(screen.getByRole("alert")).toHaveTextContent(/isn’t right/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears the refusal once they start retyping", () => {
    acceptMutate.mockImplementation((_code, { onError }) =>
      onError(new ApiError(404, "x", undefined, "INVITE_NOT_FOUND")),
    );
    enterAndJoin();
    fireEvent.change(codeInput(), { target: { value: "48291" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("someone already on a team", () => {
  it("is told so, and pointed at the Pro app instead of a form", () => {
    proMe.value = {
      is_self: false,
      service_provider: { business_name: "Sharma Electricals" },
    };
    render(<InvitePage />);
    expect(screen.getByRole("heading", { name: /already on a team/i })).toBeInTheDocument();
    expect(screen.getByText(/Sharma Electricals/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Invite code")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open pro app/i })).toHaveAttribute("href", "/pro");
  });
});
