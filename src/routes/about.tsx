/**
 * About (SVC-277 bug 5).
 *
 * Another Profile row that rendered a chevron and did nothing.
 *
 * The version is the part that earns its place: when someone reports a bug,
 * the first question is which build they are on, and until now there was
 * nowhere in the app to read it. It doubles as a check that the release
 * pipeline (SVC-227.2) landed the bundle it meant to.
 *
 * The legal links point at routes that already exist — /terms, /privacy and
 * /refund render the source-of-truth Markdown in src/legal. Restating any of
 * that here would give us two versions of a policy and no way to know which
 * one someone read.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, FileText, Receipt, Shield } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const LEGAL = [
  { to: "/terms", icon: FileText, label: "Terms of Service" },
  { to: "/privacy", icon: Shield, label: "Privacy Policy" },
  { to: "/refund", icon: Receipt, label: "Refund Policy" },
] as const;

function AboutPage() {
  return (
    <div className="min-h-screen p-6">
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Profile
      </Link>

      <h1 className="mt-4 text-lg font-semibold text-foreground">About</h1>

      <div className="mt-4 rounded-xl border border-border p-4">
        <p className="text-sm font-medium text-foreground">EazyServ</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Home services on demand, from KYC-verified pros. Cleaning, plumbing, electrical, salon and
          more.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Version {APP_VERSION}</p>
      </div>

      <div className="mt-6 flex flex-col gap-1">
        {LEGAL.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-secondary"
          >
            <Icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
