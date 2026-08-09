/**
 * Full-height search sheet.
 *
 * Client-side filter over the already-cached /services list — the backend
 * doesn't expose a `q=` parameter yet and adding one is a separate ticket.
 * Given the catalogue size (dozens, not thousands), a substring match
 * against name + description is indistinguishable from server search in
 * practice, and it means Home stays a fully offline-tolerant surface: the
 * services list is already prefetched, so search works even on flaky
 * connectivity.
 *
 * Recent queries are persisted in localStorage; a short list is shown when
 * the input is empty. Popular queries are hardcoded for beta — once we
 * have booking data we can replace with a real popularity endpoint.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Search, X, Clock, TrendingUp, Loader2 } from "lucide-react";
import { useServices } from "@/hooks/useApi";

const RECENT_KEY = "sc_recent_searches";
const RECENT_MAX = 5;
const POPULAR_TERMS = ["deep clean", "haircut", "electrician", "tap repair", "AC service"];

function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  if (typeof window === "undefined") return;
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) return;
  try {
    const existing = getRecent().filter((t) => t !== trimmed);
    const next = [trimmed, ...existing].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Silently no-op — search still works, just doesn't remember.
  }
}

interface SearchSheetProps {
  onClose: () => void;
}

export function SearchSheet({ onClose }: SearchSheetProps) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => getRecent());
  const { data: services, isLoading } = useServices();
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus after the enter animation finishes — focusing during the
  // motion transition on mobile can throw the keyboard up mid-slide and
  // land it on top of a still-animating sheet.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmed || !services) return [];
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(trimmed) ||
        s.description.toLowerCase().includes(trimmed) ||
        s.categoryName.toLowerCase().includes(trimmed),
    );
  }, [trimmed, services]);

  const handleSuggestionTap = (term: string) => {
    setQuery(term);
    pushRecent(term);
    setRecent(getRecent());
  };

  const handleResultTap = () => {
    // Persist the query only when the user actually engages with a result —
    // typing something and abandoning it shouldn't pollute their recents.
    pushRecent(query);
    setRecent(getRecent());
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-background"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Close search"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for services..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            enterKeyHint="search"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trimmed ? (
          <ResultsList
            results={results}
            isLoading={isLoading}
            query={query}
            onResultTap={handleResultTap}
            onClose={onClose}
          />
        ) : (
          <SuggestionsList
            recent={recent}
            onSuggestionTap={handleSuggestionTap}
            onClear={() => {
              try {
                localStorage.removeItem(RECENT_KEY);
              } catch {
                // ignore
              }
              setRecent([]);
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

function SuggestionsList({
  recent,
  onSuggestionTap,
  onClear,
}: {
  recent: string[];
  onSuggestionTap: (term: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="p-4">
      {recent.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent
            </h3>
            <button onClick={onClear} className="text-xs text-primary">
              Clear
            </button>
          </div>
          <ul className="flex flex-col">
            {recent.map((term) => (
              <li key={term}>
                <button
                  onClick={() => onSuggestionTap(term)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground capitalize">{term}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Popular
        </h3>
        <ul className="flex flex-col">
          {POPULAR_TERMS.map((term) => (
            <li key={term}>
              <button
                onClick={() => onSuggestionTap(term)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground capitalize">{term}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ResultsList({
  results,
  isLoading,
  query,
  onResultTap,
  onClose,
}: {
  results: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    duration: string;
  }>;
  isLoading: boolean;
  query: string;
  onResultTap: () => void;
  onClose: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No services match &ldquo;{query}&rdquo;.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border px-4">
      {results.map((s) => (
        <li key={s.id}>
          <Link
            to="/service/$serviceId"
            params={{ serviceId: s.id }}
            onClick={() => {
              onResultTap();
              onClose();
            }}
            className="flex items-start gap-3 py-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Search className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">{s.description}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-primary">₹{s.price}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
