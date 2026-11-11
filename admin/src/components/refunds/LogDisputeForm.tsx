/**
 * Log a dispute on the customer's behalf (SVC-431). There is no consumer "I had
 * an issue" button yet, so this is the only way a dispute starts. It moves no
 * money, so it needs no confirm.
 */
import { useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/catalog/Field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REASON_OPTIONS,
  TEXT_MAX,
  checkLogForm,
  createDispute,
  type DisputeRow,
  type LogErrors,
  type LogForm,
  type ReasonCode,
} from "@/lib/disputes";

export function LogDisputeForm({
  bookingId,
  onLogged,
  onFailed,
}: {
  bookingId: string;
  onLogged: (row: DisputeRow) => void;
  onFailed: (err: unknown) => void;
}) {
  const [form, setForm] = useState<LogForm>({ reason_code: "", description: "" });
  const [errors, setErrors] = useState<LogErrors>({});
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const check = checkLogForm(form, bookingId);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    inFlight.current = true;
    setBusy(true);
    try {
      onLogged(await createDispute(check.body));
    } catch (err) {
      onFailed(err);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground">
        No open dispute. Log one for the customer, from what they told support.
      </p>
      <Field id="dispute-reason" label="Reason" error={errors.reason_code}>
        {(describedBy) => (
          <Select
            value={form.reason_code || undefined}
            onValueChange={(value) => setForm({ ...form, reason_code: value as ReasonCode })}
          >
            <SelectTrigger
              id="dispute-reason"
              aria-describedby={describedBy}
              aria-invalid={errors.reason_code ? true : undefined}
            >
              <SelectValue placeholder="Pick a reason" />
            </SelectTrigger>
            <SelectContent>
              {REASON_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        id="dispute-description"
        label="What the customer says"
        hint={`${form.description.trim().length} / ${TEXT_MAX}`}
        error={errors.description}
      >
        {(describedBy) => (
          <Textarea
            id="dispute-description"
            rows={4}
            value={form.description}
            aria-describedby={describedBy}
            aria-invalid={errors.description ? true : undefined}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        )}
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Logging…" : "Log dispute"}
      </Button>
    </form>
  );
}
