/**
 * "Your business" on the Provider Profile (SVC-337).
 *
 * The Edit sheet stages changes and sends them only on Save, and only what
 * changed. The failures this guards against are silent: a Cancel that still
 * saves, a Save that re-sends an unchanged name, or a blank name reaching the
 * server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProviderProfile } from "@/hooks/useApi";

const updateBusinessName = vi.fn();
const uploadBusinessImage = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useUpdateBusinessName: () => ({ mutateAsync: updateBusinessName, isPending: false }),
  useUploadBusinessImage: () => ({ mutateAsync: uploadBusinessImage, isPending: false }),
}));
vi.mock("@/lib/camera", () => ({
  isNativePlatform: () => false,
  captureNativePhoto: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BusinessSection } from "@/components/provider/BusinessSection";
// The real stack, not a mock: `runBackInterceptors` is exactly what the app's
// Android backButton listener calls first (main.mobile.tsx).
import { runBackInterceptors } from "@/lib/back-interceptor";

function makeProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: "p1",
    user_id: "u1",
    profile_photo_url: null,
    languages: [],
    kyc_status: "verified",
    is_online: false,
    avg_rating: 0,
    total_completed_jobs: 0,
    payout_set: false,
    payout_method: null,
    payout_display: null,
    business_name: "Sparkle Cleaners",
    business_image_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateBusinessName.mockResolvedValue(undefined);
  uploadBusinessImage.mockResolvedValue(undefined);
  globalThis.URL.createObjectURL = vi.fn(() => "blob:logo-preview");
  globalThis.URL.revokeObjectURL = vi.fn();
});

async function openSheet() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByRole("dialog");
  return user;
}

describe("BusinessSection", () => {
  it("shows the saved business name", () => {
    render(<BusinessSection profile={makeProfile()} />);
    expect(screen.getByText("Sparkle Cleaners")).toBeInTheDocument();
  });

  it("asks for a business name when there is none", () => {
    render(<BusinessSection profile={makeProfile({ business_name: null })} />);
    expect(screen.getByText("Add your business name")).toBeInTheDocument();
  });

  it("saves a changed name, trimmed", async () => {
    render(<BusinessSection profile={makeProfile()} />);
    const user = await openSheet();

    const field = screen.getByLabelText("Business name");
    await user.clear(field);
    await user.type(field, "  Sparkle Home Services ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateBusinessName).toHaveBeenCalledWith("Sparkle Home Services"));
    expect(uploadBusinessImage).not.toHaveBeenCalled();
  });

  it("uploads a picked logo without re-sending an unchanged name", async () => {
    render(<BusinessSection profile={makeProfile()} />);
    const user = await openSheet();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });

    await user.upload(screen.getByTestId("logo-file-input"), file);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploadBusinessImage).toHaveBeenCalledWith(file));
    expect(updateBusinessName).not.toHaveBeenCalled();
  });

  it("sends nothing when Save is pressed with no changes", async () => {
    render(<BusinessSection profile={makeProfile()} />);
    const user = await openSheet();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateBusinessName).not.toHaveBeenCalled();
    expect(uploadBusinessImage).not.toHaveBeenCalled();
  });

  it("sends nothing on Cancel", async () => {
    render(<BusinessSection profile={makeProfile()} />);
    const user = await openSheet();

    await user.type(screen.getByLabelText("Business name"), " changed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateBusinessName).not.toHaveBeenCalled();
  });

  it("closes on the hardware back button instead of leaving the page, saving nothing", async () => {
    render(<BusinessSection profile={makeProfile()} />);
    const user = await openSheet();
    await user.type(screen.getByLabelText("Business name"), " changed");

    let handled = false;
    act(() => {
      handled = runBackInterceptors();
    });

    // Handled here, so the router never pops the Profile page underneath.
    expect(handled).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateBusinessName).not.toHaveBeenCalled();
  });

  it("leaves the back button to the router when the sheet is closed", () => {
    render(<BusinessSection profile={makeProfile()} />);
    expect(runBackInterceptors()).toBe(false);
  });

  it("refuses a blank name", async () => {
    render(<BusinessSection profile={makeProfile()} />);
    const user = await openSheet();

    await user.clear(screen.getByLabelText("Business name"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Please enter your business name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toHaveAttribute("aria-invalid", "true");
    expect(updateBusinessName).not.toHaveBeenCalled();
  });
});
