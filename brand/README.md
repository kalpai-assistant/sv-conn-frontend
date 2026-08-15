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
| `brand-banner-sm.jpg` (900×580) | `og-source.jpeg` | `BrandBand`, <768px |
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
  //
  // No pure crop works here: the trust pill runs to x=917 while the photo
  // collage already intrudes from x≈855 at the top, so the two overlap.
  // Cropping narrow enough to miss the photo (x=840) clips "& MANY MORE"
  // and "EASY BOOKING". So the crop keeps the full content at x=900 and the
  // leftover photo wedge — which reaches down to about y=140 — is painted
  // over with navy copied from lower in the same columns, where the
  // background gradient is closest and the seam does not show.
  //
  // Vertical bounds come from the artwork's own content, which measures
  // y 50-593 (gear mark top to trust-bar bottom). Cropping 30..610 leaves
  // ~20px above and ~17px below, instead of the 0/73 split a full-height
  // crop gives — that lopsided gap is what made the mobile band look loose
  // next to the desktop one.
  //
  // The patch must start at x>=850: the wordmark's right edge is near x=775,
  // so anything further left would erase part of the "v".
  //
  // Width stays 900 even though the trust pill runs to x~922, which trims
  // ~22px off the pill's rounded end. That is deliberate and cannot be
  // avoided: the pill and the photo panel overlap in the artwork, so any
  // crop wide enough to finish the pill also drags a strip of photograph in
  // with it (tried at 852 and 942 — both show the technician). The artwork
  // has no portrait variant; a purpose-made mobile version from the
  // designer is the only way to have both.
  (async () => {
    const base = await sharp(banner)
      .extract({ left: 0, top: 30, width: 900, height: 580 }).toBuffer();
    const patch = await sharp(banner)
      .extract({ left: 850, top: 220, width: 50, height: 120 }).toBuffer();
    return sharp(base).composite([{ input: patch, left: 850, top: 0 }])
      .jpeg({ quality: 80, mozjpeg: true }).toFile('public/brand-banner-sm.jpg');
  })(),

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

## Service card photos

Two generations of source artwork live here, and they are used differently.

**`brand/services-v2/*.png` — the current source.** Clean photographs, no
overlay. Used for 14 of the 16 service cards. These need no clever cropping:
a straight `fit: cover` to 4:3 is enough, because the subject is centred and
there is no badge or diagonal to dodge.

Note `pest.png` contains a branded "PEST CONTROL" sign as a prop in the
scene. The centre crop happens to frame it in full, which reads well —
cropping to exclude it clips it worse. Leave it centred.

**`brand/services/*.jpg` — the original banners.** Navy panel, headline,
diagonal and a hexagonal badge, with photography only on the right. Still the
source for **`ev-repair`** and **`car-wash`**, which have no v2 photograph.
Their crops anchor to the upper-right, the only clean region across those
banners; two of them needed narrower windows further left. Keep the override
table below if those are ever regenerated.

**Two v2 images are unused:** a manicure shot and a men's spa/massage shot.
The first is an alternative for Women's Salon & Spa; the second is a service
the site does not currently list.

Plumbing, Electrical and Pest Control now have photographs too
(`plumbing.png`, `elect.png`, `pest.png`), supplied separately and named
properly rather than as `1 (n).png`.

### Regenerating the 14 v2 cards

```bash
node -e "
const sharp = require('sharp');
const MAP = [
  ['home-deep-cleaning', '1 (1).png', false],
  ['ac-service', '1 (9).png', false],
  ['appliance-repair', '1 (12).png', false],
  ['carpentry', '1 (11).png', false],
  ['painting', '1 (8).png', false],
  ['waterproofing', '1 (13).png', false],
  ['women-salon-spa', '1 (10).png', false],
  ['mens-grooming', '1 (5).png', false],
  ['ro-water-purifier', '1 (7).png', false],
  // Stacked pairs: two panels one above the other. A 4:3 card can only show
  // one, so take the top half before cropping.
  ['furniture-sofa-cleaning', '1 (6).png', true],
  ['cctv-festival-lights', '1 (3).png', true],
  // Supplied later, already named.
  ['plumbing', 'plumbing.png', false],
  ['electrical', 'elect.png', false],
  ['pest-control', 'pest.png', false],
];
(async () => {
  for (const [slug, file, stacked] of MAP) {
    let img = sharp('brand/services-v2/' + file);
    if (stacked) {
      const m = await img.metadata();
      img = sharp('brand/services-v2/' + file)
        .extract({ left: 0, top: 0, width: m.width, height: Math.floor(m.height / 2) });
    }
    await img.resize(800, 600, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
      .jpeg({ quality: 78, mozjpeg: true }).toFile('public/services/' + slug + '.jpg');
  }
  console.log('regenerated');
})();
"
```

The filenames `1 (1).png` are exactly as the client supplied them; the mapping
above was established by generating a contact sheet and identifying each
image by eye. If the client sends a new batch, do the same rather than
assuming the numbering is stable.

### Regenerating ev-repair and car-wash from the old banners

```bash
node -e "
const sharp = require('sharp');
const OVERRIDE = { 'cctv-festival-lights': [0.52, 0.26], 'furniture-sofa-cleaning': [0.50, 0.27] };
(async () => {
  for (const slug of ['ev-repair', 'car-wash']) {
    const f = 'brand/services/' + slug + '.jpg';
    const m = await sharp(f).metadata();
    const [leftF, wF] = OVERRIDE[slug] || [null, 0.40];
    let cw = Math.round(m.width * wF), ch = Math.round(cw * 0.75);
    if (ch > m.height) { ch = m.height; cw = Math.round(ch * 4 / 3); }
    const left = leftF !== null ? Math.round(m.width * leftF) : m.width - cw;
    await sharp(f).extract({ left, top: 0, width: cw, height: ch })
      .resize(800, 600, { kernel: 'lanczos3' })
      .jpeg({ quality: 78, mozjpeg: true }).toFile('public/services/' + slug + '.jpg');
  }
  console.log('regenerated');
})();
"
```

Only the **photography** is ever used. The banners' baked-in headlines are
discarded and the service name is real HTML text under each card, because
text inside an image cannot be read by Google, does not reflow on a phone,
and cannot be selected or translated.

## Favicon

`public/favicon-eazyserv.png` (512×512) is the brand mark cropped from
`brand/eazyserv-logo-source.svg`, on the logo's own navy.

Referenced only from `index.marketing.html`. It deliberately does **not**
replace `public/icons/icon-192.png`, `icon-512.png` or
`apple-touch-icon.png`, which are still the pre-rebrand purple "SC"
ServiceConnect artwork — those are shared with the app build and named in the
PWA manifest, so replacing them is an app-side change needing its own ticket.

`public/eazyserv-mark.svg` is **not** usable as the mark: it renders as a
solid blue rosette with the navy star cutout missing.

```bash
node -e "
const sharp = require('sharp');
(async () => {
  // Mark measured at x 506-686, y 220-403 in a 1200-wide render; doubled
  // here. The 460px box leaves ~13% padding, so the points do not touch
  // the edge at favicon sizes.
  const base = await sharp('brand/eazyserv-logo-source.svg', { density: 400 })
    .resize(2400).flatten({ background: '#011346' }).png().toBuffer();
  await sharp(base).extract({ left: 962, top: 393, width: 460, height: 460 })
    .resize(512, 512, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toFile('public/favicon-eazyserv.png');
  console.log('regenerated');
})();
"
```
