# Lora body font (self-hosted)

The body font for the whole site. No package dependency or runtime
third-party font request was added. These Latin WOFF2 subsets were
retrieved from the official Google Fonts CSS API on 2026-11-06:

`https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&display=swap`

Google serves Lora as a variable font, so the seven requested
weight/style combinations resolve to just two files — one upright,
one italic — each covering weights 400–700. The unused weights
100–300 from the old `@import` are not shipped, and weight 700,
which the site uses (18 places) but the old `@import` did not
request, is now covered instead of being synthesised.

- Lora variable upright (wght 400–700), Google Fonts distribution v37, 37,788 bytes:
  `https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwr7Iw.woff2`
  SHA-256: `ddb8c66035104e233fc024669183aad3738b6daa16deee2ebb1241bd0f98ace1`
- Lora variable italic (wght 400–700), Google Fonts distribution v37, 40,772 bytes:
  `https://fonts.gstatic.com/s/lora/v37/0QIhMX1D_JOuMw_LIftL.woff2`
  SHA-256: `d824d807d4d832d12c87932d0b8ec1314dcfd502157a56dee6bb04cf8a3768ae`

Lora uses the SIL Open Font License 1.1 (`google/fonts`, `ofl/lora/OFL.txt`).
No fonts were modified. Versions and hashes identify the committed
files; builds do not download or refresh them.
