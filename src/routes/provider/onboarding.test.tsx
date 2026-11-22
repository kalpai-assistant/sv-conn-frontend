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
// SVC-490: celebration overlay on step 5. Mocked to a stable marker so
// tests can assert mount-on-step-5 without pulling the real auto-dismiss
// timer + framer-motion `useReducedMotion` dep into jsdom.
vi.mock("@/components/Celebration", () => ({
  Celebration: () => <div data-testid="celebration-mock" />,
}));
// SVC-490: haptics fire on forward step transitions + step-5 arrival. The
// wrapper (SVC-398) is a no-op on web; mocking the module lets us assert
// call sites without pulling the native plugin into jsdom.
const hapticImpactLight = vi.fn();
const hapticSuccess = vi.fn();
vi.mock("@/lib/haptics", () => ({
  hapticImpactLight: () => hapticImpactLight(),
  hapticSuccess: () => hapticSuccess(),
}));

import { Route } from "@/routes/provider/onboarding";

const Page = (Route as unknown as { component: () => ReactElement }).component;

const DRAFT_KEY = "provider-onboarding";

function logoFile() {
  return new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // SVC-490: default initial step is now 0 (welcome hero). These step-1
  // tests focus on business-field behaviour, not the welcome screen, so
  // seed a draft at step 1 — mirrors the real resume path for any
  // provider who has moved past the hero once already. The step-0 tests
  // further down clear this seed explicitly.
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 1 }));
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

// SVC-490 — the welcome hero is the first thing a fresh provider sees. These
// tests lock the failure modes that would make it stop being the first thing
// (regressing to step 1 directly) or stop advancing to the form (regressing
// the CTA).
describe("onboarding step 0 — welcome hero (SVC-490)", () => {
  // Catches: "the welcome hero disappears from a fresh install, step 1
  // becomes the first screen again, we lose the 'what you'll earn' framing."
  it("renders the welcome hero on a fresh install (no draft)", () => {
    window.localStorage.removeItem(DRAFT_KEY);
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "You're about to earn like a pro" }),
    ).toBeInTheDocument();
    // The business-name field (step 1) should NOT be mounted yet.
    expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
    // The numbered stepper label should be hidden on step 0 (welcome is
    // not a step) — if it appeared it'd read "Step 0 of 5".
    expect(screen.queryByText(/^Step \d+ of \d+$/)).not.toBeInTheDocument();
  });

  // Catches: "the hero's 'Start setup' CTA stops advancing to step 1, or
  // worse advances silently to step 2+, skipping the business form."
  it("the CTA advances to step 1 and the business form becomes available", async () => {
    window.localStorage.removeItem(DRAFT_KEY);
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Start setup" }));

    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
  });

  // Catches: "the earnings copy stops reading as a placeholder and starts
  // claiming a specific service figure — breaks the honesty contract with
  // Tushar's pricing work (SVC-495) that hasn't landed yet."
  it("earnings copy uses the placeholder range, with the rupee-formatted bounds", () => {
    window.localStorage.removeItem(DRAFT_KEY);
    render(<Page />);

    // Placeholder range is ₹8,000–₹25,000/month; formatRupees adds the
    // Indian grouping. The exact literal keeps us honest if the range
    // ever silently shifts.
    expect(
      screen.getByText(/Typical providers earn ₹8,000.*₹25,000 per month\./),
    ).toBeInTheDocument();
  });
});

