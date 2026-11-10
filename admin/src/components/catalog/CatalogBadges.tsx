/** Catalog row bits (SVC-430): the inactive badge and a row's icon. Tokens only. */
import { Pill } from "@/components/teams/TeamBadges";
import { catalogIcon } from "@/lib/catalog-icons";

export function InactivePill({ active }: { active: boolean }) {
  return active ? null : <Pill tone="quiet">Inactive</Pill>;
}

export function ActivePill({ active }: { active: boolean }) {
  return active ? <Pill tone="good">Active</Pill> : <Pill tone="quiet">Inactive</Pill>;
}

/** The row's icon, or an empty square of the same size so the names line up. */
export function RowIcon({ iconKey }: { iconKey: string | null }) {
  const icon = catalogIcon(iconKey);
  if (!icon) return <span className="size-4 shrink-0" aria-hidden="true" />;
  return <icon.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

/** The chosen icon with its label, for the read-only view. */
export function IconFact({ iconKey }: { iconKey: string | null }) {
  const icon = catalogIcon(iconKey);
  if (!icon) return <span className="text-muted-foreground">No icon</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <icon.Icon className="size-4" aria-hidden="true" />
      {icon.label}
    </span>
  );
}
