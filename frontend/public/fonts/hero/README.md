# Hero fonts and scene constraints

Only the landing hero and its navbar use these fonts. No package dependency or runtime
third-party font request was added. These Latin WOFF2 subsets were retrieved
from the official Google Fonts CSS API on 2026-11-05:

`https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Inter:wght@400;500;600&display=swap`

- Cormorant Garamond 600, Google Fonts distribution v21, 23,384 bytes:
  `https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_iE9KnTOitk9IfqxUQ.woff2`
  SHA-256: `53205cf81200f21bd07a711c1ff238c216fd43244b48ae1c4fd35a2bb65bd8c4`
- Inter variable (used at 400–600), Google Fonts distribution v20, 48,432 bytes:
  `https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2`
  SHA-256: `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4`

Both use SIL Open Font License 1.1; complete licenses are included, from
`google/fonts` (`ofl/cormorantgaramond/OFL.txt`, `ofl/inter/OFL.txt`). No fonts
were modified. Versions and hashes identify the committed files; builds do
not download or refresh them. Local Georgia/Times fallbacks use adjusted word
widths so font loading does not rewrap the two desktop headline lines.

## Animation limit

The approved `images/landing/sunset-hero-images/hero-*` assets contain the
laptop, phone, shadows and background as one flattened image. No separate
device assets or rigged model exist in this checkout. Image files and screen
content remain unchanged. The scene is static: the rejected parallax fallback
has been removed. Physical laptop animation is awaiting matching source assets.

Realistic closing requires a perspective-matched transparent lid (front,
back, edge), separate keyboard/base, clean desert background with the laptop
removed, coordinated shadows, and precise hinge coordinates; or a licensed,
textured and rigged 3D model with the approved screen content. The clean background plate can retain the existing phone so it stays stationary. Rotating a rectangular crop cannot
supply these assets. See `docs/Laptop_Animation_Assets.md` in the repository for
the complete asset contract and implementation boundary.
