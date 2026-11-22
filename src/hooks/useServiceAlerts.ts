/**
 * SVC-484 "Notify me" service alerts: the customer's open alerts, and saving
 * or cancelling one (backend app/routers/users.py, Jira 14955).
 *
 * One shared list, ["service-alerts"]: every tile's Notify me reads its state
 * from it, and Profile → Service alerts lists it. The GET returns open alerts
 * only (a fired, cancelled or expired one drops out), newest first, without
 * the point.
 *
 * Kept out of useApi.ts so the tiles' existing test mocks of that module stay
 * as they are.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { round4 } from "@/hooks/useApi";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api";

export type API_ServiceAlert = components["schemas"]["ServiceAlertResponse"];

export const SERVICE_ALERTS_QUERY_KEY = ["service-alerts"] as const;

/** Signed-in only: the endpoint needs a token. */
export function useServiceAlerts(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: SERVICE_ALERTS_QUERY_KEY,
    queryFn: () => apiFetch<API_ServiceAlert[]>("/users/me/service-alerts"),
  });
}

/** Put a saved or moved alert at the top of the cached list (newest first). */
function upsertAlert(queryClient: QueryClient, alert: API_ServiceAlert) {
  queryClient.setQueryData<API_ServiceAlert[]>(SERVICE_ALERTS_QUERY_KEY, (old) => [
    alert,
    ...(old ?? []).filter((a) => a.service_id !== alert.service_id),
  ]);
}

function removeAlert(queryClient: QueryClient, serviceId: string) {
  queryClient.setQueryData<API_ServiceAlert[]>(SERVICE_ALERTS_QUERY_KEY, (old) =>
    old?.filter((a) => a.service_id !== serviceId),
  );
}

/**
 * The tile labels are stale when the server disagrees with them. Every
 * from-prices point, not just this one: they are cheap, and only the ones on
 * screen refetch.
 */
function refreshTiles(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["from-prices"] });
}

/**
 * Save (or move) the alert at the point the tile priced from. `point` is the
 * unrounded tile point; it is rounded with useFromPrices's own `round4`, so
 * the alert sits at exactly the from-prices key the tile showed.
 *
 * Errors are handled here, toast included. Callers only learn whether it
 * worked from `mutateAsync` resolving or rejecting.
 */
export function useSaveServiceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      point,
    }: {
      serviceId: string;
      point: { lat: number; lng: number };
    }) =>
      apiFetch<API_ServiceAlert>(`/users/me/service-alerts/${serviceId}`, {
        method: "PUT",
        body: JSON.stringify({ lat: round4(point.lat), lng: round4(point.lng) }),
      }),
    onSuccess: (alert) => {
      upsertAlert(queryClient, alert);
      toast.success("We'll let you know", {
        description: `You'll get a notification when ${alert.service_name} is available near you.`,
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "SERVICE_ALREADY_AVAILABLE") {
        refreshTiles(queryClient);
        toast.success("Good news: it's available now", {
          description: "Pros near you can take this service, so there's nothing to wait for.",
        });
        return;
      }
      if (error instanceof ApiError && error.code === "SERVICE_NOT_FOUND") {
        // An inactive service drops out of from-prices, so the refetch turns
        // the tile back into the catalogue fallback, which has no Notify me.
        refreshTiles(queryClient);
        toast.error("This service isn't available", {
          description: "It's no longer offered, so we can't alert you about it.",
        });
        return;
      }
      toast.error("Couldn't turn on the alert", { description: "Please try again." });
    },
  });
}

/** Cancel the alert. The DELETE is idempotent: a 204 even if none was open. */
export function useCancelServiceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      apiFetch<void>(`/users/me/service-alerts/${serviceId}`, { method: "DELETE" }),
    onSuccess: (_void, serviceId) => removeAlert(queryClient, serviceId),
    onError: () => {
      toast.error("Couldn't cancel the alert", { description: "Please try again." });
    },
  });
}
