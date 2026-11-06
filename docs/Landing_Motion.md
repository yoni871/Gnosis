# Landing-page scroll narrative

Motion is a homepage-only progressive enhancement. `useLandingMotion` lazily
loads `landingMotion`, GSAP 3.15.1 and ScrollTrigger. Static JSX/CSS remains the
fallback if the chunk fails, APIs are unavailable, or reduced motion is enabled.
The dependency is pinned with npm registry provenance and lockfile integrity.

## Chapters

- **Hero:** at suitable desktop sizes, hold for 0.6 viewport heights. Scrub a 7%
  scale of the intact photograph, lift/fade the copy, and blend into ivory.
  Touch/narrow/short layouts do not pin and use a smaller scene scale.
- **Purpose:** a masked heading opens the chapter; three successive scroll
  intervals emphasize Scripture, Theology, and History through position and
  restrained icon scaling. No pin.
- **Bible & Commentary:** the complete device composition scales from 82% to
  100% on larger screens (91% on mobile), with coordinated copy movement.
  Device screen overlays stay attached to their original figure. No pin.
- **Beyond the Text:** focus on John 1:1, extend real SVG paths from the hub to
  their original endpoints, then sequence the six categories and hold the
  finished network. The inner grid pins for 1.05 viewport heights only when
  it fits. Unpinned versions use the diagram itself as the scroll trigger, so
  the sequence unfolds while the diagram is visible on stacked layouts.
- **Explore Scripture:** the headline opens through a mask, cards settle as a
  collection, then the invitation and final CTA finish the narrative. No pin;
  the forest-green footer follows naturally without internal animation.

ScrollTrigger uses native browser scroll positions, short scrub interpolation,
and no snapping, scroll proxy, normalization, scroll smoothing, or wheel/touch
interception. Reverse scrolling reverses the timelines. At most two pins add
1.65 viewport heights total. Pinning requires width >=1200px, height >=900px,
a fine pointer and hover; tall content is checked before pinning. Existing
layout, fonts, imagery, routes and navigation remain the source of truth.

## Lifecycle and accessibility

`gsap.matchMedia()` reverts/rebuilds responsive contexts. Reduced motion skips
all timelines and pins. Context reversion restores styles and SVG geometry;
explicit path snapshots also protect fallback geometry. React cleanup cancels
pending loading/refresh work and removes image/focus listeners. A late chunk
cannot initialize an unmounted page or invalidate its Strict Mode replacement.
Font/image refresh requests are coalesced into one animation frame.

Focusing a control completes its chapter and releases its pin, keeping native
keyboard and anchor navigation usable. Normal links, headings and screen-reader
semantics do not depend on animation. No content has an initially hidden CSS
state. No navigation or About-page animations are registered.

## Verification

Run from `frontend`:

```sh
npm test
npm run lint
npm run build:check
```

The repository has existing lint debt in reader/auth files; motion changes must
pass targeted ESLint without expanding into those files. Unit tests cover
async failure/unmount/Strict Mode handling, responsive pin policy, reduced
motion, SVG endpoint preservation, keyboard release, and initialization cleanup.

Browser QA should cover 320/390/768/1024/1280/1440/1920px, short/landscape
viewports, down/up scrolling, pin entry/exit, desktop-to-mobile resizing, live
reduced-motion changes, failed motion chunks, route changes and keyboard focus.
Verify idle/scroll performance and no overflow. Use WebKit touch emulation as a
Safari-engine check, but retain physical iPhone Safari visual approval before
release; emulation does not reproduce browser chrome or every device constraint.

## Rollback

Revert the scroll-narrative commit to restore the previous controller and SVG
lines, and remove GSAP through the reverted package/lockfile changes. No backend,
data, migration or deployment configuration is involved. Never merge or promote
PR #28 merely to test motion: use its existing Vercel Preview.
