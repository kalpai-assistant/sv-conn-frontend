/**
 * Subscribes to the per-launch location answer (SVC-281).
 *
 * `hasConfirmedLocation()` is a plain module read, so calling it during render
 * gives React no reason to re-render when it changes. That is exactly how the
 * first build shipped a gate that never dismissed: the user tapped confirm, the
 * flag flipped, and `AppGate` was never re-evaluated — locking them out of the
 * app.
 *
 * `useSyncExternalStore` is the right tool rather than lifting this into
 * component state: the value has to be readable from outside React (the gate
 * hosts call `markLocationConfirmed` from callbacks) while still driving a
 * re-render when it moves.
 */
import { useSyncExternalStore } from "react";
import { hasConfirmedLocation, subscribeToLocationGate } from "@/lib/location-gate";

export function useLocationConfirmed(): boolean {
  return useSyncExternalStore(
    subscribeToLocationGate,
    hasConfirmedLocation,
    // Server render: never confirmed, so SSR output matches a fresh launch.
    () => false,
  );
}
