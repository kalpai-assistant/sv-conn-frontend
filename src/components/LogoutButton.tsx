/**
 * Sign out — shared by the consumer and provider profiles (SVC-269).
 *
 * ## Why this is a component and not markup in two places
 *
 * The button lived only on the consumer profile, and `__root.tsx` redirects a
 * provider off every non-`/provider` route — so the one control that signs a
 * provider out sat on a screen they are structurally forbidden from reaching.
 * A provider could not sign out at all.
 *
 * That is the second control stranded this way. `NotificationsRow` was the
 * first (SVC-67), and it was fixed by mounting the same component on both
 * screens rather than copying it. Copying markup is what let the two surfaces
 * drift apart in the first place, so this one is shared from the start: a
 * change to how signing out works now cannot reach one persona and miss the
 * other.
 *
 * ## Providers have to go offline on the way out
 *
 * `logout()` clears tokens and the push registration, but nothing clears
 * `is_online`. The booking broadcast filters on that flag alone — it never
 * checks whether a usable token exists — so a signed-out provider keeps
 * passing the geo-fence, keeps having offer rows written for them, and hears
 * nothing. The booking looks dispatched and nobody is listening, which is
 * exactly the failure SVC-255 was raised about, arrived at from the other side.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { useSetOnlineStatus } from "@/hooks/useApi";

interface LogoutButtonProps {
  /** Consumer profile greys this out mid-edit so unsaved changes aren't lost. */
  disabled?: boolean;
  /**
   * Provider only. When true, the provider is taken offline before signing out
   * and warned first that this stops job requests.
   *
   * `undefined` means "not a provider" and is deliberately distinct from
   * `false` ("a provider who is already offline") — the first skips the status
   * call entirely, the second has nothing to change.
   */
  isOnline?: boolean;
  /**
   * Where to land after sign-out. Defaults to `/` — correct for consumer and
   * provider, where the AppGate's unauth branch renders the consumer AuthFlow.
   * The admin surface overrides with `/admin/login`: dropping an ex-admin into
   * the consumer AuthFlow is a wrong-persona landing, not a sign-out.
   *
   * A prop rather than branching on role internally keeps this component dumb
   * — role semantics stay in the caller that already knows them.
   */
  redirectTo?: string;
}

export function LogoutButton({ disabled = false, isOnline, redirectTo = "/" }: LogoutButtonProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const setOnlineStatus = useSetOnlineStatus();
  const [confirming, setConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const signOut = useCallback(async () => {
    setIsBusy(true);
    try {
      // Only meaningful for a provider who is actually online. Awaited so the
      // call goes out while the JWT still exists — `logout()` clears it on the
      // next line.
      if (isOnline) {
        try {
          await setOnlineStatus.mutateAsync(false);
        } catch {
          // Signing out must never be blocked by the network. `logout()` is
          // entirely local and works offline today — verified on device — and
          // trapping someone in an account to protect a database flag would be
          // the wrong trade, especially on a handed-back or borrowed phone.
          //
          // But the failure is not swallowed either: silently leaving them
          // online reproduces the very bug this fixes. Say it, and say what
          // undoes it.
          toast.error("Signed out, but you may still show as online", {
            description: "Sign in again when you have a connection to fix this.",
          });
        }
      }
      logout();
      // Replace: back after signing out must not return to a route that
      // expects a signed-in user.
      navigate({ to: redirectTo, replace: true });
    } finally {
      setIsBusy(false);
    }
  }, [isOnline, setOnlineStatus, logout, navigate, redirectTo]);

  const handleClick = useCallback(() => {
    // A provider mid-shift is about to stop receiving paid work, and nothing
    // on the way out would otherwise say so. Only asked when it is true —
    // an offline provider, and every consumer, signs out in one tap.
    if (isOnline) {
      setConfirming(true);
      return;
    }
    void signOut();
  }, [isOnline, signOut]);

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive p-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Logout
      </button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You're online</AlertDialogTitle>
            <AlertDialogDescription>
              Signing out will stop job requests until you sign in and go online again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction onClick={() => void signOut()}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
