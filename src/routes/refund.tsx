/**
 * Refund & Cancellation Policy (SVC-37).
 *
 * Content is the source-of-truth Markdown at src/legal/refund.md. To update
 * wording, edit the .md file and bump LAST_UPDATED.
 *
 * Reachable without login — see the public-legal carve-out in __root.tsx.
 * Razorpay merchant onboarding asks for a refund policy URL separately from
 * privacy/terms; this route is the one to point them at.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import refundMd from "@/legal/refund.md?raw";

export const Route = createFileRoute("/refund")({
  component: RefundPage,
});

const LAST_UPDATED = "19 July 2026";

function RefundPage() {
  return <LegalPage markdown={refundMd} lastUpdated={LAST_UPDATED} />;
}
