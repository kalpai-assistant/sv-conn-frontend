/**
 * SVC-496: each option row's price from the service's from-prices row.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { API_ServiceFromPrice } from "@/hooks/useApi";
import type { ServiceVariant } from "@/lib/mock-data";
import { VariantPicker } from "@/components/service/VariantPicker";
import { VARIANT_NO_PROS_TEXT, VARIANT_OUT_OF_RANGE_TEXT } from "@/lib/tile-price-state";

const variant = (id: string, label: string, price: number): ServiceVariant => ({
  id,
  label,
  subcategory: null,
  price,
  payout: 0,
});
const VARIANTS = [
  variant("v1", "1 bathroom", 499),
  variant("v2", "2 bathrooms", 798),
  variant("v3", "3 bathrooms", 1099),
  variant("v4", "4 bathrooms", 1399),
];
const ROW: API_ServiceFromPrice = {
  service_id: "s",
  from_price: 500,
  served: true,
  variants: [
    { variant_id: "v1", from_price: 500.6, outside_recommended_range: false },
    { variant_id: "v2", from_price: 1000, outside_recommended_range: true },
    { variant_id: "v3", from_price: null, outside_recommended_range: false },
    // v4 has no entry: catalogue price.
  ],
};

const renderPicker = (fromPrices?: API_ServiceFromPrice, selectedId = "v1") => {
  const onSelect = vi.fn();
  render(
    <VariantPicker
      variants={VARIANTS}
      selectedId={selectedId}
      onSelect={onSelect}
      fromPrices={fromPrices}
    />,
  );
  const rowFor = (label: string) =>
    screen.getAllByTestId("variant-row").find((r) => r.textContent?.includes(label))!;
  return { onSelect, rowFor };
};

describe("VariantPicker rows", () => {
  it("shows catalogue prices with no from-prices row", () => {
    const { rowFor } = renderPicker(undefined);
    expect(within(rowFor("1 bathroom")).getByText("₹499")).toBeInTheDocument();
    expect(rowFor("1 bathroom").textContent).not.toContain("from");
    expect(screen.queryByText(VARIANT_NO_PROS_TEXT)).not.toBeInTheDocument();
    for (const r of screen.getAllByRole("radio")) expect(r).toBeEnabled();
  });

  it("shows from ₹X, floored, for a priced option", () => {
    const { rowFor } = renderPicker(ROW);
    expect(rowFor("1 bathroom").textContent).toContain("from ₹500");
    expect(rowFor("1 bathroom").textContent).not.toContain(VARIANT_OUT_OF_RANGE_TEXT);
  });

  it("labels an out-of-range fallback", () => {
    const { rowFor } = renderPicker(ROW);
    const r = rowFor("2 bathrooms");
    expect(r.textContent).toContain("from ₹1,000");
    expect(within(r).getByText(VARIANT_OUT_OF_RANGE_TEXT)).toBeInTheDocument();
  });

  it("greys an option with no pros: No pros, disabled, can't be selected", async () => {
    const { rowFor, onSelect } = renderPicker(ROW);
    const r = rowFor("3 bathrooms");
    expect(within(r).getByText(VARIANT_NO_PROS_TEXT)).toBeInTheDocument();
    expect(r.textContent).not.toContain("₹");
    expect(r).toHaveAttribute("aria-disabled", "true");
    expect(r).toHaveClass("opacity-50");
    const radio = within(r).getByRole("radio");
    expect(radio).toBeDisabled();

    await userEvent.click(r);
    expect(onSelect).not.toHaveBeenCalled();
    expect(radio).not.toBeChecked();
  });

  it("never shows a greyed option as selected", () => {
    renderPicker(ROW, "v3");
    expect(within(screen.getAllByTestId("variant-row")[2]).getByRole("radio")).not.toBeChecked();
  });

  it("keeps the catalogue price for an option the row doesn't list", () => {
    const { rowFor } = renderPicker(ROW);
    const r = rowFor("4 bathrooms");
    expect(within(r).getByText("₹1,399")).toBeInTheDocument();
    expect(within(r).getByRole("radio")).toBeEnabled();
  });

  it("selects an enabled option", async () => {
    const { rowFor, onSelect } = renderPicker(ROW);
    await userEvent.click(rowFor("2 bathrooms"));
    expect(onSelect).toHaveBeenCalledWith("v2");
  });
});
