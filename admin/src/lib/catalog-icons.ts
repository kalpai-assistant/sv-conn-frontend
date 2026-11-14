/**
 * The icons an admin can pick for a category or service (SVC-430). The keys are
 * the backend's CATALOG_ICON_KEYS (app/seed_data/catalog_icons.py), in its order:
 * a kebab-case Lucide name each. The backend refuses any other key with a 422 on
 * icon_key. The consumer app draws the same keys from its own copy of this map
 * (src/lib/catalog-icons.ts). Tests in both apps pin the list.
 *
 * Adding a key means adding it in the backend first. Never remove one: rows
 * would keep pointing at it.
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

export interface CatalogIcon {
  key: string;
  label: string;
  Icon: LucideIcon;
}

export const CATALOG_ICONS: readonly CatalogIcon[] = [
  // In use by the consumer app's categories today.
  { key: "sparkles", label: "Sparkles", Icon: Sparkles },
  { key: "bug", label: "Bug", Icon: Bug },
  { key: "air-vent", label: "Air vent", Icon: AirVent },
  { key: "layout-grid", label: "Grid", Icon: LayoutGrid },
  { key: "zap", label: "Lightning", Icon: Zap },
  { key: "wrench", label: "Wrench", Icon: Wrench },
  { key: "hammer", label: "Hammer", Icon: Hammer },
  { key: "paintbrush", label: "Paintbrush", Icon: Paintbrush },
  { key: "scissors", label: "Scissors", Icon: Scissors },
  { key: "brush", label: "Brush", Icon: Brush },
  { key: "hand-heart", label: "Hand and heart", Icon: HandHeart },
  { key: "droplets", label: "Droplets", Icon: Droplets },
  { key: "sofa", label: "Sofa", Icon: Sofa },
  { key: "car", label: "Car", Icon: Car },
  { key: "bath", label: "Bath", Icon: Bath },
  { key: "camera", label: "Camera", Icon: Camera },
  // Home services.
  { key: "house", label: "House", Icon: House },
  { key: "shower-head", label: "Shower head", Icon: ShowerHead },
  { key: "plug", label: "Plug", Icon: Plug },
  { key: "lightbulb", label: "Light bulb", Icon: Lightbulb },
  { key: "fan", label: "Fan", Icon: Fan },
  { key: "refrigerator", label: "Refrigerator", Icon: Refrigerator },
  { key: "washing-machine", label: "Washing machine", Icon: WashingMachine },
  { key: "microwave", label: "Microwave", Icon: Microwave },
  { key: "paint-roller", label: "Paint roller", Icon: PaintRoller },
  { key: "drill", label: "Drill", Icon: Drill },
  { key: "cctv", label: "CCTV", Icon: Cctv },
  { key: "sprout", label: "Sprout", Icon: Sprout },
  { key: "truck", label: "Truck", Icon: Truck },
  { key: "shirt", label: "Shirt", Icon: Shirt },
];

const BY_KEY = new Map(CATALOG_ICONS.map((icon) => [icon.key, icon]));

/** The icon for a stored key. Null for no key, or one this build doesn't know. */
export function catalogIcon(key: string | null | undefined): CatalogIcon | null {
  return key ? (BY_KEY.get(key) ?? null) : null;
}
