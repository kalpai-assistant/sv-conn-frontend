import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, ClipboardPaste, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/lib/auth-context";
import { PRO_ME_QUERY_KEY, isTeamPro, useAcceptInvite, useProMe, type ProMe } from "@/hooks/usePro";
import {
  INVITE_CODE_LENGTH,
  clearPendingInvite,
  inviteCodeFromClipboard,
  inviteErrorMessage,
  isAlreadyOnThisTeam,
  joinedTeamMessage,
} from "@/lib/invite";
import {
  canPasteFromClipboard,
  readClipboardOnLoad,
  readClipboardOnTap,
} from "@/lib/invite-clipboard";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
});

// SVC-322 part 3 — joining a team with the code from the invite SMS.
//
// Reached from the static link in the SMS (App Links, SVC-343), or from
// Profile's "Join a team". Signed-out visitors meet the sign-in flow first,
// locked to a customer account (see AuthFlow's `invite`), and come back here.
function InvitePage() {
  const { user } = useAuth();
  const { data: me } = useProMe(user?.id);
  const accept = useAcceptInvite();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  // Android's Messages app offers "Copy code" for a 4–6 digit number; if they
  // tapped it, this makes joining one tap. Only where the browser already
  // allows the read (see invite-clipboard.ts), only a 6-digit clipboard counts,
  // and nothing is submitted for them: a wrong pre-fill should cost a glance,
  // not one of their 10 attempts an hour.
  useEffect(() => {
    let cancelled = false;
    void readClipboardOnLoad().then((text) => {
      const found = inviteCodeFromClipboard(text);
      if (found && !cancelled) setCode((current) => current || found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing left to come back for.
  const isOwner = user?.role === "provider";
  const alreadyPro = isTeamPro(me);
  useEffect(() => {
    if (alreadyPro || isOwner) clearPendingInvite();
  }, [alreadyPro, isOwner]);

  const paste = async () => {
    const read = await readClipboardOnTap();
    if (!read.ok) {
      // The browser said no — which is not the same as "nothing there".
      toast("Couldn’t read the clipboard. Long-press the boxes to paste, or type the code.");
      return;
    }
    const found = inviteCodeFromClipboard(read.text);
    if (found) {
      setCode(found);
      setError("");
    } else {
      toast("No 6-digit code on your clipboard. Copy it from the SMS, or type it in.");
    }
  };

  const joined = () => {
    clearPendingInvite();
    navigate({ to: "/pro", replace: true });
  };

  const submit = () =>
    accept.mutate(code, {
      onSuccess: () => {
        // Read from the cache, not `me`: this closure predates the accept,
        // and the refetch it triggered has landed by now (see joinedTeamMessage).
        toast.success(
          joinedTeamMessage(
            queryClient.getQueryData<ProMe | null>([...PRO_ME_QUERY_KEY, user?.id]),
          ),
        );
        joined();
      },
      onError: (err) => {
        if (isAlreadyOnThisTeam(err)) {
          toast("You’re already on this team.");
          joined();
          return;
        }
        setError(inviteErrorMessage(err));
      },
    });

  // SVC-354: an SP owner. Checked first, by role: `/pros/me` answers for them
  // too, with their own Pro-for-self, and that row is why every accept would
  // be refused (ALREADY_PRO_ELSEWHERE). A phone keeps its role for life, so
  // there is nothing to submit — only something to explain. The root gate lets
  // them see this screen for that reason (`providerSeesInviteRoute`).
  if (isOwner) {
    return (
      <div className="min-h-screen p-6">
        <BackButton fallbackTo="/provider" />
        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Briefcase className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">This is a business account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your number is registered as a service provider, so it can’t join another team — a phone
          keeps the role it signed up with. To work for another provider, sign up with a different
          number.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/provider">Open your business app</Link>
        </Button>
      </div>
    );
  }

  // Already a Pro: say so rather than offer a form whose every answer is a
  // refusal (409 on this team, 400 on any other).
  if (isTeamPro(me)) {
    return (
      <div className="min-h-screen p-6">
        <BackButton fallbackTo="/" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">You’re already on a team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You work with {me.service_provider.business_name?.trim() || "your service provider"}. You
          can only be on one team at a time.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/pro">Open Pro app</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <BackButton fallbackTo="/" />

      <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Users className="h-6 w-6 text-primary" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Join your team</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the 6-digit code from the invite SMS. You’ll work on jobs your team gives you; your
        pay goes through them.
      </p>

      <div className="mt-8 flex justify-center">
        <InputOTP
          maxLength={INVITE_CODE_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          disabled={accept.isPending}
          onChange={(value) => {
            setCode(value);
            if (error) setError("");
          }}
          aria-label="Invite code"
        >
          <InputOTPGroup>
            {Array.from({ length: INVITE_CODE_LENGTH }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {/* Browsers only. In the native app the WebView refuses every clipboard
          read (measured), so a Paste button there could only ever fail; the
          keyboard's suggestion and long-press paste cover it. */}
      {canPasteFromClipboard() && (
        <button
          type="button"
          onClick={paste}
          className="mx-auto mt-3 flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste code
        </button>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        className="mt-6 w-full"
        disabled={code.length !== INVITE_CODE_LENGTH || accept.isPending}
        onClick={submit}
      >
        {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join team"}
      </Button>
    </div>
  );
}
