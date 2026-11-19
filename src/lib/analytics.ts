/**
 * Marketplace analytics events (SVC-419): `track(name, properties)`.
 *
 * The event names, their properties and their bounds are documented in the
 * backend's ADMIN.md, section "Analytics events (SVC-419)", and enforced by
 * `app/schemas/analytics.py`. The types here are generated from that schema
 * (svc_connect.json → src/types/api.ts), so a property the backend doesn't
 * declare is a type error here and a 422 there.
 *
 * No SDK (Jira 14942): one event per `POST /analytics/events`, stored in the
 * backend's `marketplace_events` table.
 *
 * - Fire-and-forget. `track` returns nothing, never throws, never shows a
 *   toast. UI code calls it and moves on.
 * - Logged out (no access token): nothing is sent.
 * - Any failure that isn't a 4xx (a network error, a 5xx) is retried once
 *   with the SAME body, so the same `event_id`: the backend ignores a repeat.
 * - A 4xx (422, 429, a 401 the refresh couldn't fix) drops the event. A
 *   retry would get the same answer.
 * - No batching and no offline queue (the ticket's baked default).
 */
import { ApiError, apiFetch, getAccessToken } from "@/lib/api";
import type { Address } from "@/lib/mock-data";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

/** Each client event name → its properties, as the backend declares them. */
export interface MarketplaceEvents {
  "marketplace.sheet_opened": Schemas["SheetOpened"];
  "marketplace.sheet_abandoned": Schemas["SheetAbandoned"];
  "marketplace.sp_selected": Schemas["SpSelected"];
  "marketplace.price_change_at_checkout": Schemas["PriceChangeAtCheckout"];
  "marketplace.tile_coming_soon_tapped": Schemas["TileComingSoonTapped"];
}

export type MarketplaceEventName = keyof MarketplaceEvents;

/** The backend's `time_spent_ms` ceiling: one day. */
export const MAX_TIME_SPENT_MS = 86_400_000;

const EVENTS_PATH = "/analytics/events";

/** A v4 UUID. `crypto.randomUUID` needs a secure context; the fallback doesn't. */
export function newEventId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isClientError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

function devWarn(...args: unknown[]) {
  if (import.meta.env.DEV) console.warn("[analytics]", ...args);
}

async function send<N extends MarketplaceEventName>(
  name: N,
  properties: MarketplaceEvents[N],
): Promise<void> {
  const body = JSON.stringify({
    event_id: newEventId(),
    name,
    occurred_at: new Date().toISOString(),
    properties,
  });
  const post = () => apiFetch<void>(EVENTS_PATH, { method: "POST", body });
  try {
    await post();
  } catch (err) {
    if (isClientError(err)) {
      devWarn(`${name} dropped`, err);
      return;
    }
    try {
      await post();
    } catch (retryErr) {
      devWarn(`${name} dropped after one retry`, retryErr);
    }
  }
}

/** Send one marketplace event. Never awaited, never throws. */
export function track<N extends MarketplaceEventName>(
  name: N,
  properties: MarketplaceEvents[N],
): void {
  try {
    if (!getAccessToken()) return;
    void send(name, properties).catch(() => {});
  } catch {
    // Analytics must never break the screen that sent it.
  }
}

/**
 * The selected address's pincode when it is exactly six ASCII digits, else
 * null. Never lat/lng (Jira 14942). Callers ranking from the device's own
 * location pass no address, so get null.
 */
export function pincodeOrNull(address: Pick<Address, "pincode"> | null | undefined): string | null {
  const pin = address?.pincode?.trim();
  return pin && /^[0-9]{6}$/.test(pin) ? pin : null;
}
