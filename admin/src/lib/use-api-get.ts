import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

export type ApiGetState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: unknown };

/**
 * GETs a path, and again whenever the path changes. Changing a path cancels the
 * previous call, so a slow answer to an old filter can't replace a newer one.
 */
export function useApiGet<T>(path: string): ApiGetState<T> & { retry: () => void } {
  const [state, setState] = useState<ApiGetState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    apiFetch<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error });
      },
    );
    return () => controller.abort();
  }, [path, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
