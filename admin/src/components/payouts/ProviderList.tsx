/**
 * One page of SPs, largest pending amount first. A table where the pane is wide
 * enough, cards where it isn't: the pane decides, not the window, because it
 * narrows when an SP's detail opens beside it (the same as the bookings list).
 */
import { ChevronRight } from "lucide-react";
import { KycPill, ProviderFlags } from "@/components/payouts/PayoutBadges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPaise } from "@/lib/money";
import { providerDisplayName, type PayoutProvider } from "@/lib/payouts";

interface ProviderListProps {
  providers: PayoutProvider[];
  selectedId: string | undefined;
  onOpen: (id: string) => void;
}

const WRAP = "[overflow-wrap:anywhere]";

function bookingsWord(count: number): string {
  return `${count} ${count === 1 ? "booking" : "bookings"}`;
}

/** An amount over its booking count, or a dash when there's nothing in the bucket. */
function Bucket({ count, paise }: { count: number; paise: number }) {
  if (count === 0 && paise === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="block">
      <span className="block font-medium tabular-nums">{formatPaise(paise)}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        {bookingsWord(count)}
      </span>
    </span>
  );
}

function YesNo({ value, no }: { value: boolean; no: string }) {
  return value ? <span>Yes</span> : <span className="font-medium text-destructive">{no}</span>;
}

export function ProviderList({ providers, selectedId, onOpen }: ProviderListProps) {
  return (
    <div className="@container">
      <ul aria-label="Service providers" className="space-y-2 @4xl:hidden">
        {providers.map((provider) => {
          const name = providerDisplayName(provider);
          const isSelected = provider.provider_id === selectedId;
          return (
            <li key={provider.provider_id}>
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                aria-label={`Open ${name}`}
                onClick={() => onOpen(provider.provider_id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-secondary/40 ${
                  isSelected ? "bg-secondary" : "bg-card"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className={`font-medium ${WRAP}`}>{name}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProviderFlags provider={provider} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Pending</dt>
                      <dd className="text-sm font-medium tabular-nums">
                        {formatPaise(provider.pending_paise)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({provider.pending_count})
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sends now</dt>
                      <dd className="text-sm font-medium tabular-nums">
                        {formatPaise(provider.payable_paise)}
                      </dd>
                    </div>
                    {provider.failed_count > 0 && (
                      <div>
                        <dt className="text-muted-foreground">Failed</dt>
                        <dd className="font-medium text-destructive tabular-nums">
                          {formatPaise(provider.failed_paise)} ({provider.failed_count})
                        </dd>
                      </div>
                    )}
                    {provider.reversed_count > 0 && (
                      <div>
                        <dt className="text-muted-foreground">Reversed</dt>
                        <dd className="font-medium text-destructive tabular-nums">
                          {formatPaise(provider.reversed_paise)} ({provider.reversed_count})
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="tabular-nums">{formatPaise(provider.completed_paise)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Earned</dt>
                      <dd className="tabular-nums">{formatPaise(provider.earned_paise)}</dd>
                    </div>
                  </dl>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border @4xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service provider</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Payout method</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Reversed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Sends now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => {
              const name = providerDisplayName(provider);
              const isSelected = provider.provider_id === selectedId;
              return (
                <TableRow
                  key={provider.provider_id}
                  onClick={() => onOpen(provider.provider_id)}
                  className={`cursor-pointer align-top ${isSelected ? "bg-secondary" : ""}`}
                >
                  <TableCell className={`whitespace-normal ${WRAP}`}>
                    {/* The row is clickable for a mouse; this is the way in for a keyboard. */}
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`Open ${name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(provider.provider_id);
                      }}
                      className="rounded text-left font-medium underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {name}
                    </button>
                    {name !== provider.phone && (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {provider.phone}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <KycPill status={provider.kyc_status} />
                  </TableCell>
                  <TableCell>
                    <YesNo value={provider.payout_set} no="Not set" />
                  </TableCell>
                  <TableCell>
                    <YesNo value={provider.is_active} no="Deactivated" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Bucket count={provider.pending_count} paise={provider.pending_paise} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Bucket count={provider.failed_count} paise={provider.failed_paise} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Bucket count={provider.reversed_count} paise={provider.reversed_paise} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Bucket count={provider.completed_count} paise={provider.completed_paise} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Bucket count={provider.earned_count} paise={provider.earned_paise} />
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatPaise(provider.payable_paise)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
