/** Stand-in body for a sidebar screen whose story hasn't landed yet. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <p className="text-sm text-muted-foreground">Placeholder — not built yet.</p>
    </div>
  );
}
