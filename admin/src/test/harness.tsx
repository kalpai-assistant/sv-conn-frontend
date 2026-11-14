/** Shared by the auth tests: a scripted backend, and the real app at a given URL. */
import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { vi } from "vitest";
import { API_BASE_URL } from "@/lib/api";
import type { AdminRole, AdminUser } from "@/lib/auth";
import { getRouter } from "@/router";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** The backend's AppException shape. */
export function appError(status: number, code: string, message = code): Response {
  return json({ error: true, message, status_code: status, code }, status);
}

export function adminUser(role: AdminRole = "admin"): AdminUser {
  return { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null };
}

type Handler = () => Response | Promise<Response>;

/**
 * Stubs fetch. Routes are keyed "METHOD /path" with the API base stripped. An
 * unlisted route fails the test, so nothing reaches for an endpoint unnoticed.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${String(url).replace(API_BASE_URL, "")}`;
      calls.push({ key, init });
      const handler = routes[key];
      if (!handler) {
        throw new Error(`Unmocked API call: ${key}`);
      }
      return handler();
    }),
  );
  return {
    routes,
    calls,
    count: (key: string) => calls.filter((call) => call.key === key).length,
    headers: (key: string) =>
      calls.find((call) => call.key === key)?.init.headers as Record<string, string>,
  };
}

/** The app as main.tsx mounts it, StrictMode included. */
export function renderApp(path: string) {
  const router = getRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  return router;
}
