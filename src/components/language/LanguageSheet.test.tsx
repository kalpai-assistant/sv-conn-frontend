import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateUser = vi.fn();
const useAuth = vi.fn();
const apiFetch = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => useAuth() }));
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

import { LanguageSheet } from "./LanguageSheet";
import { getStoredLanguage, resetStoredLanguageForTests } from "@/i18n/language";

beforeEach(() => {
  vi.clearAllMocks();
  resetStoredLanguageForTests();
  useAuth.mockReturnValue({
    user: { id: "u1", i18n_enabled: true, preferred_language: null },
    updateUser,
  });
});
afterEach(() => resetStoredLanguageForTests());

function open(onOpenChange = vi.fn()) {
  render(<LanguageSheet open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

describe("LanguageSheet", () => {
  it("offers the three languages, each in its own script with the English name", () => {
    open();
    const tiles = screen
      .getAllByRole("button", { pressed: undefined })
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(tiles.map((t) => t.textContent)).toEqual([
      expect.stringContaining("English"),
      expect.stringMatching(/हिन्दी.*Hindi/),
      expect.stringMatching(/मराठी.*Marathi/),
    ]);
    expect(tiles[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("speaks the highlighted language before it is committed", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: /Marathi/ }));
    expect(screen.getByText("तुमची भाषा निवडा")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "पुढे चला" })).toBeInTheDocument();
    // Nothing saved by a tap alone.
    expect(apiFetch).not.toHaveBeenCalled();
    expect(getStoredLanguage()).toBeNull();
  });

  it("saves to PATCH /users/me/language and the device on Continue", async () => {
    apiFetch.mockResolvedValue(undefined);
    const onOpenChange = open();
    await userEvent.click(screen.getByRole("button", { name: /Hindi/ }));
    await userEvent.click(screen.getByRole("button", { name: "आगे बढ़ें" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiFetch).toHaveBeenCalledWith("/users/me/language", {
      method: "PATCH",
      body: JSON.stringify({ language: "hi" }),
    });
    expect(updateUser).toHaveBeenCalledWith({ preferred_language: "hi" });
    expect(getStoredLanguage()).toBe("hi");
  });

  it("keeps the device's choice when the save fails, and says so in that language", async () => {
    apiFetch.mockRejectedValue(new Error("offline"));
    const onOpenChange = open();
    await userEvent.click(screen.getByRole("button", { name: /Marathi/ }));
    await userEvent.click(screen.getByRole("button", { name: "पुढे चला" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(getStoredLanguage()).toBe("mr");
    expect(updateUser).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "तुमची भाषा सेव्ह होऊ शकली नाही. सध्या ती या फोनवर सेट आहे.",
    );
  });
});
