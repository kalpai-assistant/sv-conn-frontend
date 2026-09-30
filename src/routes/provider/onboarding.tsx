import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, X } from "lucide-react";
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
import { captureLivePhoto, captureNativePhoto, isNativePlatform } from "@/lib/camera";
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

export const Route = createFileRoute("/provider/onboarding")({
  component: ProviderOnboardingPage,
});

const TOTAL_STEPS = 5;

function ProviderOnboardingPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { data: profile } = useProviderProfile();

  const updateName = useUpdateName();
  const uploadPhoto = useUploadPhoto();
  const updateLanguages = useUpdateLanguages();
  const updateBusinessName = useUpdateBusinessName();
  const uploadBusinessImage = useUploadBusinessImage();
  const submitKyc = useSubmitKyc();

  // Resume from a saved draft (step + text fields); images are re-captured.
  const draft = useMemo(() => loadOnboardingDraft(), []);
  const [step, setStep] = useState(draft.step ?? 1);
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
      setError("Please enter your name.");
      return;
    }
    if (!businessName.trim()) {
      setBusinessNameInvalid(true);
      setError("Please enter your business name.");
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
      setError(err instanceof Error ? err.message : "Couldn’t save your details. Try again.");
    }
  };

  const handleStep2 = async () => {
    setError(null);
    if (!aadhaarFront || !aadhaarBack || !selfie) {
      setError("Please capture the Aadhaar front, Aadhaar back, and a live selfie.");
      return;
    }
    try {
      await submitKyc.mutateAsync({ aadhaarFront, aadhaarBack, selfie });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t submit your documents. Try again.");
    }
  };

  const finish = () => {
    clearOnboardingDraft();
    navigate({ to: "/provider" });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-6">
      <header>
        <p className="text-xs font-medium text-muted-foreground">
          Step {step} of {TOTAL_STEPS}
        </p>
        <Progress value={(step / TOTAL_STEPS) * 100} className="mt-2" />
      </header>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
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
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Tell us about you</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is what customers will see.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Profile photo</Label>
                  <ImageInput label="Add a profile photo" file={photo} onSelect={setPhoto} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lang">Languages</Label>
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
                      placeholder="e.g. Hindi"
                    />
                    <Button type="button" variant="secondary" onClick={addLanguage}>
                      Add
                    </Button>
                  </div>
                  {languages.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {languages.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                        >
                          {lang}
                          <button
                            type="button"
                            onClick={() => setLanguages((prev) => prev.filter((l) => l !== lang))}
                            aria-label={`Remove ${lang}`}
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
                    Your business
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
                    Business logo{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <LogoPicker
                    currentUrl={profile?.business_image_url}
                    file={businessLogo}
                    onSelect={setBusinessLogo}
                  />
                </div>

                <Button className="w-full" disabled={saving} onClick={handleStep1}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Verify your identity</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Take a live photo of your Aadhaar (front and back) and a selfie. These must be
                    captured with your camera — they can’t be uploaded.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Aadhaar — front</Label>
                  <CameraCapture
                    label="Capture Aadhaar front"
                    file={aadhaarFront}
                    onCapture={setAadhaarFront}
                    direction="rear"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Aadhaar — back</Label>
                  <CameraCapture
                    label="Capture Aadhaar back"
                    file={aadhaarBack}
                    onCapture={setAadhaarBack}
                    direction="rear"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Live selfie</Label>
                  <CameraCapture
                    label="Take a live selfie"
                    file={selfie}
                    onCapture={setSelfie}
                    direction="front"
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button className="flex-1" disabled={saving} onClick={handleStep2}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit documents"}
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
                  <h1 className="text-lg font-semibold text-foreground">Choose your services</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Documents submitted. Services unlock once our team verifies your KYC.
                  </p>
                </div>

                <ServicesPicker
                  locked={profile?.kyc_status !== "verified"}
                  title="Services"
                  description="Pick the services you’ll offer once verified."
                />

                <Button className="w-full" onClick={finish}>
                  Go to dashboard
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
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

// Live-camera-only capture for KYC — no file upload (SVC-93 review). Opens the
// device camera on native and a webcam modal (@ionic/pwa-elements) on web.
function CameraCapture({
  label,
  file,
  onCapture,
  direction,
}: {
  label: string;
  file: Blob | null;
  onCapture: (file: Blob) => void;
  direction: "front" | "rear";
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      const blob = await captureLivePhoto(direction);
      if (blob) onCapture(blob);
    } catch {
      // user cancelled or denied permission — no-op
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="flex h-32 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : preview ? (
        <img src={preview} alt={label} className="h-full w-full object-cover" />
      ) : (
        <>
          <Camera className="h-6 w-6" />
          {label}
        </>
      )}
    </button>
  );
}
