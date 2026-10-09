/**
 * SVC-323 added `/provider/team/$professionalId/earnings` beside the static
 * `/provider/team/invite`. Matched against the real generated tree, so a
 * dynamic segment can never swallow the invite screen.
 */
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";

const router = createRouter({ routeTree, history: createMemoryHistory() });
const leaf = (path: string) => router.matchRoutes(path, {}).at(-1)?.routeId;

describe("My Team's routes", () => {
  it("still sends /provider/team/invite to the invite screen", () => {
    expect(leaf("/provider/team/invite")).toBe("/provider/team/invite");
  });

  it("sends a Pro's id to their earnings", () => {
    expect(leaf("/provider/team/3f1c/earnings")).toBe("/provider/team/$professionalId/earnings");
  });

  it("leaves /provider/team on the team list", () => {
    expect(leaf("/provider/team")).toBe("/provider/team/");
  });
});
