/**
 * The submitted documents as thumbnails. A click opens a large view in a modal, so
 * the review stays in one window. The links are presigned for an hour and can expire
 * while the page sits open, so a failed image offers a retry that fetches new ones.
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { KycDetail } from "@/lib/kyc";

const TILE = "flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg";

function FailedImage({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div
      className={`${TILE} flex-col gap-2 border border-destructive/40 bg-destructive/5 p-2 text-center`}
    >
      <ImageOff className="h-4 w-4 text-destructive" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">Couldn't load</p>
      <Button variant="outline" size="sm" aria-label={`Retry ${label}`} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function DocumentTile({
  label,
  url,
  owner,
  onRetry,
}: {
  label: string;
  url: string | null;
  owner: string;
  onRetry: () => void;
}) {
  // Which link failed, not just that one did: a retry brings a new link, and that
  // one gets its own chance to load.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  function retry() {
    setFailedUrl(null);
    onRetry();
  }

  if (!url) {
    return (
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <div className={`${TILE} border border-dashed bg-secondary/30`}>
          <p className="text-xs text-muted-foreground">Not uploaded</p>
        </div>
      </div>
    );
  }

  const failed = failedUrl === url;
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <Dialog>
        {failed ? (
          <FailedImage label={label} onRetry={retry} />
        ) : (
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`Open ${label}`}
              className={`${TILE} border bg-secondary/30 hover:opacity-90`}
            >
              <img
                src={url}
                alt={label}
                className="h-full w-full object-cover"
                onError={() => setFailedUrl(url)}
              />
            </button>
          </DialogTrigger>
        )}
        {/* The single-column grid has to be allowed to shrink, or the image sets its
            width and overflows a phone screen. */}
        <DialogContent className="max-h-[95vh] w-[calc(100%-2rem)] max-w-4xl grid-cols-[minmax(0,1fr)] overflow-y-auto [color-scheme:light_dark]">
          <div className="space-y-1 pr-6">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{owner}</DialogDescription>
          </div>
          {failed ? (
            <FailedImage label={label} onRetry={retry} />
          ) : (
            <img
              src={url}
              alt={`${label}, large view`}
              className="max-h-[75vh] w-full object-contain"
              onError={() => setFailedUrl(url)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function KycDocuments({
  detail,
  owner,
  onRetry,
}: {
  detail: KycDetail;
  owner: string;
  onRetry: () => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-foreground">Documents</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DocumentTile
          label="Aadhaar front"
          url={detail.aadhaar_front_url}
          owner={owner}
          onRetry={onRetry}
        />
        <DocumentTile
          label="Aadhaar back"
          url={detail.aadhaar_back_url}
          owner={owner}
          onRetry={onRetry}
        />
        <DocumentTile label="Selfie" url={detail.selfie_url} owner={owner} onRetry={onRetry} />
      </div>
    </section>
  );
}
