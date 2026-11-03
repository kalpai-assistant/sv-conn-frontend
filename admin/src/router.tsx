import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter(options: Partial<Parameters<typeof createRouter>[0]> = {}) {
  return createRouter({ routeTree, ...options });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
