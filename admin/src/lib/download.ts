/**
 * File downloads through the admin session (SVC-426: the payouts CSV). apiFetch
 * always parses JSON, so this sits on apiFetchResponse instead: the same token,
 * token roll, 401 sign-out and ApiError, but the body is kept as a blob.
 *
 * The browser hides Content-Disposition on a cross-origin response unless the
 * backend lists it in Access-Control-Expose-Headers, which it doesn't today. So
 * every caller passes a fallback name, the same one the backend would have sent.
 */
import { apiFetchResponse } from "@/lib/api";

/**
 * The filename in a Content-Disposition header, or null. Prefers RFC 5987's
 * filename*, and keeps only the last path segment so a header can't name a folder.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  let name: string | null = null;
  const extended = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ""));
    } catch {
      name = null;
    }
  }
  if (name === null) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(header);
    name = plain ? (plain[1] ?? plain[2] ?? "").trim() : null;
  }
  if (!name) {
    return null;
  }
  const base = name
    .split(/[/\\]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return base && base !== "." && base !== ".." ? base : null;
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not straight away: some browsers are still reading the URL after click().
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * GETs a path and saves the body. Returns the filename used. Throws ApiError like
 * apiFetch, so a 422 carries the backend's message.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<string> {
  const res = await apiFetchResponse(path);
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? fallbackName;
  saveBlob(blob, filename);
  return filename;
}
