import { describe, expect, it } from "vitest";
import { toPlainText } from "./markdown-text";

describe("toPlainText", () => {
  it("leaves plain text alone", () => {
    expect(toPlainText("Deep clean of one bathroom.")).toBe("Deep clean of one bathroom.");
  });

  it("drops emphasis markers", () => {
    expect(toPlainText("**Bold** and *italic* and __b__ and _i_")).toBe(
      "Bold and italic and b and i",
    );
    expect(toPlainText("***both***")).toBe("both");
  });

  it("drops list markers and joins the lines", () => {
    expect(toPlainText("Includes:\n- Fitting\n* Leak test\n+ Cleanup\n1. One\n2) Two")).toBe(
      "Includes: Fitting Leak test Cleanup One Two",
    );
    expect(toPlainText("- a\n  - nested")).toBe("a nested");
  });

  it("keeps an underscore inside a word", () => {
    expect(toPlainText("snake_case_word")).toBe("snake_case_word");
  });

  it("keeps an escaped symbol as the symbol", () => {
    expect(toPlainText("5\\* rating and \\_x\\_")).toBe("5* rating and _x_");
  });

  it("keeps a dash or number that isn't a list marker", () => {
    expect(toPlainText("2-3 hours, from 10.30")).toBe("2-3 hours, from 10.30");
  });

  it("turns paragraphs, CRLF and hard breaks into single spaces", () => {
    expect(toPlainText("One\r\n\r\nTwo  \nThree")).toBe("One Two Three");
  });

  it("leaves other markdown as typed, as the sheet shows it", () => {
    expect(toPlainText("# Title <b>x</b> [a](b)")).toBe("# Title <b>x</b> [a](b)");
  });

  it("is empty for empty or blank text", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText(" \n\t ")).toBe("");
    expect(toPlainText("- \n**")).toBe("");
  });
});
