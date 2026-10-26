import { useState } from "react";
import type { PayoutInput, PayoutMethodKind } from "@/hooks/useApi";
import { validateVpa, validateAccountNumber, validateIfsc } from "@/lib/payout-validation";
import type { Translate } from "@/i18n";

// Shared state + validation behind the payout entry fields, used by both the
// onboarding step (SVC-133) and the edit screen (SVC-148). Lives apart from the
// markup so each screen can keep its own buttons — onboarding has Back / Save &
// continue / Skip, the edit screen has Save / Cancel — while the rules that decide
// what reaches the API stay in exactly one place.
//
// `t` (SVC-376) puts the validation messages in the screen's language; the
// validators default to English without it.
export function usePayoutMethodForm(initialMethod: PayoutMethodKind = "upi", t?: Translate) {
  const [method, setMethodState] = useState<PayoutMethodKind>(initialMethod);
  const [vpa, setVpa] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Clearing the error on switch matters: a UPI error left standing over the bank
  // fields reads as a complaint about the account number the user is now typing.
  const setMethod = (next: PayoutMethodKind) => {
    setMethodState(next);
    setError(null);
  };

  const reset = () => {
    setVpa("");
    setAccountNumber("");
    setIfsc("");
    setError(null);
  };

  // Validated payload for PATCH /providers/me, or null when the input is bad —
  // in which case `error` holds the message to render. Validating here rather
  // than letting the server decide is what keeps an uninterpretable 422 off the
  // screen; the rules in payout-validation mirror the backend exactly.
  const buildPayload = (): PayoutInput | null => {
    setError(null);
    if (method === "upi") {
      const err = validateVpa(vpa, t);
      if (err) {
        setError(err);
        return null;
      }
      return { payout_vpa: vpa.trim() };
    }
    const accErr = validateAccountNumber(accountNumber, t);
    if (accErr) {
      setError(accErr);
      return null;
    }
    const ifscErr = validateIfsc(ifsc, t);
    if (ifscErr) {
      setError(ifscErr);
      return null;
    }
    // Account number and IFSC always travel together — the backend 422s on one
    // without the other, so there is no partial-bank-details payload to build.
    return {
      payout_account_number: accountNumber.trim(),
      payout_ifsc: ifsc.trim().toUpperCase(),
    };
  };

  return {
    method,
    setMethod,
    vpa,
    setVpa,
    accountNumber,
    setAccountNumber,
    ifsc,
    setIfsc,
    error,
    setError,
    buildPayload,
    reset,
  };
}

export type PayoutMethodFormState = ReturnType<typeof usePayoutMethodForm>;
