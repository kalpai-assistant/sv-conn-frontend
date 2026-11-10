/**
 * Pick one of the 30 preset icons, or none (SVC-430). The ticket's call: a picker,
 * not an upload, because icon drift kills the catalog's look.
 *
 * Native radios under the tiles, so the keyboard works as for any radio group:
 * Tab reaches the chosen tile, arrow keys move the choice, and a screen reader
 * hears each label. The labels show under the icons too, since an icon's name
 * isn't always obvious from its shape.
 */
import { Ban } from "lucide-react";
import { CATALOG_ICONS } from "@/lib/catalog-icons";

const TILE =
  "flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-center text-[11px] leading-tight has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";
const CHOSEN = "border-primary bg-primary/10 text-foreground";
const UNCHOSEN = "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground";

export function IconPicker({
  id,
  name,
  value,
  disabled,
  describedBy,
  onChange,
}: {
  id: string;
  name: string;
  value: string | null;
  disabled?: boolean;
  describedBy?: string;
  onChange: (value: string | null) => void;
}) {
  const options = [
    { key: "", label: "No icon", Icon: Ban },
    ...CATALOG_ICONS.map(({ key, label, Icon }) => ({ key, label, Icon })),
  ];
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-describedby={describedBy}
      className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
    >
      {options.map(({ key, label, Icon }, index) => {
        const checked = (value ?? "") === key;
        return (
          <label key={key || "none"} className={`${TILE} ${checked ? CHOSEN : UNCHOSEN}`}>
            <input
              type="radio"
              // The first radio carries the id, so the field's <Label> focuses the group.
              id={index === 0 ? id : undefined}
              name={name}
              value={key}
              checked={checked}
              disabled={disabled}
              className="sr-only"
              onChange={() => onChange(key || null)}
            />
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="w-full [overflow-wrap:anywhere]">{label}</span>
          </label>
        );
      })}
    </div>
  );
}
