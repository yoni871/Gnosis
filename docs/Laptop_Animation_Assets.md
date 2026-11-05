# Assets needed for the approved laptop animation

The current approved desert scene is one flattened JPEG/WebP image. It contains
both the open laptop and the flat phone. There is no separate lid, keyboard,
clean background or matching 3D model in the repository. The small unrelated
`src/assets/hero.png` is a Vite illustration, not a device source.

The rejected whole-scene parallax has been removed. The hero stays static until
matching assets are available; it does not simulate closing by rotating a photo
crop. Hero text, typography, CTA behavior and original image files are preserved.

## Required source assets

1. **Clean background plate**, matching the approved 1672 × 941 composition,
   camera and light. Remove the laptop and its baked shadow, restoring the sand
   behind its open screen. Preserve the visible desert and phone. Keeping the
   phone in this stationary plate avoids needing a separate phone animation.
2. **Matching laptop**, preferably a licensed GLB/glTF with the same body shape,
   silver finish, black keyboard, screen proportions and viewing perspective.
   The base and lid must be separate meshes, with the lid pivot precisely at the
   rear hinge. It must include the outside/back and edges of the lid; these are
   not visible in the supplied photograph and cannot be recovered from it.
3. **Screen texture**, the original full-resolution Gnosis screenshot used by
   the approved scene, or an approved rectified extraction of that exact screen.
   It must not substitute an unrelated interface or expose personal account data.
4. **Scene calibration**, matching camera position/FOV, ground plane, device
   position/scale, material response and sunset lighting. Shadows must stay
   grounded as the lid rotates. If these are not supplied with the model, the
   prepared composition needs visual approval before integration.

A perspective-matched layered render is an alternative to GLB: transparent
base, lid front/back/edge, clean background and shadow layers with known camera
and hinge coordinates. One rectangular crop of the existing screen is not an
adequate lid asset: it includes background pixels, has no rear surface and
leaves the original open laptop visible behind it.

## Integration once assets are approved

- Keep the current responsive image as the initial/reduced-motion/mobile fallback.
- Load the model only where animation is enabled and only after the fallback
  scene is ready. Replace the photographed laptop and its shadow as one prepared
  composition; never layer a second laptop over the existing one.
- Render a fixed base with the lid's opening angle mapped to clamped hero scroll
  progress. Open at the top, close on scroll down, reopen on scroll up; use the
  supplied hinge limits. Do not intercept scrolling or autoplay.
- The phone/background remain in the fixed plate. Keep the present hero text
  and responsive layout. Use passive input, one render per frame, and complete
  teardown of the renderer/listeners/textures on unmount.
- Choose a small renderer/animation dependency only after the real asset format
  is known. A package cannot recover missing background or device geometry.
- Verify camera match, both scroll directions, stationary phone/background,
  retained screen content, reduced motion, low-end/mobile fallback, no layout
  shift, route changes, Strict Mode teardown and GPU/resource usage.

No substitute model, new hero image, package dependency, or production deployment
was introduced for this investigation.
