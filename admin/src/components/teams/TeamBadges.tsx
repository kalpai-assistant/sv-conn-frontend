/**
 * Status pills for SPs and Pros. Tokens only: night mode swaps them, so a fixed
 * colour would clash in one scheme or the other.
 */
import type { ReactNode } from "react";
import { inviteStatusLabel, kycLabel } from "@/lib/teams";

const PILL =
  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export const TONES = {
  neutral: "border-border bg-muted text-foreground",
  quiet: "border-border bg-transparent text-muted-foreground",
  good: "border-success/40 bg-success/10 text-success",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
  moving: "border-primary/30 bg-primary/10 text-primary",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={`${PILL} ${TONES[tone]}`}>{children}</span>;
}

export function KycStatusPill({ status }: { status: string }) {
  const tone = status === "verified" ? "good" : status === "rejected" ? "bad" : "neutral";
  return <Pill tone={tone}>KYC {kycLabel(status).toLowerCase()}</Pill>;
}

/** The account, as a status only: there is no deactivate button here (SVC-427). */
export function AccountPill({ active }: { active: boolean }) {
  return active ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Deactivated</Pill>;
}

export function OnlinePill({ online }: { online: boolean }) {
  return online ? <Pill tone="moving">Online</Pill> : <Pill tone="quiet">Offline</Pill>;
}

const INVITE_TONES: Record<string, keyof typeof TONES> = {
  pending: "moving",
  accepted: "good",
  revoked: "bad",
  expired: "quiet",
};

export function InviteStatusPill({ status }: { status: string }) {
  return (
    <Pill tone={INVITE_TONES[status.toLowerCase()] ?? "neutral"}>{inviteStatusLabel(status)}</Pill>
  );
}

/** A Pro row's membership: the SP's own row, removed, or the person's account deactivated. */
export function MembershipPills({
  pro,
}: {
  pro: { is_self: boolean; is_active: boolean; user_is_active: boolean };
}) {
  return (
    <>
      {pro.is_self && <Pill tone="neutral">SP&apos;s own profile</Pill>}
      {!pro.is_active && <Pill tone="quiet">Removed</Pill>}
      {!pro.user_is_active && <Pill tone="bad">Account deactivated</Pill>}
    </>
  );
}
