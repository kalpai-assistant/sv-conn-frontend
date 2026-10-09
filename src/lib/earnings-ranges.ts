/** Labels for the earnings windows (SVC-260, SVC-323). */
import type { EarningsRange } from "@/hooks/useApi";
import type { ByProRange } from "@/hooks/useProEarnings";

interface RangeMeta {
  tab: string;
  heading: string;
  empty: string;
}

// Server windows are IST calendar boundaries, not rolling periods — "This week"
// means since Monday. The labels have to say so, or a provider reads a Monday
// morning ₹0 as a bug rather than as a week that has only just started.
export const RANGE_META: Record<ByProRange, RangeMeta> = {
  today: { tab: "Today", heading: "TODAY", empty: "Nothing yet today" },
  week: { tab: "This week", heading: "THIS WEEK", empty: "Nothing yet this week" },
  month: { tab: "This month", heading: "THIS MONTH", empty: "Nothing yet this month" },
  all: { tab: "All time", heading: "ALL TIME", empty: "Nothing yet" },
};

export const WINDOW_RANGES: EarningsRange[] = ["today", "week", "month"];
