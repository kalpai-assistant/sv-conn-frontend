/**
 * Referral card (SVC-494, Phase 5 of SVC-378).
 *
 * UC Partner / Rapido Captain both surface a referral slot on Profile — it's
 * one of the three features that drive retention outside of job flow. We
 * ship the frontend half and file the backend code-generator as a
 * recommendation in the PR body.
 *
 * ## Placeholder code, honest about it
 *
 * The backend has no referral endpoint yet. Rather than fake per-provider
 * codes (two providers both getting "ABC123" would be the embarrassing kind
 * of bug), we derive a stable, provider-specific placeholder from the first
 * six hex chars of their user id, upper-cased. It survives a device swap
 * and is unique across providers, even if it ultimately won't attribute to
 * a bonus until the backend ships the attribution table.
 *
 * The audit's "₹500 per invite" framing is the backend's call, not ours; the
 * number lives in copy only and is easy to re-key when the real system
 * lands. No persistence, no storage, no state — just a derived string.
 *
 * ## Share behaviour
 *
 * `@capacitor/share` on native uses the OS share sheet (Android chooser /
 * iOS UIActivity). On web it falls back to `navigator.share` where
 * available (modern mobile Safari / Chrome Android PWA), and to a toast
 * explaining failure elsewhere. Fire `hapticImpactLight` on tap-before-
 * share-opens for the "it registered" feedback.
 *
 * ## What we didn't build
 *
 * - A "copy code" button. The share sheet already carries the code; a
 *   second button duplicates the gesture.
 * - A "my referrals" list. Needs a backend table we don't have; shipping
 *   an empty list would train the provider to ignore the surface.
 */
import { useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Share } from "@capacitor/share";
import { Button } from "@/components/ui/button";
import { hapticImpactLight } from "@/lib/haptics";
import { useT } from "@/i18n/LanguageProvider";

interface ReferralCardProps {
  /** Provider's user id — used to derive the placeholder code. Null while
   *  auth is restoring; card renders a disabled button rather than a
   *  broken state. */
  userId?: string | null;
}

/** First six hex chars of the user id, upper-cased. "a4c3d201-…" → "A4C3D2". */
export function placeholderReferralCode(userId: string | null | undefined): string {
  if (!userId) return "EAZYSERV";
  // Strip non-hex (dashes in UUIDs) before slicing so the code is stable
  // regardless of id formatting changes.
  const hex = userId.replace(/[^0-9a-f]/gi, "").slice(0, 6);
  if (hex.length < 6) return "EAZYSERV";
  return hex.toUpperCase();
}

export function ReferralCard({ userId }: ReferralCardProps) {
  const { t } = useT("provider");
  const [sharing, setSharing] = useState(false);
  const code = placeholderReferralCode(userId);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    // Fire-and-feel: the haptic is the "tap registered" cue, and must fire
    // before the share sheet opens so the user doesn't wait for a native
    // dialog to feel feedback.
    hapticImpactLight();
    try {
      await Share.share({
        title: t("profile.referralShareTitle"),
        text: t("profile.referralShareText", { code }),
        dialogTitle: t("profile.referralShareTitle"),
      });
    } catch (err) {
      // Capacitor rejects with `ShareCanceled` when the user dismisses the
      // native sheet — treat as a non-error (no toast). Anything else is a
      // real failure we want to surface so the user can try again.
      const msg = (err as { message?: string } | undefined)?.message ?? "";
      if (!/cancel|dismiss/i.test(msg)) {
        toast.error(t("profile.referralShareFailed"));
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      data-testid="referral-card"
      className="mt-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-primary/5 p-5 dark:from-primary/15 dark:to-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 dark:bg-primary/20">
          <Gift className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">{t("profile.referralTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("profile.referralBody")}
          </p>
          <p
            className="mt-3 inline-flex items-center rounded-md bg-background/70 px-2.5 py-1 font-mono text-xs tracking-wider text-foreground dark:bg-background/40"
            data-testid="referral-code"
          >
            {t("profile.referralCode", { code })}
          </p>
        </div>
      </div>
      <Button
        onClick={() => void handleShare()}
        disabled={sharing || !userId}
        className="mt-4 w-full"
        data-testid="referral-share"
      >
        {t("profile.referralCta")}
      </Button>
    </div>
  );
}
