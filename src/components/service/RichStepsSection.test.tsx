/**
 * Step-card icon mapping (SVC-392 → SVC-402).
 *
 * `icon` is a free-form backend string; the section maps known keywords to
 * Lucide icons and falls back to Sparkles. Lucide stamps each icon's kebab
 * name on the svg as `lucide-<name>`, so the class is the assertion.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RichStepsSection } from "@/components/service/RichStepsSection";

const iconFor = (icon: string | undefined) => {
  const { container } = render(<RichStepsSection steps={[{ title: "Step", icon }]} />);
  return container.querySelector("article svg")!;
};

describe("RichStepsSection step icons", () => {
  // SVC-402's trade keywords, beyond the original cleaning set.
  it.each([
    ["wrench", "lucide-wrench"],
    ["pipe", "lucide-wrench"],
    ["zap", "lucide-zap"],
    ["plug", "lucide-plug"],
    ["fan", "lucide-fan"],
    ["snowflake", "lucide-snowflake"],
    ["bug", "lucide-bug"],
    ["spray", "lucide-spray-can"],
    ["hammer", "lucide-hammer"],
    ["drill", "lucide-drill"],
    ["paint", "lucide-paint-roller"],
    ["brush", "lucide-paintbrush"],
    ["scissors", "lucide-scissors"],
    ["washing", "lucide-washing-machine"],
  ])("maps '%s' to %s", (keyword, iconClass) => {
    expect(iconFor(keyword)).toHaveClass(iconClass);
  });

  it("still maps the original keywords", () => {
    expect(iconFor("bath")).toHaveClass("lucide-bath");
  });

  it("matches keywords case-insensitively", () => {
    expect(iconFor("Wrench")).toHaveClass("lucide-wrench");
  });

  it("falls back to Sparkles for an unknown or missing keyword", () => {
    expect(iconFor("teleport")).toHaveClass("lucide-sparkles");
    expect(iconFor(undefined)).toHaveClass("lucide-sparkles");
  });
});
