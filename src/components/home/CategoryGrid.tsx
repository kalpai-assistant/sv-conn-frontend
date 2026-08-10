/**
 * Category picker on Home — a 3-column grid of icon tiles.
 *
 * Replaces the older horizontal-scroll CategoryChips row: chips force users
 * to swipe to discover the middle of the catalogue, hide the total set
 * behind an implicit "there might be more →" affordance, and (measured on
 * marketplace apps generally) convert notably worse than a grid where
 * everything is visible at once. Categories don't grow past a dozen or so
 * in home services, so a full grid stays scannable without a second page.
 *
 * Tapping a tile navigates to the (yet-to-be-built in a later PR) category
 * page — for now we filter the existing Home service list by category id
 * via the parent's onSelect.
 */
import type { LucideIcon } from "lucide-react";
import { Sparkles, Wrench, Zap, Scissors, Paintbrush, Hammer, Bug, Settings } from "lucide-react";
import { useCategories } from "@/hooks/useApi";

// Lucide names the API can return today. Falls back to Sparkles if the
// backend ships a name we don't know about — better than a blank tile.
const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Wrench,
  Zap,
  Scissors,
  Paintbrush,
  Hammer,
  Bug,
  Settings,
};

interface CategoryGridProps {
  onSelect?: (id: string) => void;
  selectedId?: string;
}

export function CategoryGrid({ onSelect, selectedId }: CategoryGridProps) {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 px-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-2xl bg-border" />
        ))}
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-3 gap-3 px-4">
      {categories.map((cat) => {
        const Icon = iconMap[cat.icon] || Sparkles;
        const isSelected = selectedId === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect?.(cat.id)}
            className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border p-3 transition-colors ${
              isSelected ? "border-primary bg-accent" : "border-border bg-card"
            }`}
            aria-pressed={isSelected}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              // Inline styling so per-category colours (which come from the
              // API and can be any hex) don't need to live as Tailwind
              // classes. `+ "18"` is a 9% alpha overlay for the background.
              style={{ backgroundColor: (cat.color || "#1957D2") + "18" }}
            >
              <Icon className="h-5 w-5" style={{ color: cat.color || "#1957D2" }} />
            </div>
            <span className="text-center text-[11px] font-medium leading-tight text-foreground">
              {cat.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
