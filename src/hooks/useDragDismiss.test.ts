/**
 * SVC-391: the drag-dismiss heuristic is shared across every bottom sheet
 * that opts in — ServiceSheet, CategorySubcategoriesSheet, CouponsSheet,
 * SavedAddressesSheet. The pure predicate is tested here so a change to the
 * commit thresholds has to be acknowledged, not drifted into.
 */
import { describe, expect, it } from "vitest";
import { DRAG_DISMISS_COMMIT, shouldDismissFromDrag } from "@/hooks/useDragDismiss";

const noMotion = { offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };

describe("shouldDismissFromDrag", () => {
  it("holds its commit thresholds — change this test if the feel changes", () => {
    // Hard-coded on purpose: these are the shadcn/ui drawer numbers. A silent
    // tune of the heuristic would change the feel of every sheet at once.
    expect(DRAG_DISMISS_COMMIT.offsetPx).toBe(100);
    expect(DRAG_DISMISS_COMMIT.velocityPx).toBe(500);
  });

  it("snaps back on a short, slow drag", () => {
    expect(
      shouldDismissFromDrag({
        ...noMotion,
        offset: { x: 0, y: 40 },
        velocity: { x: 0, y: 50 },
      }),
    ).toBe(false);
  });

  it("commits on a long drop even at low velocity", () => {
    expect(
      shouldDismissFromDrag({
        ...noMotion,
        offset: { x: 0, y: 150 },
        velocity: { x: 0, y: 0 },
      }),
    ).toBe(true);
  });

  it("commits on a fast flick even if the drop was short", () => {
    expect(
      shouldDismissFromDrag({
        ...noMotion,
        offset: { x: 0, y: 20 },
        velocity: { x: 0, y: 800 },
      }),
    ).toBe(true);
  });

  it("never commits on an upward drag", () => {
    // Pushing the sheet up is not a dismiss gesture, regardless of velocity.
    expect(
      shouldDismissFromDrag({
        ...noMotion,
        offset: { x: 0, y: -200 },
        velocity: { x: 0, y: -2000 },
      }),
    ).toBe(false);
  });
});
