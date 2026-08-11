/**
 * Animated splash — the mark spins in and settles at centre while the
 * wordmark fades in below.
 *
 * Palette is the source design's brand scheme (`#011346` navy bg,
 * bright-blue mark, white wordmark). Reads as one continuous brand
 * moment rather than "white utility surface with a coloured mark on
 * it." Colours are named constants so a palette tweak lives in one
 * place; the source of truth is `brand/eazyserv-logo-source.svg`.
 *
 * Timing (~2s total; matches SplashGate's SPLASH_HOLD_MS):
 *   0.00–1.10s  mark: scale 3.5 → 1, rotate 720° → 0°, opacity 0 → 1
 *   0.65–1.15s  wordmark: opacity 0 → 1, slide y+8 → 0
 *               (starts before the mark settles — overlap reads as one
 *                continuous motion, not two sequential phases)
 *   1.15–1.60s  tagline: opacity 0 → 1
 *   1.60–2.00s  hold
 *   (SplashGate's AnimatePresence handles the exit fade)
 *
 * Rotation is 720° (two full turns), NOT the more intuitive 180°.
 * The mark is an eight-arm snowflake with rotational symmetry — a
 * 180° flip looks *identical* to the final state, so the eye
 * registers no spin at all. 720° forces two full visible
 * revolutions before landing upright. Same story for 90° / 45°:
 * whatever multiple of the mark's symmetry angle you rotate by
 * disappears visually.
 *
 * Spring physics on the whole tween so the settle feels physical
 * rather than metronome-tween. Damping tuned so there's a small
 * overshoot at the end, giving the "landed" moment a satisfying
 * hitch.
 */
import { motion } from "framer-motion";

// Colours pulled from the source SVG so a designer change to the brand
// palette only needs to update `brand/eazyserv-logo-source.svg` and
// these constants — nothing in the animation code changes.
const SPLASH_BG = "#011346"; // source's navy — the brand's dark surface
const WORDMARK_COLOR = "#FBFBFB"; // matches the source's off-white wordmark

export function SplashAnimation() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: SPLASH_BG }}
    >
      {/* The mark. Rendered via <img> pointing at the extracted SVG
          in public/ so the browser rasterises per-DPI — no raster
          fallbacks to ship. */}
      <motion.img
        src="/eazyserv-mark.svg"
        alt=""
        aria-hidden
        // Start: 3.5x oversize, rotated 720°, invisible. End:
        // natural size, upright, fully opaque. See docstring for
        // the 720° reasoning.
        initial={{ scale: 3.5, rotate: 720, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{
          type: "spring",
          damping: 14,
          stiffness: 80,
          mass: 0.95,
        }}
        style={{
          width: 140,
          height: 140,
          // Bright glow — on the navy bg the mark can otherwise
          // feel pasted-on. This gives it enough atmosphere to
          // read as an emitting source rather than a flat sticker.
          filter: "drop-shadow(0 8px 40px rgba(2, 158, 247, 0.55))",
        }}
      />

      {/* Wordmark. Delay 0.65s — starts BEFORE the mark's spring
          settles, so the eye reads the whole animation as one
          continuous motion. If wordmark waited until after mark
          landed (delay ~1.1s) the sequence feels like two
          disconnected phases. */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.5, ease: "easeOut" }}
        // Inter is already loaded (see index.mobile.html); tracking
        // and weight tuned to visually approximate the source
        // wordmark without shipping a custom font.
        style={{
          marginTop: 28,
          color: WORDMARK_COLOR,
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        EazyServ
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.75 }}
        transition={{ delay: 1.15, duration: 0.45, ease: "easeOut" }}
        style={{ marginTop: 10, color: WORDMARK_COLOR, fontSize: 14 }}
      >
        Home services at your doorstep
      </motion.p>
    </div>
  );
}
