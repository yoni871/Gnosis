# Landing page hero images

## What this is

The hero image for the public landing page (`/`): an ancient Near
Eastern desert at sunrise with a laptop and a phone resting in the
sand, both showing the Gnosis study interface. No heading, paragraph,
button, navigation, or logo is baked into the image; all of that is
real HTML on the page.

## Provenance (no external images, no licenses to clear)

- **Desert scene:** an original AI-generated image made for this
  project. It is project-owned, not sourced from any stock library or
  third-party site, so there is no external license to track. It
  contains no people, modern infrastructure, crosses, or fantasy
  scenery.
- **Laptop screen:** a genuine capture of the production Gnosis study
  interface at `studygnosis.com/bible/Genesis/1` (Genesis 1, KJV,
  side by side with Matthew Henry's Complete Commentary, verse 1
  selected), taken 2026-11-04. Scripture text is public-domain KJV;
  Matthew Henry's commentary is public domain.
- **Phone screen:** a faithful render of the app's mobile study view
  (SCRIPTURE tab active, Genesis 1, KJV, verse 1 selected), built from
  the app's real layout, colors, and text. It is a render, not a
  screenshot, because the available browser tooling cannot produce a
  narrow mobile viewport: it has no viewport-resize capability and
  synthetic zoom keystrokes do not change the browser zoom. The
  render is documented here as a render rather than passed off as a
  capture. If a genuine mobile capture is produced later, it should
  replace the phone screen and this note should be updated.
- **Logo:** the header logo is the repo's own `public/gnosis.svg`
  asset, rendered as an `<img>` in HTML. It is not part of this
  image.

## How the composite was made

The desert image was generated with blank, dark device screens. The
laptop screen quad was detected from the image itself (the screen is
a near-black rectangle on bright sand); the phone screen quad was
picked from grid-overlay zooms of the phone. Real captures/renders
were perspective-warped onto those quads. Tooling (not shipped):
`hero-work/composite.py`, `hero-work/render-phone.py`, and
`hero-work/export.py` in the working notes.

## Files

Responsive derivatives of one 1920x1280 master, in WebP (preferred)
with JPEG fallbacks, plus a 1200x800 JPEG for Open Graph previews.
The page's `<picture>` element picks by viewport width; `width` and
`height` attributes on the `<img>` reserve the 3:2 aspect ratio, so
the hero does not shift layout while loading. No preload link: the
site is a single-page app, so a preloaded hero would also fetch on
every other route.

| File | Size |
| ---- | ---: |
| hero-1920.jpg | 397 KB |
| hero-1920.webp | 247 KB |
| hero-1280.jpg | 208 KB |
| hero-1280.webp | 135 KB |
| hero-800.jpg | 92 KB |
| hero-800.webp | 66 KB |
| hero-480.jpg | 36 KB |
| hero-480.webp | 27 KB |
| hero-1200.jpg (Open Graph) | 186 KB |

Typical download is a single file: about 27 KB on a phone (480w
WebP) or 135-247 KB on desktop (1280w/1920w WebP).
