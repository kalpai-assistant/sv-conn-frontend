import { createFileRoute } from "@tanstack/react-router";
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
  // No category state here any more: a tile is a link to that category's own
  // page. Home is a launchpad, not a filtered view of itself.
  return (
    <div className="min-h-screen pb-20">
      <LocationBar />
      <SearchBar />

      <section className="pb-4">
        <h2 className="px-4 pb-3 text-base font-semibold text-foreground">Categories</h2>
        <CategoryGrid />
      </section>

      <PromoCarousel />
      <BookAgainRow />
      <PopularSection />
      <TrustBar />
    </div>
  );
}
