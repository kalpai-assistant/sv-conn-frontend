import { Capacitor } from "@capacitor/core";

export const isNativePlatform = () => Capacitor.isNativePlatform();

// On a native device, open the camera/gallery via Capacitor and return the image
// as a Blob (ready for FormData upload). On web, callers fall back to a file input.
export async function captureNativePhoto(): Promise<Blob | null> {
  // Imported lazily so the web bundle doesn't pull the plugin unless on device.
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
