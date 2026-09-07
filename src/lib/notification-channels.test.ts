/**
 * Job-request notification channel (SVC-278 issue 6).
 *
 * Two failures worth catching here, and neither shows up on screen:
 *
 * - **Calling createChannel on iOS or the web.** There is no channel concept
 *   there; the plugin call throws, and this runs inside push registration, so
 *   an unguarded call would cost a provider their notifications entirely to
 *   add a sound.
 * - **The channel id drifting from what the backend sends.** Android files a
 *   notification against the id in the payload; if that id names no channel,
 *   it silently lands on the default one with the default sound — exactly the
 *   bug this is meant to fix, with all the code apparently in place.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const createChannel = vi.fn();
const deleteChannel = vi.fn();
let platform = "android";
let native = true;

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native,
    getPlatform: () => platform,
  },
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: { createChannel, deleteChannel },
}));

import { JOB_REQUEST_CHANNEL_ID, ensureJobRequestChannel } from "@/lib/notification-channels";

beforeEach(() => {
  vi.clearAllMocks();
  platform = "android";
  native = true;
  createChannel.mockResolvedValue(undefined);
  deleteChannel.mockResolvedValue(undefined);
});

describe("on android", () => {
  it("creates the channel the backend targets", async () => {
    await ensureJobRequestChannel();

    expect(createChannel).toHaveBeenCalledOnce();
    expect(createChannel.mock.calls[0][0]).toMatchObject({ id: JOB_REQUEST_CHANNEL_ID });
  });

  it("asks for the custom sound, which is the whole point", async () => {
    await ensureJobRequestChannel();

    // Bare name, no extension: the plugin appends it when resolving res/raw.
    expect(createChannel.mock.calls[0][0].sound).toBe("job_request");
  });

  it("is important enough to interrupt", async () => {
    await ensureJobRequestChannel();

    // Below 4 Android shows no heads-up and, below 3, may play no sound at
    // all — which would leave a provider exactly as unaware as before.
    expect(createChannel.mock.calls[0][0].importance).toBeGreaterThanOrEqual(4);
  });
});

describe("everywhere else", () => {
  it("does nothing on iOS", async () => {
    platform = "ios";
    await ensureJobRequestChannel();
    expect(createChannel).not.toHaveBeenCalled();
  });

  it("does nothing on the web", async () => {
    native = false;
    platform = "web";
    await ensureJobRequestChannel();
    expect(createChannel).not.toHaveBeenCalled();
  });
});

describe("when the plugin fails", () => {
  it("never throws — a missing sound must not cost a provider their pushes", async () => {
    // This runs inside push registration. Rejecting here would abort
    // `register()`, so a provider would receive no job notifications at all
    // rather than ones with the wrong sound.
    createChannel.mockRejectedValue(new Error("no such method"));

    await expect(ensureJobRequestChannel()).resolves.toBeUndefined();
  });
});

describe("the immutability trap", () => {
  it("versions the channel id", async () => {
    // Android freezes a channel's sound and importance at creation: later
    // changes are ignored forever on that install, and only the user can
    // alter them. A new id is the only way to ship new defaults, so the id
    // must carry a version to bump. Without this, changing the sound above
    // would work on a clean install, pass review, and do nothing on every
    // device that already had the app.
    expect(JOB_REQUEST_CHANNEL_ID).toMatch(/_v\d+$/);
  });
});
