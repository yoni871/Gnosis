# Landing page hero images

The hero image is a single scene, served responsively: the browser picks
the closest width from the `srcset` in `LandingPage.jsx` (480 / 800 /
1280 / 1672), with `hero-1200.jpg` used as the Open Graph image.

## Provenance

- **Scene:** supplied by Yonatan (Gemini-generated desert sunset with a
  laptop and a phone showing the Gnosis study interface). The image is
  used exactly as supplied: no compositing, no screen replacement, no
  retouching. Only delivery resizing (JPEG/WebP) was applied.
- The heading, subheading, and calls to action are real HTML over the
  image, never baked into it.

## Files (all 16:9, native aspect of the supplied image)

- `hero-1672.jpg` / `.webp` — full-size hero (1672x941, native resolution)
- `hero-1280.jpg` / `.webp` — 1280x720
- `hero-800.jpg` / `.webp` — 800x450
- `hero-480.jpg` / `.webp` — 480x270
- `hero-1200.jpg` — Open Graph image (1200x675)

Regenerating: resize the supplied image to the widths above (JPEG
quality 82, WebP quality 80); do not crop or upscale.
