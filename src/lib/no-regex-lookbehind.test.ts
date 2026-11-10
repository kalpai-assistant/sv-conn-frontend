/**
 * No regex lookbehind in the consumer app's source.
 *
 * The iOS app's minimum is 15.0 (IPHONEOS_DEPLOYMENT_TARGET in
 * ios/App/App.xcodeproj), and WKWebView parses lookbehind only from iOS 16.4. In
 * a regex literal it's a SyntaxError when the module is parsed, so the whole
 * module, and every screen importing it, fails to load on iOS 15.0–16.3. Check
 * the neighbouring characters in a replace callback instead (as
 * lib/markdown-text.ts does).
 *
 * Tests are exempt (they run in Node), and so is the admin app (desktop only).
 * The pattern is built from pieces so this file doesn't match itself.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const LOOKBEHIND = new RegExp(["\\(\\?<", "[=!]"].join(""));

function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file));
}

describe("regex lookbehind", () => {
  it("scans the app's source", () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it("is never used: iOS 15.0–16.3's WKWebView can't parse it", () => {
    const offenders = sourceFiles().flatMap((file) =>
      readFileSync(path.join(SRC, file), "utf-8")
        .split("\n")
        .flatMap((line, index) => (LOOKBEHIND.test(line) ? [`src/${file}:${index + 1}`] : [])),
    );
    expect(
      offenders,
      "Regex lookbehind fails to parse on iOS 15.0–16.3 (WKWebView supports it from 16.4); " +
        "check the neighbouring characters in a replace callback instead.",
    ).toEqual([]);
  });
});
