import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CategoryChips } from "@/components/CategoryChips";
import { ServiceCard } from "@/components/ServiceCard";
import { useServices } from "@/hooks/useApi";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EazyServ — Home Services at Your Doorstep" },
      {
        name: "description",
        content:
          "Book trusted home services — cleaning, plumbing, electrical, salon & more in Pune.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const { data: services, isLoading } = useServices(categoryId);

  return (
    <div className="min-h-screen pb-20">
      <TopBar />

      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Search for services...</span>
        </div>
      </div>

      {/* Categories */}
      <div className="pb-2">
        <h2 className="px-4 pb-3 text-base font-semibold text-foreground">Categories</h2>
        <CategoryChips onSelect={(id) => setCategoryId(id === categoryId ? undefined : id)} />
      </div>

      {/* Popular Services */}
      <div className="px-4 pt-2">
        <h2 className="pb-3 text-base font-semibold text-foreground">Popular Services</h2>
        <div className="flex flex-col gap-3">
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 w-full bg-border rounded-xl"></div>
              ))}
            </div>
          ) : services && services.length > 0 ? (
            services.map((s) => <ServiceCard key={s.id} service={s} />)
          ) : (
            <p className="text-sm text-muted-foreground">No services found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
