/**
 * Android back closes the install sheet rather than leaving the route under
 * it (SVC-484 side fix; the sheet opens from Profile's Notifications row and
 * from Notify me).
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { InstallSheet } from "@/components/InstallSheet";
import { runBackInterceptors } from "@/lib/back-interceptor";

describe("InstallSheet and the back button", () => {
  it("closes on back while open", () => {
    const onOpenChange = vi.fn();
    render(<InstallSheet open onOpenChange={onOpenChange} state="ios-manual" />);
    expect(runBackInterceptors()).toBe(true);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("claims nothing while closed", () => {
    const onOpenChange = vi.fn();
    render(<InstallSheet open={false} onOpenChange={onOpenChange} state="ios-manual" />);
    expect(runBackInterceptors()).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("lets go once it closes", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <InstallSheet open onOpenChange={onOpenChange} state="ios-manual" />,
    );
    rerender(<InstallSheet open={false} onOpenChange={onOpenChange} state="ios-manual" />);
    expect(runBackInterceptors()).toBe(false);
  });
});
