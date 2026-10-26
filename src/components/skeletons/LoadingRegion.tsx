/**
 * Wrapper for a block of skeletons. Gives screen readers a loading
 * announcement; a bare skeleton is just empty, silent divs.
 *
 * `role="status"` with `aria-busy` and a visually hidden "Loading…" line. That
 * line comes last on purpose: it is absolutely positioned, so as the last child
 * it takes no grid cell, flex gap or `space-y` margin from the real layout.
 */
import type { ReactNode } from "react";
import { useT } from "@/i18n/LanguageProvider";

export function LoadingRegion({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <div role="status" aria-busy="true" className={className}>
      {children}
      <span className="sr-only">{t("skeleton.loading")}</span>
    </div>
  );
}
