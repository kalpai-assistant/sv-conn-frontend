import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  Lock,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ServicesPicker } from "@/components/provider/ServicesPicker";
import { PayoutStep } from "@/components/provider/PayoutStep";
import { ServiceAreaStep } from "@/components/provider/ServiceAreaStep";
import { BusinessNameField } from "@/components/provider/BusinessNameField";
import { LogoPicker } from "@/components/provider/LogoPicker";
import { useAuth } from "@/lib/auth-context";
import { Celebration } from "@/components/Celebration";
import { CameraCapture } from "@/components/CameraCapture";
import { LanguageChip } from "@/components/language/LanguageChip";
import { captureLivePhoto, captureNativePhoto, isNativePlatform } from "@/lib/camera";
import { formatRupees } from "@/i18n/format";
import { useOnboardingEarnings } from "@/lib/onboarding-earnings";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
} from "@/lib/onboarding-storage";
import {
  useProviderProfile,
  useUpdateName,
  useUpdateLanguages,
  useUploadPhoto,
  useUpdateBusinessName,
  useUploadBusinessImage,
  useSubmitKyc,
} from "@/hooks/useApi";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/provider/onboarding")({
  component: ProviderOnboardingPage,
});

// Numbered-step screens the provider walks through (1..5). Step 0 is the
// SVC-490 welcome hero — unnumbered, hidden from the progress label — so a
// returning provider seeing the stepper reads "Step 2 of 5" and not an
// off-by-one caused by the welcome.
const NUMBERED_STEPS = 5;

function ProviderOnboardingPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { data: profile } = useProviderProfile();
  // SVC-376: the language is read from context on every render, so choosing
  // one in the first-run prompt re-renders this wizard in place — same step,
  // same typed fields — rather than remounting it.
  const { t, lang } = useT("provider");
  const earnings = useOnboardingEarnings();

  const updateName = useUpdateName();
  const uploadPhoto = useUploadPhoto();
  const updateLanguages = useUpdateLanguages();
  const updateBusinessName = useUpdateBusinessName();
  const uploadBusinessImage = useUploadBusinessImage();
  const submitKyc = useSubmitKyc();

  // Resume from a saved draft (step + text fields); images are re-captured.
  // Fresh installs (draft.step undefined) land on step 0 — the SVC-490
  // welcome hero. A returning provider whose draft persisted mid-flow
  // resumes where they left off; a rejection-resubmit path has no draft
  // (it was cleared on prior finish) and so also lands on step 0, which is
  // the right shape — they see the rejection banner (added below) above
  // the welcome and tap "Start setup" when ready.
  const draft = useMemo(() => loadOnboardingDraft(), []);
  const [step, setStep] = useState(draft.step ?? 0);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [name, setName] = useState(draft.name ?? user?.name ?? "");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [languages, setLanguages] = useState<string[]>(draft.languages ?? []);
  const [langInput, setLangInput] = useState("");
  // SVC-337: the business. Required name; optional logo (the default shows when
  // there is none). The logo Blob is held until Continue, like the photo.
  const [businessName, setBusinessName] = useState(draft.businessName ?? "");
  const [businessNameInvalid, setBusinessNameInvalid] = useState(false);
  const [businessLogo, setBusinessLogo] = useState<Blob | null>(null);

  // A provider sent back here after finishing — "Resubmit documents", or the
  // missing-service-area redirect — has no draft (it is cleared on finish), but
  // already has a business name on the server. Fill it in once the profile
  // loads so they are not made to retype it. Only once, and never over a draft
  // or anything they have started typing.
  const prefilledBusinessName = useRef(false);
  useEffect(() => {
    if (prefilledBusinessName.current || !profile) return;
    prefilledBusinessName.current = true;
    if (profile.business_name) {
      setBusinessName((current) => current || profile.business_name || "");
    }
  }, [profile]);

  // Step 2 state — all captured live (no upload)
  const [aadhaarFront, setAadhaarFront] = useState<Blob | null>(null);
  const [aadhaarBack, setAadhaarBack] = useState<Blob | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);

  // SVC-490 — celebrate arriving at step 5 the first time only. A provider
  // who closes the app mid-flow and reopens on step 5 should not retrigger
  // the confetti; latch via a ref rather than a state flag so the effect
  // never fires twice in strict-mode double-invocation either.
  const [celebrating, setCelebrating] = useState(false);
  const hasCelebrated = useRef(false);
  useEffect(() => {
    if (step === 5 && !hasCelebrated.current) {
      hasCelebrated.current = true;
      setCelebrating(true);
    }
  }, [step]);

  // Persist the resumable parts of the wizard on every change.
  useEffect(() => {
    saveOnboardingDraft({ step, name, languages, businessName });
  }, [step, name, languages, businessName]);

  const saving =
    updateName.isPending ||
    uploadPhoto.isPending ||
    updateLanguages.isPending ||
    updateBusinessName.isPending ||
    uploadBusinessImage.isPending ||
    submitKyc.isPending;

  const addLanguage = () => {
    const value = langInput.trim();
    if (!value) return;
    if (!languages.some((l) => l.toLowerCase() === value.toLowerCase())) {
      setLanguages((prev) => [...prev, value]);
    }
    setLangInput("");
  };

  const handleStep1 = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t("onboarding.nameRequired"));
      return;
    }
    if (!businessName.trim()) {
      setBusinessNameInvalid(true);
      setError(t("onboarding.businessRequired"));
      return;
    }
    try {
      await updateName.mutateAsync(name.trim());
      updateUser({ name: name.trim() });
      await updateBusinessName.mutateAsync(businessName.trim());
      if (photo) await uploadPhoto.mutateAsync(photo);
      if (businessLogo) {
        await uploadBusinessImage.mutateAsync(businessLogo);
        // Uploaded: from here the picker shows the stored logo, and coming back
        // to this step and pressing Continue again will not upload it twice.
        setBusinessLogo(null);
      }
      if (languages.length) await updateLanguages.mutateAsync(languages);
      setStep(2);
    } catch (err) {
      setError(errorText(err, t("onboarding.saveFailed"), lang));
    }
  };

  const handleStep2 = async () => {
    setError(null);
    if (!aadhaarFront || !aadhaarBack || !selfie) {
      setError(t("onboarding.docsRequired"));
      return;
    }
    try {
      await submitKyc.mutateAsync({ aadhaarFront, aadhaarBack, selfie });
      setStep(3);
    } catch (err) {
      setError(errorText(err, t("onboarding.submitFailed"), lang));
    }
  };

  const finish = () => {
    clearOnboardingDraft();
    navigate({ to: "/provider" });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-6">
      <header>
        <div className="flex items-center justify-between gap-3">
          {/* The stepper only labels numbered screens (1..5). The SVC-490
              welcome hero at step 0 is a landing, not a step — labelling it
              "Step 0 of 5" would read as broken. A spacer keeps the language
              chip right-aligned when the label is hidden. */}
          {step >= 1 ? (
            <p className="text-xs font-medium text-muted-foreground">
              {t("onboarding.stepOf", { step, total: NUMBERED_STEPS })}
            </p>
          ) : (
            <span />
          )}
          {/* SVC-395: no Profile to reach mid-wizard, so the switch is here. */}
          <LanguageChip />
        </div>
        {step >= 1 && <Progress value={(step / NUMBERED_STEPS) * 100} className="mt-2" />}
      </header>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {/* SVC-490 — rejection-aware banner. When a provider lands here after
          a rejection, the "Resubmit documents" fix link on Home is the only
          place they see the reviewer's reason — and then it's gone the
          moment they tap in. Surfacing it on the onboarding header too
          means the reason stays on screen the whole time they're walking
          back through the flow. Shown on every step (0..5) because a
          provider may want to re-read it mid-recapture. */}
      {profile?.kyc_status === "rejected" && (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-destructive">{t("onboarding.rejectionBannerTitle")}</p>
            {(() => {
              // Mirror `kycRow` on provider Home (SVC-444): trim the
              // reviewer's text, drop a trailing period so our template
              // adds one if needed. Reason is null for a rejection that
              // predates SVC-444 — hide the line rather than print "Reason: ".
              const raw = profile.kyc_rejection_reason?.trim().replace(/\.$/, "");
              return raw ? (
                <p className="text-foreground wrap-anywhere">
                  {t("onboarding.rejectionBannerReason", { reason: raw })}
                </p>
              ) : null;
            })()}
          </div>
        </div>
      )}

      <div className="mt-6 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              // SVC-490 welcome hero. Deliberately a landing, not a form step:
              // the first screen a new provider sees needs to answer "what am
              // I about to earn?" and "what do you need from me?" in one
              // glance. The number is a city-generic placeholder
              // (`confidence: "placeholder"` on the hook) until SVC-495 wires
              // per-service per-city ranges from Tushar's pricing corpus —
              // prefixed "Typical" rather than a specific service name so the
              // copy reads as an estimate, not a promise.
              <div className="space-y-6 py-4">
                <div
                  className="flex items-center justify-center rounded-3xl bg-linear-to-br from-primary/15 to-primary/5 py-10 dark:from-primary/20 dark:to-primary/10"
                  data-asset="pending-svc-401"
                  aria-hidden
                >
                  <Sparkles className="h-16 w-16 text-primary" strokeWidth={1.5} />
                </div>

                <div className="space-y-2 text-center">
                  <h1 className="text-xl font-semibold text-foreground">
                    {t("onboarding.welcomeTitle")}
                  </h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("onboarding.welcomeEarnings", {
                      low: formatRupees(earnings.low, lang),
                      high: formatRupees(earnings.high, lang),
                    })}
                  </p>
                </div>

                <ol className="space-y-3">
                  {(
                    [
                      {
                        icon: (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                        ),
                        label: t("onboarding.welcomeStepKyc"),
                      },
                      {
                        icon: <Rocket className="h-5 w-5 shrink-0 text-primary" aria-hidden />,
                        label: t("onboarding.welcomeStepServices"),
                      },
                      {
                        icon: <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />,
                        label: t("onboarding.welcomeStepFirstJob"),
                      },
                    ] as const
                  ).map((row, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground"
                    >
                      {row.icon}
                      <span>{row.label}</span>
                    </li>
                  ))}
                </ol>

                <Button className="w-full" onClick={() => setStep(1)}>
                  {t("onboarding.welcomeCta")}
                </Button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    {t("onboarding.aboutTitle")}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.aboutIntro")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t("onboarding.nameLabel")}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("onboarding.namePlaceholder")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("onboarding.photoLabel")}</Label>
                  <ImageInput label={t("onboarding.photoAdd")} file={photo} onSelect={setPhoto} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lang">{t("onboarding.languagesLabel")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="lang"
                      value={langInput}
                      onChange={(e) => setLangInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addLanguage();
                        }
                      }}
                      placeholder={t("onboarding.languagesPlaceholder")}
                    />
                    <Button type="button" variant="secondary" onClick={addLanguage}>
                      {t("onboarding.add")}
                    </Button>
                  </div>
                  {languages.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {languages.map((spoken) => (
                        <span
                          key={spoken}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                        >
                          {spoken}
                          <button
                            type="button"
                            onClick={() => setLanguages((prev) => prev.filter((l) => l !== spoken))}
                            aria-label={t("onboarding.removeLanguage", { language: spoken })}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* SVC-337: the business the provider trades as. */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("onboarding.yourBusiness")}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <BusinessNameField
                  id="business-name"
                  value={businessName}
                  onChange={(value) => {
                    setBusinessName(value);
                    if (businessNameInvalid && value.trim()) setBusinessNameInvalid(false);
                  }}
                  invalid={businessNameInvalid}
                />

                <div className="space-y-2">
                  <Label>
                    {t("onboarding.logoLabel")}{" "}
                    <span className="font-normal text-muted-foreground">
                      {t("onboarding.optional")}
                    </span>
                  </Label>
                  <LogoPicker
                    currentUrl={profile?.business_image_url}
                    file={businessLogo}
                    onSelect={setBusinessLogo}
                  />
                </div>

                <Button className="w-full" disabled={saving} onClick={handleStep1}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.continue")}
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    {t("onboarding.kycTitle")}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.kycIntro")}</p>
                </div>

                {/* SVC-490 — trust block. KYC was the drop-off point in the
                    pre-Phase-1 flow: the provider went from naming their
                    business to a cold "Capture Aadhaar front" with no
                    framing. Saying plainly who sees the documents and why
                    we need them, with a lock icon, turns the ask from an
                    extraction into a contract. Deliberately short — one
                    sentence per line — so it reads at a glance, not as
                    legal boilerplate. */}
                <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-medium text-foreground">{t("onboarding.kycTrustTitle")}</p>
                    <p className="text-muted-foreground">{t("onboarding.kycTrustBody")}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("onboarding.aadhaarFront")}</Label>
                  <CameraCapture
                    label={t("onboarding.captureFront")}
                    file={aadhaarFront}
                    onCapture={setAadhaarFront}
                    direction="rear"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("onboarding.aadhaarBack")}</Label>
                  <CameraCapture
                    label={t("onboarding.captureBack")}
                    file={aadhaarBack}
                    onCapture={setAadhaarBack}
                    direction="rear"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("onboarding.selfie")}</Label>
                  <CameraCapture
                    label={t("onboarding.captureSelfie")}
                    file={selfie}
                    onCapture={setSelfie}
                    direction="front"
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    {t("onboarding.back")}
                  </Button>
                  <Button className="flex-1" disabled={saving} onClick={handleStep2}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.submit")}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              // SVC-257: service-area capture between KYC and payout. Without
              // a centre set, the PostGIS dispatch treats the provider as
              // invisible and the go-online toggle refuses (SERVICE_AREA_MISSING).
              <ServiceAreaStep onBack={() => setStep(2)} onDone={() => setStep(4)} />
            )}

            {step === 4 && (
              <PayoutStep
                alreadySet={!!profile?.payout_set}
                onBack={() => setStep(3)}
                onDone={() => setStep(5)}
              />
            )}

            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    {t("onboarding.servicesTitle")}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("onboarding.servicesIntro")}
                  </p>
                </div>

                <ServicesPicker
                  locked={profile?.kyc_status !== "verified"}
                  title={t("onboarding.servicesPickerTitle")}
                  description={t("onboarding.servicesPickerDescription")}
                />

                {/* SVC-490: spring-scale motion on the dashboard CTA. The
                    step-5 arrival is the one moment in the whole wizard
                    where the provider's reward is "you're done" — a plain
                    button here reads as "ok, now do the next thing" rather
                    than "nice, you made it". `whileTap` gives the physical
                    feedback of a successful press. */}
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                >
                  <Button className="w-full" onClick={finish}>
                    {t("onboarding.dashboard")}
                  </Button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Full-screen takeover on the one-way transition to step 5.
          SVC-390's Celebration auto-dismisses after 1.5s and honours
          reduced-motion (drops confetti, keeps the hold). Rendered outside
          the AnimatePresence so a step-transition exit does not race the
          overlay's own enter. */}
      {celebrating && <Celebration onComplete={() => setCelebrating(false)} />}
    </div>
  );
}

// File-input image picker with preview (Pass 1). Pass 2 swaps this for the
// native Capacitor camera while keeping the same File-based onSelect contract.
function ImageInput({
  label,
  file,
  onSelect,
}: {
  label: string;
  file: Blob | null;
  onSelect: (file: Blob) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleClick = async () => {
    // On device use the native camera/gallery; on web fall back to a file input.
    if (isNativePlatform()) {
      try {
        const blob = await captureNativePhoto();
        if (blob) onSelect(blob);
      } catch {
        // user cancelled or denied permission — no-op
      }
    } else {
      inputRef.current?.click();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex h-32 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <>
            <Camera className="h-6 w-6" />
            {label}
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
    </>
  );
}
