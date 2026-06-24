// Per-step persistence for the provider onboarding wizard (SVC-93) so a
// kill/restart resumes at the last step. Only the step + text fields are stored;
// captured images (Blobs) are kept in memory and re-captured if the app restarts.
const KEY = "provider-onboarding";

export interface OnboardingDraft {
  step: number;
  name: string;
  languages: string[];
}

export function loadOnboardingDraft(): Partial<OnboardingDraft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<OnboardingDraft>) : {};
  } catch {
    return {};
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / serialization errors
  }
}

export function clearOnboardingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
