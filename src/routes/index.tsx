import { createFileRoute } from "@tanstack/react-router";
import { LocationBar } from "@/components/home/LocationBar";
import { InProgressBookingBanner } from "@/components/home/InProgressBookingBanner";
import { SearchBar } from "@/components/home/SearchBar";
import { HeroBanner } from "@/components/home/HeroBanner";
import { CategoryRail } from "@/components/home/CategoryRail";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { BookAgainRow } from "@/components/home/BookAgainRow";
import { PopularSection } from "@/components/home/PopularSection";
import { TrustStrip } from "@/components/TrustStrip";

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
  // Section order (SVC-286 v2): festival-first, then the category picker,
  // then evergreen promos + returning-user shortcuts.
  //
  // HeroBanner is the top slot for festival / campaign artwork. Renders
  // nothing when no active-window banner is configured, so this slot has
  // zero cost outside of festival weeks.
  //
  // No category state at this level: a tile is a link to that category's
  // own page. Home is a launchpad, not a filtered view of itself.
  return (
    <div className="min-h-screen pb-20">
      {/* One sticky block, not two: separate `sticky top-0` siblings would
          stack on each other. The banner renders nothing unless a booking is
          live, so Home doesn't shift for everyone else (SVC-389). */}
      <div className="sticky top-0 z-30">
        <LocationBar />
        <InProgressBookingBanner />
      </div>
      <SearchBar />

      <HeroBanner />

      {/* SVC-387: compact trust strip immediately above the service grid.
          Edge-to-edge band — the compact variant uses `border-y` only, so
          side rails would clash. Supersedes the old vertical TrustBar. */}
      <TrustStrip variant="compact" />

      <section className="pb-4">
        <h2 className="px-4 pb-3 text-base font-semibold text-foreground">Services</h2>
        <CategoryRail />
      </section>

      <PromoCarousel />
      <BookAgainRow />
      <PopularSection />
    </div>
  );
}
