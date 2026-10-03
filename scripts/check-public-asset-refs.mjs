#!/usr/bin/env node
/**
 * Catches dead public-asset references in src/.
 *
 * The bug this guards against (hit 2026-10-03): an image path like
 * `/services/home-deep-cleaning.jpg` is referenced from src/ but missing
 * from public/. The browser request falls through to the SPA catch-all
 * in _redirects, returns index.html with HTTP 200, and the <img> tries
 * to render HTML as an image — no console error, no 404, just blank
 * space on the page. Nobody notices until a customer does.
 *
 * In this case the files were deleted by SVC-286 v2 (commit 7ba3bd1)
 * while the referencing SERVICES array in src/marketing/MarketingHome.tsx
 * was left untouched. The breakage lived in prod for ~four weeks before
 * someone looked closely. This script would have caught it the moment
 * the PR was opened.
 *
 * How it works: scan every `.ts` and `.tsx` file under src/ for string
 * literals that look like static asset paths (leading `/`, trailing
 * media extension), then verify each one resolves to an actual file
 * under public/. Fail the build when any reference is dead.
 *
 * False-positive risk is low:
 * - API routes (`/api/...`) have no media extension, so they're skipped.
 * - TanStack Router params (`/bookings/$id`) likewise have no extension.
 * - Dynamic paths (`` `/services/${slug}.jpg` ``) — the regex captures
 *   only up to `${`, which doesn't hit the extension check. Trade-off:
 *   dynamic refs are NOT verified. Acceptable; most asset refs are
 *   static anyway.
 *
 * If you ever hit a legitimate false positive, either add the file to
 * public/ (correct answer 99% of the time) or move the string out of
 * a literal into a computed variable the regex doesn't catch.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const PUBLIC = join(ROOT, "public");

// File extensions treated as "clearly a public asset." Deliberately NOT
// including .js / .json / .html / .xml / .webmanifest — those are too
// ambiguous (bundled chunks, API responses, SPA templates) and would
// cause false positives.
const ASSET_EXT = /\.(jpg|jpeg|png|webp|avif|svg|gif|ico|mp4|webm)$/i;

// Match any single-quoted / double-quoted / backtick string whose contents
// start with `/` and look like a path. Captured group is the path.
const PATH_RE = /["'`](\/[A-Za-z0-9][A-Za-z0-9._\-/]*)["'`]/g;

/** Yield every file under `dir` whose name matches `fileRE`. */
function* walk(dir, fileRE) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, fileRE);
    } else if (fileRE.test(entry.name)) {
      yield full;
    }
  }
}

const misses = [];
let scanned = 0;

for (const file of walk(SRC, /\.(tsx?|mts|cts)$/)) {
  scanned += 1;
  const content = readFileSync(file, "utf8");
  let m;
  while ((m = PATH_RE.exec(content)) !== null) {
    const path = m[1];
    if (!ASSET_EXT.test(path)) continue;
    const localPath = join(PUBLIC, path);
    const exists = existsSync(localPath) && statSync(localPath).isFile();
    if (!exists) {
      misses.push({ file: relative(ROOT, file), path });
    }
  }
}

if (misses.length === 0) {
  console.log(
    `✓ All public-asset references in ${scanned} src/ file${scanned === 1 ? "" : "s"} resolve.`,
  );
  process.exit(0);
}

console.error(`✗ Dead public-asset references found:\n`);
for (const { file, path } of misses) {
  console.error(`  ${file}  →  ${path}  (expected at public${path})`);
}
console.error(
  `\n${misses.length} missing asset${misses.length === 1 ? "" : "s"}.` +
    ` Fix: either add the file to public/, or correct the path in src/.\n` +
    ` Context: the SPA catch-all in _redirects silently serves index.html for\n` +
    ` any missing path, so dead refs render as blank <img> tags with no error.\n`,
);
process.exit(1);
