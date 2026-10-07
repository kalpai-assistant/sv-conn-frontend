import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Info } from "lucide-react";

import { BackButton } from "@/components/BackButton";
import { InviteCode, InviteCodeActions } from "@/components/provider/InviteCodeActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProviderProfile } from "@/hooks/useApi";
import {
  nationalDigits,
  teamErrorMessage,
  useCreateInvite,
  type TeamInvite,
} from "@/hooks/useTeam";

export const Route = createFileRoute("/provider/team/invite")({
  component: InvitePage,
});

/** A 10-digit Indian mobile, the form the backend accepts after "+91". */
const MOBILE_RE = /^[6-9]\d{9}$/;

// SVC-321 — invite someone to the SP's team by phone. The backend texts them a
// 6-digit code, but until DLT approval (SVC-328) that SMS never arrives, so
// the code is shown here for the SP to pass on themselves.
function InvitePage() {
  const { data: profile } = useProviderProfile();
  const createInvite = useCreateInvite();
  const [digits, setDigits] = useState("");
  const [sent, setSent] = useState<TeamInvite | null>(null);

  // The backend refuses with INVITER_PAYOUT_KYC_INCOMPLETE too; saying so up
  // front saves typing a number only to be told no.
  const kycBlocked = profile !== undefined && profile.kyc_status !== "verified";
  const valid = MOBILE_RE.test(digits);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || kycBlocked) return;
    createInvite.mutate(`+91${digits}`, {
      onSuccess: (invite) => setSent(invite),
      onError: (error) => toast.error(teamErrorMessage(error)),
    });
  };

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider/team" />
        <h1 className="text-lg font-semibold text-foreground">Invite to team</h1>
      </div>

      {sent ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 text-foreground">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <p className="font-semibold">Invite created for {sent.invitee_phone}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            We've texted them this code. If it doesn't arrive, send it to them yourself. It only
            works from their phone and lasts 7 days.
          </p>
          <InviteCode token={sent.token} />
          <InviteCodeActions invite={sent} />
          <Button asChild className="w-full">
            <Link to="/provider/team">Done</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <p className="text-sm text-muted-foreground">
            We'll text them a code to join your team. They'll need to complete their own KYC before
            they start taking jobs.
          </p>

          {kycBlocked && (
            <div className="flex gap-2 rounded-lg bg-muted px-3 py-3 text-sm text-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                Finish your KYC before inviting team members. Your team's earnings are paid to you,
                so your account must be verified first.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="invitee-phone">Phone number</Label>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                +91
              </span>
              <Input
                id="invitee-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={digits}
                onChange={(e) => setDigits(nationalDigits(e.target.value))}
                disabled={kycBlocked}
              />
            </div>
            {digits.length === 10 && !valid && (
              <p className="text-xs text-destructive">Enter a valid Indian mobile number.</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!valid || kycBlocked || createInvite.isPending}
          >
            {createInvite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </form>
      )}
    </div>
  );
}
