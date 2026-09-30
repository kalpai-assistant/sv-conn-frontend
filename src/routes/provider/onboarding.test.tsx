/**
 * Provider onboarding step 1 — the business fields (SVC-337).
 *
 * What matters is what reaches the server: a provider must not get past step 1
 * without a business name, the name must arrive trimmed, and the logo — which
 * is optional — must be uploaded only when one was actually picked. A provider
 * sent back into onboarding after finishing must see the name they already
 * saved, not an empty field that blocks them.
 */
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateName = vi.fn();
const updateBusinessName = vi.fn();
const uploadBusinessImage = vi.fn();
const uploadPhoto = vi.fn();
const updateLanguages = vi.fn();
const updateUser = vi.fn();
let profile: Record<string, unknown> | undefined;

const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, isPending: false });

vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: profile }),
  useUpdateName: () => mutation(updateName),
  useUpdateLanguages: () => mutation(updateLanguages),
  useUploadPhoto: () => mutation(uploadPhoto),
  useUpdateBusinessName: () => mutation(updateBusinessName),
  useUploadBusinessImage: () => mutation(uploadBusinessImage),
  useSubmitKyc: () => mutation(vi.fn()),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { name: "Rohan Kumar" }, updateUser }),
}));
vi.mock("@/lib/camera", () => ({
  isNativePlatform: () => false,
  captureNativePhoto: vi.fn(),
  captureLivePhoto: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: unknown }) => opts,
  useNavigate: () => vi.fn(),
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
// Later steps pull in maps, payouts and the services list; none is on step 1.
vi.mock("@/components/provider/ServicesPicker", () => ({ ServicesPicker: () => null }));
vi.mock("@/components/provider/PayoutStep", () => ({ PayoutStep: () => null }));
vi.mock("@/components/provider/ServiceAreaStep", () => ({ ServiceAreaStep: () => null }));

import { Route } from "@/routes/provider/onboarding";

const Page = (Route as unknown as { component: () => ReactElement }).component;

const DRAFT_KEY = "provider-onboarding";

function logoFile() {
  return new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  profile = { kyc_status: "pending", business_name: null, business_image_url: null };
  for (const fn of [
    updateName,
    updateBusinessName,
    uploadBusinessImage,
    uploadPhoto,
    updateLanguages,
  ]) {
    fn.mockResolvedValue(undefined);
  }
  // jsdom has no object URLs; the logo preview needs one.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:logo-preview");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("onboarding step 1 — business", () => {
  it("does not continue without a business name", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Please enter your business name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toHaveAttribute("aria-invalid", "true");
    expect(updateName).not.toHaveBeenCalled();
    expect(updateBusinessName).not.toHaveBeenCalled();
  });

  it("treats whitespace alone as no business name", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.type(screen.getByLabelText("Business name"), "   ");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Please enter your business name.")).toBeInTheDocument();
    expect(updateBusinessName).not.toHaveBeenCalled();
  });

  it("saves the business name trimmed and continues without a logo", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await user.type(screen.getByLabelText("Business name"), "  Sparkle Cleaners  ");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(updateBusinessName).toHaveBeenCalledWith("Sparkle Cleaners"));
    // The logo is optional: nothing picked, nothing uploaded, and still onward.
    expect(uploadBusinessImage).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Step 2 of 5")).toBeInTheDocument());
  });

  it("uploads the logo when one was picked", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const file = logoFile();

    await user.type(screen.getByLabelText("Business name"), "Sparkle Cleaners");
    await user.upload(screen.getByTestId("logo-file-input"), file);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(uploadBusinessImage).toHaveBeenCalledTimes(1));
    expect(uploadBusinessImage).toHaveBeenCalledWith(file);
  });

  it("shows the default logo until one is picked", () => {
    render(<Page />);

    expect(screen.getByRole("img", { name: "Default business logo" })).toBeInTheDocument();
    expect(screen.getByText("Skip this and we'll use this default logo.")).toBeInTheDocument();
  });

  it("restores the business name from the saved draft", () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 1,
        name: "Rohan Kumar",
        languages: [],
        businessName: "Sparkle Cleaners",
      }),
    );
    render(<Page />);

    expect(screen.getByLabelText("Business name")).toHaveValue("Sparkle Cleaners");
  });

  it("fills in the saved business name for a provider sent back into onboarding", () => {
    // No draft — it is cleared when onboarding finishes — but the server has one.
    profile = {
      kyc_status: "rejected",
      business_name: "Sparkle Cleaners",
      business_image_url: "https://bucket/provider-photos/u/business-1.png",
    };
    render(<Page />);

    expect(screen.getByLabelText("Business name")).toHaveValue("Sparkle Cleaners");
    // And their stored logo, not the default.
    expect(screen.getByRole("img", { name: "Your business logo" })).toHaveAttribute(
      "src",
      "https://bucket/provider-photos/u/business-1.png",
    );
  });

  it("never replaces a draft with the server's business name", () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 1, name: "Rohan Kumar", languages: [], businessName: "New Name" }),
    );
    profile = { kyc_status: "rejected", business_name: "Old Name", business_image_url: null };
    render(<Page />);

    expect(screen.getByLabelText("Business name")).toHaveValue("New Name");
  });
});
