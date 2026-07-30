import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouterErrorFallback } from "./components/RouterErrorFallback";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouterErrorFallback,
  });

  return router;
};
