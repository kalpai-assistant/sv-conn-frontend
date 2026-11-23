/**
 * SVC-488: the Android back button on an open confirm dialog closes the
 * dialog, and only the dialog — the page underneath stays put.
 *
 * Uses the real interceptor stack, not a mock: `runBackInterceptors` is
 * exactly what main.mobile.tsx's backButton listener and useEdgeSwipeBack call
 * before the router.
 */
import { useEffect, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { pushBackInterceptor, runBackInterceptors } from "@/lib/back-interceptor";

function Body({
  cancelDisabled = false,
  onCancel,
}: {
  cancelDisabled?: boolean;
  onCancel?: () => void;
}) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Log out?</AlertDialogTitle>
        <AlertDialogDescription>You can sign back in any time.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={cancelDisabled} onClick={onCancel}>
          Stay
        </AlertDialogCancel>
        <AlertDialogAction>Log out</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function Controlled(props: {
  cancelDisabled?: boolean;
  onCancel?: () => void;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(props.initialOpen ?? true);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Body {...props} />
    </AlertDialog>
  );
}

function pressBack(): boolean {
  let handled = false;
  act(() => {
    handled = runBackInterceptors();
  });
  return handled;
}

describe("AlertDialog and the Android back button (SVC-488)", () => {
  it("closes the dialog the way Cancel does, and stops back there", async () => {
    const onCancel = vi.fn();
    render(<Controlled onCancel={onCancel} />);
    await screen.findByRole("alertdialog");

    expect(pressBack()).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("swallows back while Cancel is disabled (a request is in flight)", async () => {
    const onCancel = vi.fn();
    render(<Controlled cancelDisabled onCancel={onCancel} />);
    await screen.findByRole("alertdialog");

    expect(pressBack()).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("leaves back to the router while the dialog is closed", () => {
    render(<Controlled initialOpen={false} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(runBackInterceptors()).toBe(false);
  });

  it("claims back ahead of a sheet open underneath it", async () => {
    const sheetBack = vi.fn(() => true);

    // Stands in for ServiceSheet / BusinessSection: a sheet that registered
    // its interceptor before the dialog above it opened.
    function SheetWithDialog() {
      const [dialogOpen, setDialogOpen] = useState(false);
      useEffect(() => pushBackInterceptor(sheetBack), []);
      return (
        <>
          <button onClick={() => setDialogOpen(true)}>Delete address</button>
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Body />
          </AlertDialog>
        </>
      );
    }

    const user = userEvent.setup();
    render(<SheetWithDialog />);
    await user.click(screen.getByRole("button", { name: "Delete address" }));
    await screen.findByRole("alertdialog");

    expect(pressBack()).toBe(true);
    expect(sheetBack).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    // With the dialog gone, the next back reaches the sheet again.
    expect(pressBack()).toBe(true);
    expect(sheetBack).toHaveBeenCalledOnce();
  });

  it("closes an uncontrolled dialog opened by AlertDialogTrigger", async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button>Cancel booking</button>
        </AlertDialogTrigger>
        <Body />
      </AlertDialog>,
    );
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await screen.findByRole("alertdialog");

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(runBackInterceptors()).toBe(false);
  });
});
