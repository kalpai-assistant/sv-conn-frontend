/**
 * en, hi and mr must have identical keys in every namespace (SVC-375).
 *
 * A key only in English renders English inside a Hindi screen, which reads as
 * a bug to the Pro; a key only in hi/mr is copy nobody can reach. Both are
 * invisible in review — the JSON diff looks fine — so this test is where they
 * surface.
 */
import { describe, expect, it } from "vitest";
import { NAMESPACES, resources } from "./index";
import { LANGUAGES } from "./languages";

function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation key parity", () => {
  for (const ns of NAMESPACES) {
    const english = flatten(resources.en[ns]).sort();

    for (const lang of LANGUAGES.filter((l) => l !== "en")) {
      it(`${lang}/${ns}.json has exactly the English keys`, () => {
        expect(flatten(resources[lang][ns]).sort()).toEqual(english);
      });
    }
  }

  it("has no empty strings in any language", () => {
    for (const lang of LANGUAGES) {
      for (const ns of NAMESPACES) {
        const empty = flatten(resources[lang][ns]).filter((path) => {
          const leaf = path
            .split(".")
            .reduce<unknown>(
              (node, key) => (node as Record<string, unknown> | undefined)?.[key],
              resources[lang][ns],
            );
          return typeof leaf === "string" && leaf.trim() === "";
        });
        expect(empty, `${lang}/${ns}`).toEqual([]);
      }
    }
  });
});
