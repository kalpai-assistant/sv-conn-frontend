/**
 * The service description (SVC-430): markdown, with Write and Preview. The preview
 * is lib/markdown-view.tsx, which renders the same subset the consumer app does,
 * so what an admin sees here is what a customer sees in the service sheet.
 *
 * The counter counts code points, as the backend's 2000 limit does: an emoji is 1.
 */
import { useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/catalog/Field";
import { DESCRIPTION_MAX } from "@/lib/catalog";
import { codePointLength } from "@/lib/markdown";
import { MarkdownView } from "@/lib/markdown-view";

type Tab = "write" | "preview";

const TABS = [
  { value: "write", label: "Write" },
  { value: "preview", label: "Preview" },
] as const;

export function MarkdownField({
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  value: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const name = useId();
  const [tab, setTab] = useState<Tab>("write");
  const length = codePointLength(value);
  const over = length > DESCRIPTION_MAX;
  const counterId = `${id}-counter`;

  return (
    <div className="min-w-0 space-y-2">
      <Segmented
        name={name}
        label="Description view"
        value={tab}
        options={TABS}
        onChange={setTab}
      />
      {tab === "write" ? (
        <Textarea
          id={id}
          value={value}
          rows={8}
          placeholder={"What's included:\n- Fitting\n- Leak test\n\n**Not included:** parts"}
          className="font-mono text-sm"
          aria-invalid={invalid || over ? true : undefined}
          aria-describedby={[describedBy, counterId].filter(Boolean).join(" ")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div
          role="region"
          aria-label="Description preview"
          className="min-h-[10rem] rounded-md border bg-background p-3 text-sm leading-relaxed text-muted-foreground"
        >
          <MarkdownView source={value} className="space-y-2" />
          {value.trim() === "" && <p className="italic">Nothing to preview.</p>}
        </div>
      )}
      <p
        id={counterId}
        className={`text-right text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}
      >
        {length.toLocaleString("en-IN")} / {DESCRIPTION_MAX.toLocaleString("en-IN")}
      </p>
    </div>
  );
}
