import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LocationBar } from "@/components/home/LocationBar";
import { SearchBar } from "@/components/home/SearchBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { BookAgainRow } from "@/components/home/BookAgainRow";
import { PopularSection } from "@/components/home/PopularSection";
import { TrustBar } from "@/components/home/TrustBar";

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
  // Category selection is Home-local state — no reason for it to survive a
  // navigation. A tap on the same tile deselects (undefined), which pushes
  // the PopularSection back to its full "Most booked" view.
  const [categoryId, setCategoryId] = useState<string | undefined>();

  return (
    <div className="min-h-screen pb-20">
      <LocationBar />
      <SearchBar />

      <section className="pb-4">
        <h2 className="px-4 pb-3 text-base font-semibold text-foreground">Categories</h2>
        <CategoryGrid
          selectedId={categoryId}
          onSelect={(id) => setCategoryId((current) => (current === id ? undefined : id))}
        />
      </section>

      <PromoCarousel />
      <BookAgainRow />
      <PopularSection categoryId={categoryId} />
      <TrustBar />
    </div>
  );
}
