/**
 * Delete my account — shared by the consumer and provider profiles (SVC-367).
 *
 * Both app stores require it: Play's User Data policy and App Store guideline
 * 5.1.1(v). Shared for the same reason `LogoutButton` is — the provider
 * profile is a separate route, and a control copied into two places drifts.
 *
 * ## Order on success
 *
 * `DELETE /users/me` first, and only on its 204 does anything local change.
 * The backend nulls `users.fcm_token` in the same transaction, so there is no
 * server-side push clear to do beforehand — and doing one first would leave a
 * refused (409) or offline user still signed in with push silently off.
 * `logout()` then runs the device half of `clearFcmToken` and `clearSession`.
 * Its server PATCH 401s against the now-dead token, quietly: `clearFcmToken`
 * never throws, isn't awaited, and `logout()` has already cleared the refresh
 * token, so `apiFetch` has nothing to refresh with.
 *
 * ## Refusals
 *
 * A 409 means nothing changed. Each code gets the backend's message plus a way
 * to fix it: the live bookings to open, or the team screen. There is
 * deliberately no "Cancel booking" shortcut — cancelling has its own flow
 * (reasons, refunds) on the booking screen, and this must not bypass it.
 */
import { useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiFetch, getRefreshToken } from "@/lib/api";
import { useProJobs } from "@/hooks/usePro";

const CONFIRM_WORD = "DELETE";

/** Case-insensitive and trimmed: auto-capitalising keyboards type "Delete ". */
function isDeleteConfirmed(input: string): boolean {
  return input.trim().toUpperCase() === CONFIRM_WORD;
}

type Refusal =
  | { code: "ACTIVE_BOOKINGS"; message: string; bookingIds: string[] }
  | { code: "TEAM_HAS_PROS"; message: string }
  | { code: "UNPAID_BALANCE"; message: string };

function refusalFrom(err: unknown): Refusal | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const { message } = err;
  switch (err.code) {
    case "ACTIVE_BOOKINGS": {
      const ids = err.details?.booking_ids;
      const bookingIds = Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
      return { code: "ACTIVE_BOOKINGS", message, bookingIds };
    }
    case "TEAM_HAS_PROS":
    case "UNPAID_BALANCE":
      return { code: err.code, message };
    default:
      return null;
  }
}

interface DeleteAccountButtonProps {
  /** Which booking screen "Open booking" goes to. */
  persona: "consumer" | "provider";
  /**
   * Consumer profile only: a team Pro can be blocked by a job they are working,
   * not just one they booked, and the 409 doesn't say which. Their active Pro
   * jobs decide — a match opens the job screen, anything else tracking.
   */
  isTeamPro?: boolean;
  /** Consumer profile greys this out mid-edit, like Logout. */
  disabled?: boolean;
}

export function DeleteAccountButton({
  persona,
  isTeamPro = false,
  disabled = false,
}: DeleteAccountButtonProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  // Only asked for once a team Pro is actually shown a booking refusal.
  const { data: proJobs } = useProJobs("active", isTeamPro && refusal?.code === "ACTIVE_BOOKINGS");
  const proJobIds = new Set(proJobs?.jobs.map((job) => job.id) ?? []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (isBusy) return;
      setOpen(next);
      if (!next) {
        setTyped("");
        setRefusal(null);
      }
    },
    [isBusy],
  );

  const confirm = useCallback(async () => {
    setIsBusy(true);
    try {
      const refreshToken = getRefreshToken();
      await apiFetch<void>("/users/me", {
        method: "DELETE",
        ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
      });
    } catch (err) {
      setIsBusy(false);
      const r = refusalFrom(err);
      if (r) {
        setRefusal(r);
        return;
      }
      toast.error("Couldn't delete your account", {
        description: "Nothing was deleted. Check your connection and try again.",
      });
      return;
    }
    setIsBusy(false);
    setOpen(false);
    logout();
    // Replace: back must not return to a profile that no longer exists.
    navigate({ to: "/", replace: true });
    toast.success("Your account has been deleted.");
  }, [logout, navigate]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-xl p-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        Delete my account
      </button>

      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {refusal ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>You can't delete your account yet</AlertDialogTitle>
                <AlertDialogDescription>{refusal.message}</AlertDialogDescription>
              </AlertDialogHeader>

              {refusal.code === "ACTIVE_BOOKINGS" && refusal.bookingIds.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {refusal.bookingIds.map((id, i) => (
                    <li key={id}>
                      <OpenBookingLink
                        bookingId={id}
                        label={`Booking ${i + 1}`}
                        target={
                          persona === "provider"
                            ? "provider"
                            : proJobIds.has(id)
                              ? "pro"
                              : "consumer"
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}

              {refusal.code === "TEAM_HAS_PROS" && (
                <Link
                  to="/provider/team"
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm font-medium text-foreground hover:bg-secondary/50"
                >
                  Go to My Team
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Your profile, addresses, and personal data will be deleted.
                  Past bookings will remain in anonymized form for financial records.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <label className="flex flex-col gap-1.5 text-sm text-foreground">
                Type {CONFIRM_WORD} to confirm
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  disabled={isBusy}
                />
              </label>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isBusy}>Keep my account</AlertDialogCancel>
                {/* A plain button, not AlertDialogAction: that closes the dialog on
                    click, and a refusal has to be shown in it. */}
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={!isDeleteConfirmed(typed) || isBusy}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Delete account
                </button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OpenBookingLink({
  bookingId,
  label,
  target,
}: {
  bookingId: string;
  label: string;
  target: "consumer" | "provider" | "pro";
}) {
  const className =
    "flex items-center justify-between rounded-lg border border-border p-3 text-sm text-foreground hover:bg-secondary/50";
  const body = (
    <>
      <span>{label}</span>
      <span className="flex items-center gap-1 font-medium text-primary">
        Open booking
        <ChevronRight className="h-4 w-4" />
      </span>
    </>
  );
  if (target === "provider")
    return (
      <Link to="/provider/bookings/$bookingId" params={{ bookingId }} className={className}>
        {body}
      </Link>
    );
  if (target === "pro")
    return (
      <Link to="/pro/jobs/$bookingId" params={{ bookingId }} className={className}>
        {body}
      </Link>
    );
  return (
    <Link to="/tracking/$bookingId" params={{ bookingId }} className={className}>
      {body}
    </Link>
  );
}
