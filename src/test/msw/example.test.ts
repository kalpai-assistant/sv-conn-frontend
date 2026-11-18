/**
 * MSW scaffold smoke (SVC-469).
 *
 * Proves the MSW node server intercepts a real `fetch` and the response
 * shape reaches the caller through `apiFetch`. Exists so a breaking
 * upgrade of MSW / undici / vitest fails here rather than in a
 * production-feel route test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./server";
import { apiFetch, clearTokens } from "@/lib/api";

beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  clearTokens();
  localStorage.clear();
});
afterAll(() => server.close());

describe("MSW scaffold (SVC-469)", () => {
  it("default handlers answer /users/me with the seed user", async () => {
    const me = (await apiFetch("/users/me")) as { id: string; role: string };
    expect(me.id).toBe("u-msw-1");
    expect(me.role).toBe("consumer");
  });

  it("per-test override via server.use wins over the default", async () => {
    server.use(
      http.get("**/api/v1/users/me", () =>
        HttpResponse.json({
          id: "u-override",
          role: "provider",
          name: "O",
          phone: "+911",
          email: null,
        }),
      ),
    );
    const me = (await apiFetch("/users/me")) as { id: string; role: string };
    expect(me.id).toBe("u-override");
    expect(me.role).toBe("provider");
  });

  it("surfaces backend errors through ApiError (shape contract for the error flow)", async () => {
    server.use(
      http.post("**/api/v1/auth/send-otp", () =>
        HttpResponse.json(
          { detail: "This phone is already registered as consumer", code: "ROLE_MISMATCH" },
          { status: 400 },
        ),
      ),
    );
    await expect(
      apiFetch("/auth/send-otp", { method: "POST", body: JSON.stringify({ phone: "+91999" }) }),
    ).rejects.toThrow("This phone is already registered as consumer");
  });
});
