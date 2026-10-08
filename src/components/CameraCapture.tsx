/**
 * Live-camera-only capture for KYC — no file upload (SVC-93 review). Opens the
 * device camera on native and a webcam modal (@ionic/pwa-elements) on web.
 *
 * Lifted out of provider onboarding unchanged so the Pro's own KYC screen
 * (SVC-322) takes the same three photos the same way.
 */
import { useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { captureLivePhoto } from "@/lib/camera";

export function CameraCapture({
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
