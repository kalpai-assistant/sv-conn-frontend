/**
 * Privacy Policy (SVC-37).
 *
 * Content is the source-of-truth Markdown at src/legal/privacy.md. To update
 * wording, edit the .md file and bump LAST_UPDATED. No JSX changes needed.
 *
 * Reachable without login — see the public-legal carve-out in __root.tsx.
 * Same URL is referenced from Razorpay merchant onboarding, Play Store
 * data-safety form, and App Store Privacy Nutrition. Never rename this route
 * without adding a redirect first.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import privacyMd from "@/legal/privacy.md?raw";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

const LAST_UPDATED = "19 July 2026";

function PrivacyPage() {
  return <LegalPage markdown={privacyMd} lastUpdated={LAST_UPDATED} />;
}
