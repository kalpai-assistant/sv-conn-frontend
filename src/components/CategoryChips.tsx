import {
  Sparkles,
  Wrench,
  Zap,
  Scissors,
  Paintbrush,
  Hammer,
  Bug,
  Settings,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCategories } from "@/hooks/useApi";

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

export function CategoryChips({ onSelect }: { onSelect?: (id: string) => void }) {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 py-2">
            <div className="h-14 w-14 rounded-2xl bg-border animate-pulse" />
            <div className="h-3 w-10 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
      {(categories || []).map((cat) => {
        const Icon = iconMap[cat.icon] || Sparkles;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect?.(cat.id)}
            className="flex shrink-0 flex-col items-center gap-1.5 py-2"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: (cat.color || "#1957D2") + "18" }}
            >
              <Icon className="h-6 w-6" style={{ color: cat.color || "#1957D2" }} />
            </div>
            <span className="text-[11px] font-medium text-foreground">{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
