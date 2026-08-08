# Brand source assets

Original artwork, kept out of `src/` because it is not code and out of
`public/` because it is not served. Nothing imports these files — they exist
so the derived assets in `public/` can be regenerated instead of re-cropped
by hand and never matching again.

| Source | What it is |
| --- | --- |
| `og-source.jpeg` | 1600×666 brand banner — logo, wordmark, tagline, service icons, trust bar, photo collage |
| `logo.jpeg` | 510×355 logo lockup — gear mark above the EazyServ wordmark, on navy |

## Derived assets in `public/`

| Output | From | Used by |
| --- | --- | --- |
| `og-banner.jpg` (1200×630) | `og-source.jpeg` | `og:image` / `twitter:image` in `index.marketing.html` |
| `brand-banner.jpg` (1600×666) | `og-source.jpeg` | `BrandBand`, ≥768px |
| `brand-banner-sm.jpg` (960×666) | `og-source.jpeg` | `BrandBand`, <768px |
| `logo-mark.png` (128×128) | `logo.jpeg` | `BrandMark` in the header and footer |

## Regenerating

`sharp` is already present as a transitive dependency — these are one-off
scripts, not part of any build. Run from the repo root.

```bash
node -e "
const sharp = require('sharp');
const banner = 'brand/og-source.jpeg';
const jpg = { quality: 82, mozjpeg: true };

Promise.all([
  // og:image — 1200x630 (1.905:1).
  //
  // A FULL-HEIGHT crop of this source is always 666 * 1.905 = 1269px wide,
  // which cuts through the photographed technician on the right and leaves
  // half a person at the edge. Trimming 47px of height instead lets the crop
  // stop at 1180px, ending cleanly on the photo panels. The 32px top offset
  // takes that trim from the empty navy above the logo rather than from the
  // trust-badge bar along the bottom.
  sharp(banner)
    .extract({ left: 0, top: 32, width: 1180, height: 619 })
    .resize(1200, 630).jpeg(jpg).toFile('public/og-banner.jpg'),

  // Brand band, desktop — the whole composition, just optimised.
  sharp(banner).resize(1600).jpeg({ quality: 80, mozjpeg: true })
    .toFile('public/brand-banner.jpg'),

  // Brand band, mobile — left region only. At 2.4:1 the baked-in text is
  // unreadable on a phone, so the photo collage is dropped rather than
  // shrunk. Keeps wordmark, tagline, service icons and trust bar.
  sharp(banner).extract({ left: 0, top: 0, width: 960, height: 666 })
    .jpeg({ quality: 80, mozjpeg: true }).toFile('public/brand-banner-sm.jpg'),

  // Header/footer mark — the gear sits at x 241-278, y 110-147 in
  // logo.jpeg. A 62px box centred on it gives even padding and stops above
  // the wordmark. PNG, not JPEG: at this size JPEG ringing shows against
  // the flat navy.
  sharp('brand/logo.jpeg')
    .extract({ left: 228, top: 97, width: 62, height: 62 })
    .resize(128, 128, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toFile('public/logo-mark.png'),
]).then(() => console.log('regenerated'));
"
```

## Notes for whoever replaces these

- **Ask the designer for an SVG, or a PNG with alpha, of the mark on its own.**
  `logo.jpeg` has no alpha channel, so the navy backdrop is baked in — which
  is the only reason `BrandMark` renders as a tile. With a transparent mark
  it can sit on any background, scale to any size, and the tile becomes a
  choice rather than a workaround.
- The same asset would fix `public/icons/icon-192.png`, `icon-512.png` and
  `apple-touch-icon.png`, which are all still the pre-rebrand artwork.
- Keep `og-banner.jpg` at 1200×630 and under ~200 KB. Every link-preview
  scrape fetches it.
- If the banner is re-cut, re-check the crops above rather than assuming the
  offsets still land — they are measured against this exact source.
