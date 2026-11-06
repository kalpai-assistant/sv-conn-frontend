import { createRouter } from "@tanstack/react-router";
import { setSessionLostHandler } from "./lib/api";
import { routeTree } from "./routeTree.gen";

export function getRouter(options: Partial<Parameters<typeof createRouter>[0]> = {}) {
  const router = createRouter({ routeTree, ...options });
  // A session can end under any screen. Sending the user to /login is the
  // router's job, so api.ts only reports it.
  setSessionLostHandler(() => {
    void router.navigate({ to: "/login", search: { reason: "session_expired" } });
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