// SVC-490 — the rejection banner is the only persistent surface showing
// the reviewer's reason during a resubmit. Home's checklist loses it the
// moment the provider taps "Resubmit documents"; without this banner they
// walk back through onboarding blind.
describe("onboarding — rejection banner (SVC-490)", () => {
  it("shows the banner with the reviewer's reason on a rejected profile", () => {
    profile = {
      kyc_status: "rejected",
      business_name: null,
      business_image_url: null,
      kyc_rejection_reason: "Aadhaar back photo was blurry",
    };
    render(<Page />);

    expect(screen.getByText("We need to look at these documents again")).toBeInTheDocument();
    expect(screen.getByText(/Reason: Aadhaar back photo was blurry\./)).toBeInTheDocument();
  });

  // Catches: regressed null-check; printing "Reason: " alone reads as
  // a broken template, not a legacy row that predates the reason field.
  it("hides the Reason line when `kyc_rejection_reason` is null (legacy)", () => {
    profile = {
      kyc_status: "rejected",
      business_name: null,
      business_image_url: null,
      kyc_rejection_reason: null,
    };
    render(<Page />);

    // Title still renders; no bare "Reason: " artifact.
    expect(screen.getByText("We need to look at these documents again")).toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  it("does not show the banner for a non-rejected profile", () => {
    profile = {
      kyc_status: "pending",
      business_name: null,
      business_image_url: null,
    };
    render(<Page />);

    expect(screen.queryByText("We need to look at these documents again")).not.toBeInTheDocument();
  });
});

// SVC-490 — haptic firing is the physical proof a step transition
// landed. These tests mock `@/lib/haptics` so we can assert each path
// without the native plugin; the wrapper itself is tested in SVC-398.
describe("onboarding — haptics (SVC-490)", () => {
  // Catches: "forward step haptic never fires — tapping Start setup on
  // the welcome hero feels dead, losing the physical commitment cue."
  it("fires a Light impact when the welcome CTA advances to step 1", async () => {
    window.localStorage.removeItem(DRAFT_KEY);
    const user = userEvent.setup();
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Start setup" }));

    expect(hapticImpactLight).toHaveBeenCalledTimes(1);
  });

  // Catches: "Success haptic never fires on step 5 arrival — the
  // celebration overlay plays visually but through-pocket the moment
  // is silent."
  it("fires a Success haptic when the provider lands on step 5", () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 5 }));
    render(<Page />);

    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  // Catches: "haptic fires on resume too — a provider reopening at
  // step 1 feels a success buzz for doing nothing."
  it("does not fire a Light haptic on initial mount at step 1 (resumed draft)", () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 1 }));
    render(<Page />);

    expect(hapticImpactLight).not.toHaveBeenCalled();
  });
});

// SVC-490 — step 5 is the one moment of arrival in the whole wizard. The
// Celebration overlay fires once on transition from step 4 → 5 (or on
// a resumed draft already at step 5, which still counts as "just arrived"
// per this render). It MUST NOT re-fire on every mount of step 5 or on
// draft-persisted re-renders that keep step=5 — otherwise a provider
// resuming the dashboard-choice screen sees confetti every launch.
describe("onboarding step 5 — celebration overlay (SVC-490)", () => {
  // Catches: "the overlay never fires at all, step 5 reads as a plain
  // settings screen rather than the end of a wizard."
  it("mounts the celebration overlay when the provider reaches step 5", () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 5 }));
    render(<Page />);

    expect(screen.getByTestId("celebration-mock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toBeInTheDocument();
  });

  // Catches: "overlay fires on every step too — confetti on name entry,
  // confetti on KYC capture, broken feeling of occasion."
  it("does not mount the celebration overlay on earlier steps", () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 2 }));
    render(<Page />);

    expect(screen.queryByTestId("celebration-mock")).not.toBeInTheDocument();
  });
});

// SVC-490 — the KYC trust block is the single piece of framing between
// "Verify your identity" and three camera buttons asking for a government
// ID. If it regresses, the pre-Phase-1 cold-ask drop-off returns.
describe("onboarding step 2 — KYC trust block (SVC-490)", () => {
  it("renders the lock-icon reassurance above the camera tiles", () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 2 }));
    render(<Page />);

    // Both sentences present, under a heading that names the contract.
    expect(screen.getByText("These documents are private")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Only our verification team will see them\. Customers never see your Aadhaar\./,
      ),
    ).toBeInTheDocument();
  });
});
