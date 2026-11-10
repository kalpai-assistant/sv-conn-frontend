/**
 * The icon keys an admin can set on a category or service (SVC-430), each a
 * kebab-case Lucide name. The list is the backend's CATALOG_ICON_KEYS
 * (app/seed_data/catalog_icons.py), in its order; the admin console's picker draws
 * the same map (admin/src/lib/catalog-icons.ts). Tests in both apps pin it.
 *
 * Used by lib/category-icons.ts (a category's icon_key, after the curated slug map)
 * and by ServiceCardCompact (a service's icon_key, ahead of its category's icon).
 */
import type { LucideIcon } from "lucide-react";
import {
  AirVent,
  Bath,
  Brush,
  Bug,
  Camera,
  Car,
  Cctv,
  Drill,
  Droplets,
  Fan,
  Hammer,
  HandHeart,
  House,
  LayoutGrid,
  Lightbulb,
  Microwave,
  PaintRoller,
  Paintbrush,
  Plug,
  Refrigerator,
  Scissors,
  Shirt,
  ShowerHead,
  Sofa,
  Sparkles,
  Sprout,
  Truck,
  WashingMachine,
  Wrench,
  Zap,
} from "lucide-react";

export const CATALOG_ICONS: ReadonlyMap<string, LucideIcon> = new Map<string, LucideIcon>([
  ["sparkles", Sparkles],
  ["bug", Bug],
  ["air-vent", AirVent],
  ["layout-grid", LayoutGrid],
  ["zap", Zap],
  ["wrench", Wrench],
  ["hammer", Hammer],
  ["paintbrush", Paintbrush],
  ["scissors", Scissors],
  ["brush", Brush],
  ["hand-heart", HandHeart],
  ["droplets", Droplets],
  ["sofa", Sofa],
  ["car", Car],
  ["bath", Bath],
  ["camera", Camera],
  ["house", House],
  ["shower-head", ShowerHead],
  ["plug", Plug],
  ["lightbulb", Lightbulb],
  ["fan", Fan],
  ["refrigerator", Refrigerator],
  ["washing-machine", WashingMachine],
  ["microwave", Microwave],
  ["paint-roller", PaintRoller],
  ["drill", Drill],
  ["cctv", Cctv],
  ["sprout", Sprout],
  ["truck", Truck],
  ["shirt", Shirt],
]);

/** The icon for a stored key; undefined for none, or a key this build doesn't know. */
export function catalogIcon(key: string | null | undefined): LucideIcon | undefined {
  return key ? CATALOG_ICONS.get(key) : undefined;
}
