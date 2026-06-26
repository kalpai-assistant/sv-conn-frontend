import { Capacitor } from "@capacitor/core";

export const isNativePlatform = () => Capacitor.isNativePlatform();

// Profile photo: camera OR gallery (upload allowed). Used on native; web uses a file input.
export async function captureNativePhoto(): Promise<Blob | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 80,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
  });
  if (!photo.webPath) return null;
  const res = await fetch(photo.webPath);
  return res.blob();
}

// KYC capture: LIVE camera only — no gallery / upload (SVC-93 review). `CameraSource.Camera`
// skips the camera-or-gallery prompt; on web we register @ionic/pwa-elements so the same
// call opens a live webcam modal (without it, web would fall back to a file picker).
export async function captureLivePhoto(direction: "front" | "rear" = "rear"): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) {
    const { defineCustomElements } = await import("@ionic/pwa-elements/loader");
    await defineCustomElements(window); // idempotent
  }
  const { Camera, CameraResultType, CameraSource, CameraDirection } =
    await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 80,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    direction: direction === "front" ? CameraDirection.Front : CameraDirection.Rear,
  });
  if (!photo.webPath) return null;
  const res = await fetch(photo.webPath);
  return res.blob();
}
