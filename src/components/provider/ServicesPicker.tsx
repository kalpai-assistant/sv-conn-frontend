import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { useServices, useProviderServices, useToggleProviderService } from "@/hooks/useApi";

interface ServicesPickerProps {
  // When locked (e.g. KYC not yet verified) the toggles are disabled and a hint
  // is shown instead of letting the provider subscribe (SVC-93 Step 3).
  locked?: boolean;
  title?: string;
  description?: string;
}

// "Services I offer" — list every active catalog service with a toggle; on/off
// subscribes/unsubscribes the provider with optimistic update + rollback. Extracted
// from the provider profile (SVC-92) so the onboarding wizard can reuse it (SVC-93).
export function ServicesPicker({
  locked = false,
  title = "Services I offer",
  description = "Toggle the services you want to receive jobs for.",
}: ServicesPickerProps) {
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices();
  const {
    data: subscribedIds = [],
    isLoading: subsLoading,
    isError: subsError,
    refetch: refetchSubs,
  } = useProviderServices();
  const toggle = useToggleProviderService();
  // 403 fallback for the unlocked (profile) usage; when `locked` we already block.
  const [kycBlocked, setKycBlocked] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleToggle = (serviceId: string, subscribe: boolean) => {
    setPendingId(serviceId);
    toggle.mutate(
      { serviceId, subscribe },
      {
        onSuccess: () => setKycBlocked(false),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 403) {
            setKycBlocked(true);
          } else {
            toast.error(err instanceof Error ? err.message : "Something went wrong");
          }
        },
        onSettled: () => setPendingId(null),
      },
    );
  };

  const loading = servicesLoading || subsLoading;
  const hasError = servicesError || subsError;

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {locked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">
            Services unlock once your KYC is verified.
          </p>
        </div>
      )}

      {kycBlocked && !locked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">
            Complete KYC to start receiving jobs.
          </p>
        </div>
      )}

      {loading && (
        <div className="mt-6 flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {hasError && !loading && (
        <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-destructive">Couldn’t load your services.</p>
          <button
            type="button"
            onClick={() => {
              if (servicesError) refetchServices();
              if (subsError) refetchSubs();
            }}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !hasError && (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {(services ?? []).map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{service.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {service.categoryName} · ₹{service.price}
                </p>
              </div>
              <Switch
                checked={subscribedIds.includes(service.id)}
                disabled={locked || pendingId === service.id}
                onCheckedChange={(checked) => handleToggle(service.id, checked)}
                aria-label={`Toggle ${service.name}`}
              />
            </li>
          ))}
          {services?.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No active services available.</li>
          )}
        </ul>
      )}
    </section>
  );
}
