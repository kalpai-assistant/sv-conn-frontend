import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { router as appRouter } from "@/router";

function renderAt(path: string) {
  const router = createRouter({
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("admin app scaffold", () => {
  it("renders the login placeholder at /login", async () => {
    renderAt("/login");
    expect(await screen.findByRole("heading", { name: /eazyserv admin/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue/i })).toBeInTheDocument();
  });

  it("renders the operator page inside the authed layout at /operator", async () => {
    renderAt("/operator");
    expect(await screen.findByRole("heading", { name: /^operator$/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  });

  it("redirects / to /operator", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: /^operator$/i })).toBeInTheDocument();
  });
});
