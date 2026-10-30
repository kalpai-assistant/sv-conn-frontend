/**
 * SVC-388 — a review comment can surface on the service card, so the sheet
 * says so before the user writes one.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewSheet } from "./ReviewSheet";

describe("ReviewSheet consent line", () => {
  it("tells the reviewer their first name and comment may be shown", () => {
    render(<ReviewSheet open onOpenChange={vi.fn()} onSubmit={vi.fn()} onSkip={vi.fn()} />);
    expect(
      screen.getByText("Your first name and comment may be shown to other customers."),
    ).toBeTruthy();
  });
});
