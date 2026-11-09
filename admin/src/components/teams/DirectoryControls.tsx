/**
 * The directories' search box, their yes/no/either selects, and the pager for a
 * list the backend sends without a total.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KYC_STATUSES, SEARCH_MIN, kycLabel } from "@/lib/teams";
import type { KycStatus } from "@/lib/kyc";

/**
 * Applies on Enter or Search, so a half-typed phone asks the backend for nothing.
 * One character is held back with a hint: the backend refuses it with a 422.
 */
export function DirectorySearch({
  label,
  placeholder,
  value,
  onSearch,
}: {
  label: string;
  placeholder: string;
  value: string | undefined;
  onSearch: (q: string | undefined) => void;
}) {
  const id = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [short, setShort] = useState(false);
  useEffect(() => setDraft(value ?? ""), [value]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const term = draft.trim();
    if (term.length > 0 && term.length < SEARCH_MIN) {
      setShort(true);
      return;
    }
    setShort(false);
    onSearch(term || undefined);
  }

  return (
    <form role="search" onSubmit={submit} className="min-w-0 space-y-1.5" noValidate>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          autoComplete="off"
          placeholder={placeholder}
          value={draft}
          aria-describedby={short ? hintId : undefined}
          aria-invalid={short ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setShort(false);
          }}
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Search
        </Button>
      </div>
      {short && (
        <p id={hintId} role="alert" className="text-xs text-destructive">
          Type at least {SEARCH_MIN} characters.
        </p>
      )}
    </form>
  );
}

// A Select item can't have an empty value, and no option is called this.
const ANY = "__any__";

/** A filter with a fixed set of options plus "any". */
export function OptionFilter<T extends string>({
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  anyLabel: string;
  options: { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? undefined : (next as T))}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const KYC_OPTIONS: { value: KycStatus; label: string }[] = KYC_STATUSES.map((status) => ({
  value: status,
  label: kycLabel(status),
}));

/** A yes/no/either filter, held as a boolean in the URL. */
export function BooleanFilter({
  label,
  value,
  anyLabel,
  yes,
  no,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  anyLabel: string;
  yes: string;
  no: string;
  onChange: (value: boolean | undefined) => void;
}) {
  return (
    <OptionFilter
      label={label}
      anyLabel={anyLabel}
      value={value === undefined ? undefined : value ? "yes" : "no"}
      options={[
        { value: "yes", label: yes },
        { value: "no", label: no },
      ]}
      onChange={(next) => onChange(next === undefined ? undefined : next === "yes")}
    />
  );
}

/** Previous / Next where the backend sends no total: Next while the page came back full. */
export function NextPager({
  label,
  page,
  hasMore,
  shown,
  onPage,
}: {
  label: string;
  page: number;
  hasMore: boolean;
  /** How many rows this page shows. */
  shown: number;
  onPage: (page: number) => void;
}) {
  if (page === 1 && !hasMore) {
    return null;
  }
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} · {shown} shown
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
