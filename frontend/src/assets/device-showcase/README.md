# Static device showcase

`devices-source.png` is a new photographic-style device shell and setting asset created with the built-in image-generation tool. It contains exactly one laptop and one phone with blank screens. It is generated artwork, not a photograph of physical hardware. The complete prompt is in `generation-prompt.txt`.

Delivery copies are JPEG quality 88 at 1536px and 900px wide, made with macOS sips. They live under `frontend/public/images/landing/device-showcase/`. The source PNG stays outside the public build graph.

`LandingDeviceShowcase.jsx` overlays the supplied real screenshot images as separate HTML images; no interface or biblical text is generated. Percentage screen coordinates are measured against the 1536 × 1024 device plate. The laptop capture masks the original first 391 rows, retaining both Scripture and Matthew Henry. It is contained within the physical display with neutral margins to preserve its aspect ratio and all text. The phone uses the supplied John 1 Scripture capture at its original ratio, including its genuine mobile chrome. A static camera cutout preserves the device shell's appearance. Nothing animates; there is no WebGL, scroll handler, or new dependency.

All original screenshots remain unchanged under `frontend/src/assets/bible-commentary/`. The previous standalone commentary capture remains preserved as a source but is no longer displayed. Only one phone is shown at every viewport. No informational badges are rendered.
