/**
 * SVC-293: the banner slot at the top of the service sheet.
 *
 * Five-state fallback chain, top wins:
 *
 *   1. `service.bannerVideoUrl`  →  autoplaying muted looped `<video>`
 *   2. `service.bannerImageUrl`  →  `<img>`
 *   3. Parent sub-category tile  →  `subcategoryImage(l2.slug)` (SVC-286 v2)
 *   4. L1 category tile          →  `categoryImage(l1.slug)`   (SVC-286 v2)
 *   5. Colour block              →  `categoryColor(l1.sortOrder)`
 *
 * The chain is designed so partial coverage renders intentionally: a
 * service without curated media still shows something branded (its parent
 * tile), and a category without a tile falls to its palette colour rather
 * than a broken image slot. Only state 5 is guaranteed to render — every
 * other branch depends on either curated content or SVC-286 v2 assets.
 *
 * Runtime video / image errors fall through the chain via local error
 * state: a 404 on an uploaded MP4 doesn't leave the user staring at a
 * broken player, it drops one rung to the image or sub-cat tile.
 *
 * Full-width 40:17 aspect ratio (~2.35:1). The ticket called for 2:1
 * originally, but Grok's realistic-style video output carries a
 * bottom-right watermark that a straight 2:1 crop didn't fully clear.
 * Shrinking the container from the bottom (2:1 → 2:0.85 ≡ 40:17) plus
 * anchoring the video to the container's top edge (`object-top`) pushes
 * all cropping onto the bottom of the source — ~23% of video height is
 * shaved off the bottom, which reliably clips the watermark without
 * touching any of the useful subject matter above.
 *
 * The sheet is `max-w-md` (448px), so a banner is ~448×190 at max.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Category, Service } from "@/lib/mock-data";
import { categoryColor } from "@/lib/category-icons";
import { categoryImage } from "@/lib/category-images";
import { subcategoryImage } from "@/lib/subcategory-images";
import { serviceHeroLayoutId } from "@/lib/shared-hero";

interface ServiceBannerProps {
  service: Service;
  categories: Category[] | undefined;
}

export function ServiceBanner({ service, categories }: ServiceBannerProps) {
  // Reset runtime error state when the source changes — the sheet is now a
  // single component that swaps content (SVC-292), so a video that failed
  // for service A must not stay "failed" when the sheet lands on service B.
  const [videoError, setVideoError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [subCatImageError, setSubCatImageError] = useState(false);
  const [l1ImageError, setL1ImageError] = useState(false);

  useEffect(() => {
    setVideoError(false);
    setImageError(false);
    setSubCatImageError(false);
    setL1ImageError(false);
  }, [service.id]);

  // Resolve the L2 (sub-category the service points at) and L1 (its parent).
  // A service whose category is itself L1 (Miscellaneous case) has no L2 —
  // the sub-cat branch of the chain is skipped and we go straight to the L1
  // tile.
  const l2 = categories?.find((c) => c.id === service.categoryId) ?? null;
  const l1 = l2 && l2.parentId ? (categories?.find((c) => c.id === l2.parentId) ?? null) : l2;

  const subCatImg = l2 && l2.parentId ? subcategoryImage(l2.slug) : undefined;
  const l1Img = l1 ? categoryImage(l1.slug) : undefined;
  const tint = categoryColor(l1?.sortOrder ?? 0);

  const showVideo = !!service.bannerVideoUrl && !videoError;
  const showImage = !showVideo && !!service.bannerImageUrl && !imageError;
  const showSubCat = !showVideo && !showImage && !!subCatImg && !subCatImageError;
  const showL1 = !showVideo && !showImage && !showSubCat && !!l1Img && !l1ImageError;
  // Colour block is the terminal branch — always renders when everything
  // above falls through, and never itself errors.
  const showColour = !showVideo && !showImage && !showSubCat && !showL1;

  // SVC-399: this banner is the destination of the service-card hero
  // transition. The source lives on ServiceCard / ServiceCardCompact; both
  // sides share `service-hero-${id}`. `useReducedMotion` ↦ no `layoutId`,
  // so the sheet just slides up with its own motion and nothing morphs.
  const reduceMotion = useReducedMotion();
  const layoutId = reduceMotion ? undefined : serviceHeroLayoutId(service.id);

  return (
    <motion.div
      layoutId={layoutId}
      className="relative w-full overflow-hidden bg-muted"
      style={{ aspectRatio: "40 / 17" }}
    >
      {showVideo && (
        <video
          key={service.bannerVideoUrl}
          src={service.bannerVideoUrl ?? undefined}
          // The four attributes iOS + Android WebView need in concert for a
          // background-safe autoplay: `muted` unblocks autoplay policy;
          // `playsInline` prevents iOS from full-screening on tap; `loop`
          // keeps the 6-10s clip looping; `autoPlay` starts it. Missing any
          // one downgrades to the video-with-play-button state, which is not
          // what the design calls for.
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onError={() => setVideoError(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      )}

      {showImage && (
        <img
          key={service.bannerImageUrl}
          src={service.bannerImageUrl ?? undefined}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setImageError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {showSubCat && subCatImg && (
        <img
          key={subCatImg}
          src={subCatImg}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setSubCatImageError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {showL1 && l1Img && (
        <img
          key={l1Img}
          src={l1Img}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setL1ImageError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {showColour && (
        // Terminal state. Solid tint with the category's palette colour so
        // even a fully-uncurated service reads as belonging to its section
        // rather than a broken box.
        <div className="absolute inset-0" style={{ backgroundColor: tint }} />
      )}
    </motion.div>
  );
}
