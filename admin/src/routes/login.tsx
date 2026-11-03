import { createFileRoute } from "@tanstack/react-router";

/** Public, outside the shell. The real form (email + password + MFA) is SVC-407 A2. */
export const Route = createFileRoute("/login")({
  component: () => (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-2 rounded-xl border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold text-primary">EazyServ Admin</h1>
        <p className="text-sm text-muted-foreground">Sign-in is coming soon.</p>
      </div>
    </div>
  ),
});
