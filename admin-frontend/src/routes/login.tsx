import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary" aria-hidden />
          <h1 className="text-xl font-semibold">Eazyserv Admin</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Operator sign-in lands here. SVC-422 wires up the actual auth flow — this is a
          placeholder for the scaffold.
        </p>
        <Button asChild className="w-full">
          <Link to="/operator">Continue</Link>
        </Button>
      </div>
    </div>
  );
}
