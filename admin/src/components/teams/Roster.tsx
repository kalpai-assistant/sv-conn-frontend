/**
 * An SP's team: every Pro row they've ever had, removed ones included and marked.
 * A table where the page is wide enough, cards where it isn't. Force remove and
 * Reassign show only for admin and ops, and only on an active row that isn't the
 * SP's own (the backend refuses the rest).
 */
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, UserMinus } from "lucide-react";
import { KycStatusPill, MembershipPills, OnlinePill } from "@/components/teams/TeamBadges";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIst } from "@/lib/bookings";
import { isActionable, type TeamPro } from "@/lib/teams";

const WRAP = "[overflow-wrap:anywhere]";

interface RosterProps {
  pros: TeamPro[];
  canEdit: boolean;
  onRemove: (pro: TeamPro) => void;
  onMove: (pro: TeamPro) => void;
}

function takesJobs(pro: TeamPro): string | null {
  return pro.is_self ? (pro.accepts_direct_jobs ? "Yes" : "No") : null;
}

function ProName({ pro }: { pro: TeamPro }) {
  return (
    <Link
      to="/operator/pros/$proId"
      params={{ proId: pro.id }}
      className={`font-medium text-primary underline-offset-2 hover:underline ${WRAP} ${
        pro.is_active ? "" : "line-through"
      }`}
    >
      {pro.display_name}
    </Link>
  );
}

function Actions({
  pro,
  onRemove,
  onMove,
  stretch = false,
}: Omit<RosterProps, "pros" | "canEdit"> & { pro: TeamPro; stretch?: boolean }) {
  return (
    <div className={stretch ? "grid grid-cols-2 gap-2" : "flex justify-end gap-2"}>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Reassign ${pro.display_name}`}
        onClick={() => onMove(pro)}
      >
        <ArrowRightLeft aria-hidden="true" />
        Reassign
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Force remove ${pro.display_name}`}
        className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRemove(pro)}
      >
        <UserMinus aria-hidden="true" />
        Force remove
      </Button>
    </div>
  );
}

export function Roster({ pros, canEdit, onRemove, onMove }: RosterProps) {
  return (
    <div className="@container">
      <ul aria-label="Team" className="space-y-2 @3xl:hidden">
        {pros.map((pro) => (
          <li
            key={pro.id}
            data-testid={`pro-card-${pro.id}`}
            className={`space-y-2 rounded-lg border p-3 text-sm ${
              pro.is_active ? "bg-card" : "bg-muted/40 text-muted-foreground"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <ProName pro={pro} />
              <MembershipPills pro={pro} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{pro.phone}</span>
              <KycStatusPill status={pro.kyc_status} />
              <OnlinePill online={pro.is_online} />
            </div>
            <p className="text-xs text-muted-foreground">
              {pro.active_job_count} active {pro.active_job_count === 1 ? "job" : "jobs"}
              {takesJobs(pro) && <> · Takes jobs themselves: {takesJobs(pro)}</>} · Joined{" "}
              {formatIst(pro.created_at)}
            </p>
            {canEdit && isActionable(pro) && (
              <Actions pro={pro} onRemove={onRemove} onMove={onMove} stretch />
            )}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pro</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Online</TableHead>
              <TableHead className="text-right">Active jobs</TableHead>
              {canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pros.map((pro) => (
              <TableRow
                key={pro.id}
                data-testid={`pro-row-${pro.id}`}
                className={`align-top ${pro.is_active ? "" : "bg-muted/40 text-muted-foreground"}`}
              >
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProName pro={pro} />
                    <MembershipPills pro={pro} />
                  </div>
                  <div className="text-xs whitespace-nowrap text-muted-foreground">
                    Joined {formatIst(pro.created_at)}
                  </div>
                  {/* Only the SP's own row has this setting: a note, not a column of dashes. */}
                  {takesJobs(pro) && (
                    <div className="text-xs text-muted-foreground">
                      Takes jobs themselves: {takesJobs(pro)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{pro.phone}</TableCell>
                <TableCell>
                  <KycStatusPill status={pro.kyc_status} />
                </TableCell>
                <TableCell>
                  <OnlinePill online={pro.is_online} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{pro.active_job_count}</TableCell>
                {canEdit && (
                  <TableCell>
                    {isActionable(pro) && <Actions pro={pro} onRemove={onRemove} onMove={onMove} />}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
