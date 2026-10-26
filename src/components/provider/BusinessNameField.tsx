import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LanguageProvider";

/** Matches the backend's limit (SVC-336), so typing can never produce its 422. */
export const BUSINESS_NAME_MAX = 100;

/**
 * Business name input (SVC-337), shared by onboarding step 1 and the Edit
 * business sheet so both show the same label, limit, help and error state.
 */
export function BusinessNameField({
  id,
  value,
  onChange,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const helpId = `${id}-help`;
  const { t } = useT("provider");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("business.nameLabel")}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("business.namePlaceholder")}
        maxLength={BUSINESS_NAME_MAX}
        aria-invalid={invalid || undefined}
        aria-describedby={helpId}
        className={cn(invalid && "border-destructive ring-3 ring-destructive/15")}
      />
      <p id={helpId} className="text-xs text-muted-foreground">
        {t("business.nameHelp")}
      </p>
    </div>
  );
}
