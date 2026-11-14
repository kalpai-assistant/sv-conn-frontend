import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

export type ApiGetState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: unknown };

const LOADING = { status: "loading" } as const;

/**
 * GETs a path, and again whenever the path changes. Starting a new call cancels
 * the previous one, so the last call wins and a slow answer to an old filter
 * can't replace a newer one. An answer only ever counts for the path it was asked
 * for, so a new path reads as loading from its first render.
 *
 * `retry` goes back to loading. `refresh` keeps what's on screen until the answer
 * arrives, for a reload the reader shouldn't lose their place over. If it fails,
 * the state becomes an error rather than leaving old data looking current.
 *
 * A null path asks for nothing and stays loading: for a call only some views need.
 */
export function useApiGet<T>(path: string | null): ApiGetState<T> & {
  retry: () => void;
  refresh: () => void;
} {
  const [settled, setSettled] = useState<{ path: string; state: ApiGetState<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) {
      setSettled(null);
      return;
    }
    const controller = new AbortController();
    setSettled((current) => (current?.path === path ? current : null));
    apiFetch<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) {
          setSettled({ path, state: { status: "ready", data } });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({ path, state: { status: "error", error } });
        }
      },
    );
    return () => controller.abort();
  }, [path, attempt]);

  const retry = useCallback(() => {
    setSettled(null);
    setAttempt((n) => n + 1);
  }, []);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  const state: ApiGetState<T> = path !== null && settled?.path === path ? settled.state : LOADING;
  return { ...state, retry, refresh };
}
