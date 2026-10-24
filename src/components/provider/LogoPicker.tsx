import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureNativePhoto, isNativePlatform } from "@/lib/camera";
import { BusinessLogo } from "@/components/provider/BusinessLogo";
import { useT } from "@/i18n/LanguageProvider";

// The backend accepts exactly these (SVC-336 `_read_image_upload`). Asking for
// them, rather than `image/*`, also makes iOS convert a HEIC photo to JPEG
// instead of sending a file the server would refuse with a 415.
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/**
 * Business logo picker (SVC-337), shared by onboarding step 1 and the Edit
 * business sheet.
 *
 * Shows, in order of precedence: the logo just picked, the stored logo, or the
 * default. It only reports a pick — the caller decides when to upload — so
 * onboarding can hold it until Continue and the sheet until Save.
 *
 * There is no "remove": the backend has no endpoint to delete a logo, so the
 * picker offers only Change once one exists.
 */
export function LogoPicker({
  currentUrl,
  file,
  onSelect,
}: {
  /** The stored logo, if the provider already has one. */
  currentUrl?: string | null;
  /** A logo picked but not yet uploaded. */
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

  const hasLogo = Boolean(file || currentUrl);
  const { t } = useT("provider");

  const pick = async () => {
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
    <div className="flex items-center gap-4">
      <BusinessLogo
        src={preview ?? currentUrl}
        alt={hasLogo ? t("business.yourLogo") : t("business.defaultLogo")}
        className="h-[72px] w-[72px]"
      />
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted-foreground">
          {hasLogo ? t("business.changeHint") : t("business.defaultHint")}
        </p>
        <Button type="button" variant="secondary" onClick={pick}>
          {!hasLogo && <Camera />}
          {hasLogo ? t("business.change") : t("business.addLogo")}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        data-testid="logo-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          // Let the same file be picked again after a failed upload.
          e.target.value = "";
        }}
      />
    </div>
  );
}
