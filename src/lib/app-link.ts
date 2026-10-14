/**
 * Opening an App Link's page in the native app (SVC-354).
 *
 * The manifest claims `https://app.eazyserv.com` (SVC-343), so tapping the
 * invite SMS's link opens the app — but Capacitor always loads its own start
 * page, and nothing read the link. Found on device: an invitee landed on home
 * (an owner on /provider), never on /invite. This hands the link's path to
 * the router.
 *
 * Only the routing is ours. Whether Android opens the app for the link at all
 * is App Link verification (assetlinks.json + the release signing cert), which
 * a debug build cannot exercise.
 *
 * The root gate still decides what the path shows: a signed-out visitor on
 * /invite gets the invite sign-in, an owner gets the business-account screen.
 */

export const APP_LINK_HOST = "app.eazyserv.com";

/**
 * The in-app path an App Link should open, or null to leave the app where it
 * is. Our own https host only, exactly; path and query kept. The root is null:
 * it is where the app opens anyway.
 */
export function appLinkPath(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== APP_LINK_HOST) return null;
  const path = parsed.pathname + parsed.search;
  return path === "/" ? null : path;
}

/**
 * How long a cold start waits for its URL's replay before treating a matching
 * `appUrlOpen` as a real tap. The replay is a retained event, delivered the
 * moment the listener registers, so this is generous; it exists so a platform
 * that never replays can't swallow the next tap of the same link.
 */
export const LAUNCH_REPLAY_WINDOW_MS = 2000;

/** The slice of `@capacitor/app`'s `App` this needs; injected for tests. */
export interface AppLinkSource {
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  addListener(
    event: "appUrlOpen",
    listener: (event: { url: string }) => void,
  ): Promise<{ remove: () => unknown }>;
}

/**
 * Open the link the app was launched from, then any tapped while it runs.
 * Resolves to a function that stops listening.
 *
 * A cold start's URL arrives twice: `getLaunchUrl`, and again as a retained
 * `appUrlOpen` — `BridgeActivity.onCreate` passes the launch intent through
 * `onNewIntent`, which the App plugin turns into the event. The first event
 * matching the launch URL is that replay and is skipped; a later tap on the
 * same link is a real one and opens it. The skip lapses after
 * `LAUNCH_REPLAY_WINDOW_MS`, in case no replay comes.
 */
export async function startAppLinks(
  app: AppLinkSource,
  navigate: (path: string) => void,
): Promise<() => void> {
  const open = (url: string | undefined) => {
    const path = appLinkPath(url);
    if (path) navigate(path);
  };

  // Read before listening, so the replay can be recognised when it lands.
  let launchReplay: string | null = null;
  try {
    const launch = await app.getLaunchUrl();
    if (launch?.url) {
      launchReplay = launch.url;
      open(launch.url);
    }
  } catch {
    // No launch URL to be had: carry on with links tapped from here.
  }

  const handle = await app.addListener("appUrlOpen", ({ url }) => {
    if (launchReplay !== null && url === launchReplay) {
      launchReplay = null;
      return;
    }
    open(url);
  });
  const lapse =
    launchReplay === null ? null : setTimeout(() => (launchReplay = null), LAUNCH_REPLAY_WINDOW_MS);
  return () => {
    if (lapse !== null) clearTimeout(lapse);
    void handle.remove();
  };
}
