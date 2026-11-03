import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { getRouter } from "@/router";

function renderAt(path: string) {
  const router = getRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return router;
}

describe("admin shell", () => {
  it("shows all three sidebar sections with their screens", async () => {
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    for (const section of ["Operator", "Analytics", "Support"]) {
      expect(within(nav).getByRole("heading", { name: section })).toBeInTheDocument();
    }
    for (const link of [
      "KYC",
      "Pricing",
      "Coupons",
      "Catalog",
      "Teams",
      "Refunds",
      "Overview",
      "Supply",
      "Lookup",
    ]) {
      expect(within(nav).getByRole("link", { name: link })).toBeInTheDocument();
    }
  });

  it("puts the brand Button on the home screen", async () => {
    renderAt("/");
    const button = await screen.findByRole("button", { name: "Primary action" });
    expect(button).toHaveClass("bg-primary");
  });

  it("goes to a section's page when its nav link is clicked", async () => {
    const router = renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    await userEvent.click(within(nav).getByRole("link", { name: "KYC" }));

    expect(await screen.findByRole("heading", { level: 1, name: "KYC" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/operator/kyc");
  });

  it("renders /login outside the shell", async () => {
    renderAt("/login");
    expect(await screen.findByText("Sign-in is coming soon.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).not.toBeInTheDocument();
  });
});
