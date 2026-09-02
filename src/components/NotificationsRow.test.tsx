/**
 * SVC-255 — what the notifications row says when push can't work.
 *
 * These tests carry more weight than usual. The `unsupported` branch is the one
 * the ticket is actually about, and it is **unreachable from an Android
 * device**: `getPushPermission()` only returns it for iOS Safari, in-app
 * browsers and private tabs. Every other state in this component was verified
 * by hand on a phone; this one cannot be, so unit coverage is the only
 * verification it has.
 *
 * The load-bearing assertions are therefore that the row *renders at all* when
 * push is unavailable, and that it names the right remedy for the right
 * platform. Before SVC-255 it returned null and the provider saw nothing.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPushPermission = vi.fn();
const enablePushNotifications = vi.fn();
const detectPlatform = vi.fn();
const toastFn = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/fcm", () => ({
  getPushPermission: () => getPushPermission(),
  enablePushNotifications: () => enablePushNotifications(),
}));

vi.mock("@/lib/platform", () => ({
  detectPlatform: () => detectPlatform(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastFn(...args), {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  }),
}));

import { NotificationsRow } from "@/components/NotificationsRow";

/** Defaults to desktop; individual tests override for the iOS cases. */
function platform(over: Partial<ReturnType<typeof basePlatform>> = {}) {
  detectPlatform.mockReturnValue({ ...basePlatform(), ...over });
}

function basePlatform() {
  return { platform: "desktop", isSafari: false, isChromeIOS: false, isIosStandalone: false };
}

describe("NotificationsRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform();
  });

  describe("states that were already verified on a device", () => {
    it("reads On, in green, when push is granted", async () => {
      getPushPermission.mockResolvedValue("granted");
      render(<NotificationsRow />);

      const status = await screen.findByText("On");
      expect(status).toHaveClass("text-emerald-600");
    });

    it("reads Blocked, in the destructive colour, when permission was denied", async () => {
      getPushPermission.mockResolvedValue("denied");
      render(<NotificationsRow />);

      const status = await screen.findByText("Blocked");
      expect(status).toHaveClass("text-destructive");
    });

    it("leaves Enable neutral — nothing has gone wrong yet", async () => {
      getPushPermission.mockResolvedValue("prompt");
      render(<NotificationsRow />);

      const status = await screen.findByText("Enable");
      expect(status).toHaveClass("text-muted-foreground");
    });
  });

  describe("unsupported — the branch SVC-255 exists for", () => {
    it("renders at all, rather than vanishing", async () => {
      // The regression that matters. This returned null before SVC-255, so an
      // iPhone provider saw no row, no status and no explanation.
      getPushPermission.mockResolvedValue("unsupported");
      platform({ platform: "ios", isSafari: true });

      render(<NotificationsRow />);

      expect(await screen.findByText(/notifications/i)).toBeInTheDocument();
    });

    it("names the remedy on iOS Safari before the site is installed", async () => {
      getPushPermission.mockResolvedValue("unsupported");
      platform({ platform: "ios", isSafari: true, isIosStandalone: false });

      render(<NotificationsRow />);

      // The status is the remedy, not the problem — "Unavailable" would be
      // true and useless when there is something the provider can do.
      expect(await screen.findByText("Add to Home Screen")).toBeInTheDocument();
    });

    it("explains the Share-menu steps when tapped", async () => {
      getPushPermission.mockResolvedValue("unsupported");
      platform({ platform: "ios", isSafari: true });
      const user = userEvent.setup();

      render(<NotificationsRow />);
      await user.click(await screen.findByRole("button"));

      await waitFor(() => expect(toastFn).toHaveBeenCalled());
      expect(String(toastFn.mock.calls[0][1]?.description)).toMatch(/share/i);
    });

    it("sends Chrome-on-iOS to Safari first, because it cannot install", async () => {
      getPushPermission.mockResolvedValue("unsupported");
      platform({ platform: "ios", isChromeIOS: true });
      const user = userEvent.setup();

      render(<NotificationsRow />);
      // Telling a Chrome-on-iOS user to "Add to Home Screen" would be a dead
      // end — the option does not exist there.
      expect(await screen.findByText("Unavailable")).toBeInTheDocument();

      await user.click(screen.getByRole("button"));
      await waitFor(() => expect(toastFn).toHaveBeenCalled());
      expect(String(toastFn.mock.calls[0][0])).toMatch(/safari/i);
    });

    it("says so plainly where nothing can be done", async () => {
      getPushPermission.mockResolvedValue("unsupported");
      platform({ platform: "desktop" });
      const user = userEvent.setup();

      render(<NotificationsRow />);
      expect(await screen.findByText("Unavailable")).toBeInTheDocument();

      await user.click(screen.getByRole("button"));
      await waitFor(() => expect(toastError).toHaveBeenCalled());
    });

    it("colours Unavailable as a problem, since the outcome is no alerts", async () => {
      getPushPermission.mockResolvedValue("unsupported");
      platform({ platform: "desktop" });

      render(<NotificationsRow />);

      expect(await screen.findByText("Unavailable")).toHaveClass("text-destructive");
    });
  });

  it("renders nothing while the permission is still being read", () => {
    // A pending promise: the row must not flash a wrong state for a frame.
    getPushPermission.mockReturnValue(new Promise(() => {}));
    const { container } = render(<NotificationsRow />);

    expect(container).toBeEmptyDOMElement();
  });
});
