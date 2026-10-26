/**
 * The shared pieces a provider or Pro meets on their own screens, in Hindi
 * and Marathi (SVC-375): the sign-out button and its online warning, and the
 * service-area location gate. English is covered by each component's own
 * tests, which run unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useApi", () => ({ useSetOnlineStatus: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/geolocation", () => ({
  requestLocation: vi.fn(),
  enableDeviceLocation: vi.fn(),
  peekLocationPermission: () => Promise.resolve("prompt"),
  isNativeLocation: () => true,
  peekBrowserPermission: vi.fn(),
}));
vi.mock("@/lib/open-app-settings", () => ({
  canOpenAppSettings: () => true,
  openAppSettings: vi.fn(),
}));

import { LogoutButton } from "@/components/LogoutButton";
import { LocationGate } from "@/components/LocationGate";
import { FixedLanguage } from "@/i18n/LanguageProvider";

const RAW_KEY = /\b[a-z]+[A-Za-z]*\.[a-z][A-Za-z_]+\b/;
const gateProps = {
  saved: [{ id: "service-area", label: "Kharadi", full: "Within 10 km" }],
  onConfirmSaved: vi.fn(),
  onUseCurrent: vi.fn(),
  onEnterManually: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

const COPY = {
  hi: { logout: "लॉग आउट", stay: "साइन इन रहें", gateTitle: "आपके फ़ोन की लोकेशन बंद है" },
  mr: { logout: "लॉग आउट", stay: "साइन इन राहा", gateTitle: "तुमच्या फोनचे लोकेशन बंद आहे" },
} as const;

describe.each(["hi", "mr"] as const)("shared pieces in %s", (lang) => {
  it("translates Logout and the online warning", () => {
    render(
      <FixedLanguage lang={lang}>
        <LogoutButton isOnline />
      </FixedLanguage>,
    );
    fireEvent.click(screen.getByRole("button", { name: COPY[lang].logout }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(COPY[lang].stay);
    expect(dialog.textContent).not.toMatch(/Sign out|Stay signed in|You're online/);
    expect(dialog.textContent).not.toMatch(RAW_KEY);
  });

  it("translates the location gate, leaving the saved place as typed", () => {
    render(
      <FixedLanguage lang={lang}>
        <LocationGate reason="device-off" {...gateProps} />
      </FixedLanguage>,
    );
    expect(screen.getByRole("heading", { name: COPY[lang].gateTitle })).toBeInTheDocument();
    expect(screen.getByText("Kharadi")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(RAW_KEY);
    expect(text).not.toMatch(/Enable|Enter address manually|Use my current location|Open settings/);
  });

  it("translates the offline screen", () => {
    render(
      <FixedLanguage lang={lang}>
        <LocationGate reason="device-off" {...gateProps} offline onRetry={vi.fn()} />
      </FixedLanguage>,
    );
    expect(document.body.textContent).not.toMatch(/You're offline|Try again/);
    expect(document.body.textContent).not.toMatch(RAW_KEY);
  });
});
