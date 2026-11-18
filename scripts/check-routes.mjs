#!/usr/bin/env node
/**
 * check-routes — fails CI if `src/routeTree.gen.ts` is stale (SVC-476).
 *
 * `@tanstack/router-plugin` regenerates the tree during `vite dev` / `vite
 * build`. If someone adds a route file but forgets to commit the regenerated
 * tree — or resolves a merge conflict in favour of a stale version — the new
 * route silently 404s in prod. CI doesn't catch this today. This guard runs
 * the generator in-process and diffs the result against the committed tree.
 *
 * Failure mode caught: a PR that adds a route file at `src/routes/foo.tsx`
 * but ships the old `routeTree.gen.ts`. Symptomatically identical to the
 * `check:assets` four-week outage (SVC-286) at the asset layer.
 *
 * Exit 0 if the tree is up-to-date; exit 1 with instructions if not.
 */
import { Generator, getConfig } from "@tanstack/router-generator";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROUTE_TREE = resolve(process.cwd(), "src/routeTree.gen.ts");
const ROUTES_DIR = resolve(process.cwd(), "src/routes");

const original = await readFile(ROUTE_TREE, "utf-8");

// Snapshot so we can restore on drift — CI doesn't care (fresh checkout per
// run) but local invocations do: a developer running `npm run check:routes`
// to validate before pushing must not have their working tree silently
// mutated.
async function restore() {
  await writeFile(ROUTE_TREE, original, "utf-8");
}

try {
  const config = getConfig({
    routesDirectory: ROUTES_DIR,
    generatedRouteTree: ROUTE_TREE,
    target: "react",
    // Silence the generator's own logger so CI output stays signal-only.
    disableLogging: true,
    // Match the footer injected by `@tanstack/react-start` via
    // `@lovable.dev/vite-tanstack-config`. Without this the generated tree
    // ends after `_addFileTypes` and the committed version's SSR Register
    // augmentation shows as persistent drift (nothing to do with routes).
    //
    // The generator joins array entries with "\n", so each array element is
    // one output line. If Start's footer shape changes, update here in
    // lockstep — see `src/routeTree.gen.ts` tail.
    routeTreeFileFooter: [
      `import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}`,
    ],
  });
  const generator = new Generator({ config, root: process.cwd() });
  await generator.run();
} catch (err) {
  await restore();
  console.error("[check-routes] generator failed:", err);
  process.exit(2);
}

const regenerated = await readFile(ROUTE_TREE, "utf-8");

if (regenerated === original) {
  console.log("[check-routes] src/routeTree.gen.ts is up to date.");
  process.exit(0);
}

// Drift detected. Restore the committed version so the working tree is
// unchanged, then fail with an actionable message. Reviewer will see exactly
// which routes changed.
await restore();

console.error("");
console.error("❌ src/routeTree.gen.ts is stale.");
console.error("");
console.error("The generator produced different content than what's committed.");
console.error("A route file was likely added, renamed, or deleted without regenerating the tree.");
console.error("");
console.error("Fix:");
console.error("  1. npm run dev   # or: vite build — either triggers @tanstack/router-plugin");
console.error("  2. git add src/routeTree.gen.ts");
console.error("  3. commit + push");
console.error("");
process.exit(1);
