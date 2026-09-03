/**
 * "Add EazyServ to your Home Screen" (SVC-255 item 3).
 *
 * The ticket opens with a provider who was matched to two paid bookings and
 * never heard about either. They were in an iOS Safari tab, and Apple grants
 * Web Push only to a site installed to the Home Screen — so no notification was
 * ever possible, and nothing in the app said so.
 *
 * SVC-254 gave those providers a polling fallback and #104 gave the state a
 * name, but both are consolations. This is the part that actually restores
 * push, verified end to end on an iPhone on 2026-09-03: once installed, a
 * booking notification arrives with the app backgrounded.
 *
 * The steps themselves are not new — they have been on `/download` since the
 * marketing site shipped. They were simply nowhere a signed-in provider would
 * ever look. This puts them where the problem is felt.
 */
import { Bell, Share, SquarePlus, TriangleAlert } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { type InstallState, installCostsSession } from "@/lib/install";

interface InstallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: InstallState;
  /** Android only — shows the browser's real install prompt. */
  onInstall?: () => void;
  /** Copy differs by who is asking; only providers lose income over this. */
  audience?: "provider" | "consumer";
}

export function InstallSheet({
  open,
  onOpenChange,
  state,
  onInstall,
  audience = "provider",
}: InstallSheetProps) {
  const why =
    audience === "provider"
      ? "Job requests are sent as notifications. Without this you'll only see them while the app is open."
      : "Get booking updates without keeping the app open.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {state === "ios-wrong-browser" ? "Open EazyServ in Safari" : "Turn on job alerts"}
          </SheetTitle>
          <SheetDescription>
            {state === "ios-wrong-browser"
              ? "Chrome on iPhone can't add apps to the Home Screen — only Safari can."
              : why}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-4">
          {state === "can-prompt" && (
            <button
              onClick={onInstall}
              className="w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Install EazyServ
            </button>
          )}

          {state === "ios-manual" && <IosSteps />}

          {state === "ios-wrong-browser" && (
            <ol className="flex flex-col gap-3 text-sm text-foreground">
              <Step n={1}>
                Open <span className="font-medium">Safari</span> and go to this same page.
              </Step>
              <Step n={2}>
                Tap <span className="font-medium">Share</span>, then{" "}
                <span className="font-medium">Add to Home Screen</span>.
              </Step>
            </ol>
          )}

          {/* Stated before they act, not discovered after.

              On iOS the installed app gets its own storage container, so the
              session does not come with it — confirmed on device. A provider
              who taps through and lands on an OTP screen with no warning has
              every reason to think the app just broke, at precisely the moment
              we told them it would start working. Naming it first turns a
              failure into an expected step. */}
          {installCostsSession(state) && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                You'll sign in once more after installing — the Home Screen app keeps its own
                session. It's the same account.
              </p>
            </div>
          )}

          <button
            onClick={() => onOpenChange(false)}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            Not now
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Apple exposes no install API — the Share menu is the only route — so showing
 * the taps is genuinely the most any code can do here.
 */
function IosSteps() {
  return (
    <ol className="flex flex-col gap-3 text-sm text-foreground">
      <Step n={1}>
        Tap <Share className="inline h-4 w-4 align-text-bottom" />{" "}
        <span className="font-medium">Share</span> at the bottom of Safari.
      </Step>
      <Step n={2}>
        Scroll down and tap <SquarePlus className="inline h-4 w-4 align-text-bottom" />{" "}
        <span className="font-medium">Add to Home Screen</span>.
      </Step>
      <Step n={3}>
        Tap <span className="font-medium">Add</span>, then open EazyServ from your Home Screen.
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
