/**
 * SVC-329: the owners list is an index route so an owner's id resolves to
 * their page. As `admin.teams.tsx` the list would be the detail's parent, and
 * /admin/teams/<id> would render the list. Matched against the real tree.
 */
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";

const router = createRouter({ routeTree, history: createMemoryHistory() });
const matches = (path: string) => router.matchRoutes(path, {}).map((m) => m.routeId);

describe("admin teams routes", () => {
  it("sends an owner's id to the owner page, with no list route above it", () => {
    const ids = matches("/admin/teams/7b1e2c3d-0000-4000-8000-000000000001");
    expect(ids.at(-1)).toBe("/admin/teams/$spUserId");
    expect(ids).not.toContain("/admin/teams/");
  });

  it("leaves /admin/teams on the search list", () => {
    expect(matches("/admin/teams").at(-1)).toBe("/admin/teams/");
  });
});
