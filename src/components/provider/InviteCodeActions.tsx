/**
 * Hand an invite code over by hand (SVC-321).
 *
 * The backend texts the code, but on beta that SMS never arrives: MSG91 is
 * blocked on DLT approval (SVC-328). So the SP needs to be able to pass it on
 * themselves, on WhatsApp or by reading it out.
 *
 * Copy is the main action because it always works. Share only appears where
 * `navigator.share` exists: it is undefined in the Android WebView, and there
 * is no native share plugin in this app.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inviteMessage, type TeamInvite } from "@/hooks/useTeam";

export function InviteCodeActions({
  invite,
}: {
  invite: Pick<TeamInvite, "token" | "invite_url">;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error(`Couldn't copy. The code is ${invite.token}.`);
      return;
    }
    navigator.clipboard
      .writeText(inviteMessage(invite))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error(`Couldn't copy. The code is ${invite.token}.`));
  };

  const share = () => {
    navigator.share({ text: inviteMessage(invite) }).catch(() => {
      // Cancelled from the share sheet: not an error.
    });
  };

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy invite"}
      </Button>
      {canShare && (
        <Button type="button" variant="outline" size="sm" onClick={share}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      )}
    </div>
  );
}

/** The code itself, spaced so it can be read out over the phone. */
export function InviteCode({ token }: { token: string }) {
  return (
    <p
      className="font-mono text-2xl font-bold tracking-[0.3em] text-foreground"
      aria-label={`Invite code ${token.split("").join(" ")}`}
    >
      {token}
    </p>
  );
}
