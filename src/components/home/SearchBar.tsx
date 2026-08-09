/**
 * Home's search entry point.
 *
 * Deliberately a button rather than an <input>: focusing an input in-place
 * on Home would either pin the keyboard over the categories the user is
 * trying to browse, or steal focus every time Home re-renders. The button
 * opens SearchSheet, which is a full-height sheet with a real input that
 * autofocuses — same three-tap distance to results, but no fight with the
 * page below.
 *
 * The old home had a fake <span> with the same visual affordance and no
 * behaviour at all (frontend/src/routes/index.tsx before this PR); this
 * component replaces it with something that actually opens a search
 * surface.
 */
import { useState } from "react";
import { Search } from "lucide-react";
import { SearchSheet } from "./SearchSheet";

export function SearchBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="px-4 pt-4 pb-3">
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
          aria-label="Open search"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Search for services...</span>
        </button>
      </div>

      {open && <SearchSheet onClose={() => setOpen(false)} />}
    </>
  );
}
