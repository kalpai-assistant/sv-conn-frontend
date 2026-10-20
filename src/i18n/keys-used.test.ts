/**
 * Every key the translated screens ask for exists (SVC-375).
 *
 * i18next renders a missing key as the key itself — `jobs.emtpyTitle` on a
 * Pro's screen — and a typo there passes typecheck, lint and the parity test
 * (which compares the JSON files with each other, not with the code). This
 * reads the source of each translated file and checks each literal key
 * against the English resources; parity then carries it to hi and mr.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";
import { resources } from "./index";

const SRC = join(process.cwd(), "src");

const files = globSync(
  [
    "routes/pro/**/*.tsx",
    "components/pro/**/*.tsx",
    "components/language/**/*.tsx",
    "components/provider/JobActions.tsx",
    "components/provider/JobAddress.tsx",
    "lib/job-status.ts",
    "lib/pro-kyc.ts",
    "lib/pro-location.ts",
    "lib/pro-decline.ts",
    "components/BottomNav.tsx",
    "components/LogoutButton.tsx",
    "components/DeleteAccountButton.tsx",
    "components/NotificationsRow.tsx",
    "components/LocationGate.tsx",
    "components/LocationGateHost.tsx",
  ],
  { cwd: SRC, ignore: ["**/*.test.{ts,tsx}"] },
);

function has(tree: unknown, path: string): boolean {
  let node = tree;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

describe("translation keys used by the translated screens", () => {
  it("covers the files it should", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    it(`${file} asks only for keys that exist`, () => {
      const source = readFileSync(join(SRC, file), "utf8");
      // t("…"), tc("…"), getFixedT(…)("…"). Template keys (jobStatus.${…}) are
      // checked by job-status.test instead.
      const keys = [...source.matchAll(/\bt[c]?\(\s*"([A-Za-z0-9_.]+)"/g)].map((m) => m[1]);
      // A plural key is stored as key_one / key_other and asked for bare.
      const exists = (key: string) =>
        [key, `${key}_other`].some((k) => has(resources.en.common, k) || has(resources.en.pro, k));
      const missing = keys.filter((key) => !exists(key));
      expect(missing).toEqual([]);
    });
  }
});
