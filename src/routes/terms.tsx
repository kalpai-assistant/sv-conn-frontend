/**
 * Terms & Conditions (SVC-37).
 *
 * Content is the source-of-truth Markdown at src/legal/terms.md. To update
 * wording, edit the .md file and bump LAST_UPDATED.
 *
 * Reachable without login — see the public-legal carve-out in __root.tsx.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import termsMd from "@/legal/terms.md?raw";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

const LAST_UPDATED = "19 July 2026";

function TermsPage() {
  return <LegalPage markdown={termsMd} lastUpdated={LAST_UPDATED} />;
}
