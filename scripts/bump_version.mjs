#!/usr/bin/env node
/**
 * Version-bump helper — keeps four things in sync on every release.
 *
 * Without this script, shipping a new build means editing four separate
 * places by hand (three files + two DB rows) and any one you miss makes
 * the version-check nudge fire on the fresh build, or shows the wrong
 * version in the /download page.
 *
 * Usage:
 *   node scripts/bump_version.mjs 1.0.1
 *   node scripts/bump_version.mjs 1.1.0-beta
 *
 * What it does (in this repo):
 *   1. android/app/build.gradle: `versionCode` +1, `versionName` = arg
 *   2. src/lib/version.ts: `APP_VERSION` = arg
 *
 * What it prints (for you to run against the backend DB):
 *   3. UPDATE app_versions row for `android`
 *   4. UPDATE app_versions row for `pwa`
 *
 * (The DB rows aren't touched from here because this repo can't reach
 * the backend DB — but the SQL is copy-pasteable into psql /
 * `alembic revision --autogenerate` or the admin API when it exists.)
 *
 * Idempotent: running with the current version is a no-op. Refuses to
 * downgrade — if the arg SemVer-compares as less than what's on disk,
 * bail before touching anything. Prevents "oh I meant 1.1 not 1.0.1"
 * from silently unshipping a fix.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const BUILD_GRADLE = resolve(REPO_ROOT, "android/app/build.gradle");
const VERSION_TS = resolve(REPO_ROOT, "src/lib/version.ts");

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// SemVer-lite compare. Handles "1.0.0", "1.0.0-beta", "1.2.3-rc.1". Returns
// negative / 0 / positive like a normal compare. `-beta` sorts before
// `-rc.1` sorts before `` (release). Adequate for our use — full SemVer
// spec is not worth pulling a dep for a bump script.
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = v.split("-", 2);
    const nums = core.split(".").map((n) => parseInt(n, 10));
    return { nums, pre: pre ?? "" };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // Same core version. A release (empty pre) is GREATER than any prerelease.
  if (pa.pre === "" && pb.pre !== "") return 1;
  if (pa.pre !== "" && pb.pre === "") return -1;
  return pa.pre.localeCompare(pb.pre);
}

function bumpBuildGradle(newVersion) {
  const src = readFileSync(BUILD_GRADLE, "utf8");
  const codeMatch = src.match(/versionCode\s+(\d+)/);
  const nameMatch = src.match(/versionName\s+"([^"]+)"/);
  if (!codeMatch || !nameMatch) {
    die(`Could not find versionCode / versionName in ${BUILD_GRADLE}`);
  }
  const oldCode = parseInt(codeMatch[1], 10);
  const oldName = nameMatch[1];
  const newCode = oldCode + 1;

  // Bail on downgrade BEFORE writing anything.
  if (compareVersions(newVersion, oldName) < 0) {
    die(
      `Refusing to downgrade versionName ${oldName} → ${newVersion}. ` +
        `If this is intentional, edit android/app/build.gradle manually.`,
    );
  }

  const updated = src
    .replace(/versionCode\s+\d+/, `versionCode ${newCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
  writeFileSync(BUILD_GRADLE, updated);
  return { oldCode, newCode, oldName, newName: newVersion };
}

function bumpVersionTs(newVersion) {
  const src = readFileSync(VERSION_TS, "utf8");
  const match = src.match(/APP_VERSION\s*=\s*"([^"]+)"/);
  if (!match) die(`Could not find APP_VERSION assignment in ${VERSION_TS}`);
  const oldValue = match[1];
  if (compareVersions(newVersion, oldValue) < 0) {
    die(
      `Refusing to downgrade APP_VERSION ${oldValue} → ${newVersion}. ` +
        `Edit src/lib/version.ts manually if intentional.`,
    );
  }
  const updated = src.replace(/APP_VERSION\s*=\s*"[^"]+"/, `APP_VERSION = "${newVersion}"`);
  writeFileSync(VERSION_TS, updated);
  return { oldValue, newValue: newVersion };
}

function printBackendInstructions(newVersion) {
  console.log("");
  console.log("─".repeat(70));
  console.log("Backend DB updates — copy-paste one of these:");
  console.log("─".repeat(70));
  console.log("");
  console.log("Option A — direct psql (once AWS is up):");
  console.log(`  UPDATE app_versions SET version = '${newVersion}',`);
  console.log(`    released_at = NOW() WHERE platform = 'android';`);
  console.log(`  UPDATE app_versions SET version = '${newVersion}',`);
  console.log(`    released_at = NOW() WHERE platform = 'pwa';`);
  console.log("");
  console.log("Option B — Alembic data migration (from backend repo):");
  console.log(`  uv run alembic revision -m "bump app_versions to ${newVersion}"`);
  console.log(`  # then paste the two UPDATEs above into upgrade()`);
  console.log("");
  console.log("If you're shipping a mandatory upgrade (force-block older");
  console.log("clients), ALSO set min_supported_version on the row(s) you");
  console.log("want to block. Otherwise leave it alone.");
  console.log("");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const [, , newVersion] = process.argv;
if (!newVersion) {
  console.log("Usage: node scripts/bump_version.mjs <new-version>");
  console.log("Example: node scripts/bump_version.mjs 1.0.1");
  process.exit(2);
}

if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(newVersion)) {
  die(`"${newVersion}" doesn't look like SemVer (expected e.g. 1.0.1, 1.1.0-beta, 2.0.0-rc.1)`);
}

const gradle = bumpBuildGradle(newVersion);
console.log(
  `✓ android/app/build.gradle: versionCode ${gradle.oldCode} → ${gradle.newCode}, versionName "${gradle.oldName}" → "${gradle.newName}"`,
);

const ts = bumpVersionTs(newVersion);
console.log(`✓ src/lib/version.ts: APP_VERSION "${ts.oldValue}" → "${ts.newValue}"`);

printBackendInstructions(newVersion);

console.log("Next steps:");
console.log("  1. git add + commit the two file changes");
console.log("  2. Run the SQL above against the backend DB");
console.log("  3. ./gradlew assembleRelease (from android/) — new APK");
console.log("  4. Upload the APK to S3, deploy the web/PWA");
console.log("");
