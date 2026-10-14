/**
 * Opening an App Link's page in the native app (SVC-354). Pinned: only our own
 * https host counts, the path and query survive, and a cold start's URL —
 * which Capacitor hands over twice — is opened once.
 */
import { describe, expect, it, vi } from "vitest";
import { LAUNCH_REPLAY_WINDOW_MS, appLinkPath, startAppLinks } from "@/lib/app-link";

describe("appLinkPath", () => {
  it("takes the path of an invite link", () => {
    expect(appLinkPath("https://app.eazyserv.com/invite")).toBe("/invite");
  });

  it("keeps the query", () => {
    expect(appLinkPath("https://app.eazyserv.com/tracking/abc?from=sms")).toBe(
      "/tracking/abc?from=sms",
    );
  });

  it.each([
    ["another host", "https://evil.example.com/invite"],
    ["a lookalike host", "https://app.eazyserv.com.evil.example/invite"],
    ["the marketing site", "https://eazyserv.com/invite"],
    ["plain http", "http://app.eazyserv.com/invite"],
    ["another scheme", "eazyserv://invite"],
    ["garbage", "not a url"],
    ["nothing", undefined],
    ["the root, which is where the app opens anyway", "https://app.eazyserv.com/"],
    ["the bare host", "https://app.eazyserv.com"],
  ])("ignores %s", (_case, url) => {
    expect(appLinkPath(url)).toBeNull();
  });
});

describe("startAppLinks", () => {
  function fakeApp(launchUrl?: string) {
    let listener: ((event: { url: string }) => void) | null = null;
    const remove = vi.fn();
    return {
      remove,
      fire: (url: string) => listener?.({ url }),
      app: {
        getLaunchUrl: vi.fn().mockResolvedValue(launchUrl ? { url: launchUrl } : undefined),
        addListener: vi.fn(async (_event: "appUrlOpen", cb: (event: { url: string }) => void) => {
          listener = cb;
          return { remove };
        }),
      },
    };
  }

  it("opens the link the app was launched from", async () => {
    const fake = fakeApp("https://app.eazyserv.com/invite");
    const navigate = vi.fn();
    await startAppLinks(fake.app, navigate);
    expect(navigate).toHaveBeenCalledWith("/invite");
  });

  it("opens it once, though Capacitor also replays it as appUrlOpen (found in BridgeActivity)", async () => {
    const fake = fakeApp("https://app.eazyserv.com/invite");
    const navigate = vi.fn();
    await startAppLinks(fake.app, navigate);
    fake.fire("https://app.eazyserv.com/invite");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("opens a link tapped while the app is running", async () => {
    const fake = fakeApp();
    const navigate = vi.fn();
    await startAppLinks(fake.app, navigate);
    fake.fire("https://app.eazyserv.com/invite");
    expect(navigate).toHaveBeenCalledWith("/invite");
  });

  it("opens the same link again on a later tap", async () => {
    const fake = fakeApp("https://app.eazyserv.com/invite");
    const navigate = vi.fn();
    await startAppLinks(fake.app, navigate);
    fake.fire("https://app.eazyserv.com/invite"); // the replay
    fake.fire("https://app.eazyserv.com/invite"); // a real second tap
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for the replay after a moment, so a platform that never sends one doesn't swallow a real tap", async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeApp("https://app.eazyserv.com/invite");
      const navigate = vi.fn();
      await startAppLinks(fake.app, navigate);
      vi.advanceTimersByTime(LAUNCH_REPLAY_WINDOW_MS);
      fake.fire("https://app.eazyserv.com/invite"); // a real tap, no replay ever came
      expect(navigate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves an ordinary launch, and foreign links, where they are", async () => {
    const fake = fakeApp();
    const navigate = vi.fn();
    await startAppLinks(fake.app, navigate);
    fake.fire("https://evil.example.com/invite");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("hands back a way to stop listening", async () => {
    const fake = fakeApp();
    const stop = await startAppLinks(fake.app, vi.fn());
    stop();
    expect(fake.remove).toHaveBeenCalled();
  });
});
