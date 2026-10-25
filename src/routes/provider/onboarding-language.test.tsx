/**
 * The first-run language prompt at the start of SP onboarding (SVC-376).
 *
 * A new SP (i18n_enabled, no language chosen) lands on /provider/onboarding
 * and is asked before doing anything; the wizard then renders in what they
 * picked. Picking must not move them: the step, and what they typed, stay —
 * the wizard re-renders from context rather than remounting. The real
 * LanguageProvider, prompt and sheet are used; only the network and the
 * router are stubbed.
 */
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { authState, apiFetch, mutation } = vi.hoisted(() => ({
  authState: {
    user: {
      id: "sp-new",
      name: "Rohan Kumar",
      i18n_enabled: true,
      preferred_language: null as string | null,
    },
  },
  apiFetch: vi.fn(),
  mutation: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
}));

vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: { kyc_status: "pending", business_name: null } }),
  useUpdateName: mutation,
  useUpdateLanguages: mutation,
  useUploadPhoto: mutation,
  useUpdateBusinessName: mutation,
  useUploadBusinessImage: mutation,
  useSubmitKyc: mutation,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: authState.user,
    updateUser: (patch: Record<string, unknown>) => Object.assign(authState.user, patch),
  }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/camera", () => ({
  isNativePlatform: () => false,
  captureNativePhoto: vi.fn(),
  captureLivePhoto: vi.fn(),
}));
vi.mock("@/components/CameraCapture", () => ({
  CameraCapture: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: unknown }) => opts,
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/provider/onboarding" } }),
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
vi.mock("@/components/provider/ServicesPicker", () => ({ ServicesPicker: () => null }));
vi.mock("@/components/provider/PayoutStep", () => ({ PayoutStep: () => null }));
vi.mock("@/components/provider/ServiceAreaStep", () => ({ ServiceAreaStep: () => null }));

import { Route } from "@/routes/provider/onboarding";
import { FirstRunLanguagePrompt } from "@/components/language/FirstRunLanguagePrompt";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { getStoredLanguage, resetStoredLanguageForTests } from "@/i18n/language";

const Page = (Route as unknown as { component: () => ReactElement }).component;
const DRAFT_KEY = "provider-onboarding";

function renderOnboarding() {
  return render(
    <LanguageProvider>
      <Page />
      <FirstRunLanguagePrompt />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resetStoredLanguageForTests();
  authState.user.preferred_language = null;
  authState.user.i18n_enabled = true;
  apiFetch.mockResolvedValue(undefined);
  globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => resetStoredLanguageForTests());

describe("first-run language prompt at the start of onboarding", () => {
  it("asks a new SP before step 1, then shows step 1 in the chosen language", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    // Asked straight away, over an untouched step 1 that is still English.
    expect(await screen.findByText("Choose your language")).toBeInTheDocument();
    expect(screen.getByText("Tell us about you")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Hindi/ }));
    await user.click(screen.getByRole("button", { name: "आगे बढ़ें" }));

    await waitFor(() => expect(screen.getByText("अपने बारे में बताएँ")).toBeInTheDocument());
    expect(screen.getByText("चरण 1 / 5")).toBeInTheDocument();
    expect(screen.queryByText("Tell us about you")).not.toBeInTheDocument();
    expect(getStoredLanguage()).toBe("hi");
    expect(apiFetch).toHaveBeenCalledWith(
      "/users/me/language",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("keeps the step and what was typed when the language changes", async () => {
    // A provider who left mid-wizard comes back on step 2 with a saved draft.
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 2, name: "Rohan Kumar", languages: ["Marathi"], businessName: "RK" }),
    );
    const user = userEvent.setup();
    renderOnboarding();

    expect(await screen.findByText("Choose your language")).toBeInTheDocument();
    expect(screen.getByText("Verify your identity")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Marathi/ }));
    await user.click(screen.getByRole("button", { name: "पुढे चला" }));

    // Still step 2, now in Marathi; the draft is untouched.
    await waitFor(() => expect(screen.getByText("तुमची ओळख पडताळा")).toBeInTheDocument());
    expect(screen.getByText("पायरी 2 / 5")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}")).toEqual({
      step: 2,
      name: "Rohan Kumar",
      languages: ["Marathi"],
      businessName: "RK",
    });
  });

  it("never asks, and stays English, while i18n_enabled is off", async () => {
    authState.user.i18n_enabled = false;
    renderOnboarding();
    expect(await screen.findByText("Tell us about you")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.queryByText("Choose your language")).not.toBeInTheDocument();
  });
});
