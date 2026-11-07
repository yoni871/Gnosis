# Public navigation and About header refinements

Baseline: latest fetched main, `ed22371`, including merged PRs #53 and #55. These changes replace the horizontal dropdown compression; there is no menu-height percentage target. Screenshots use local production builds and a synthetic signed-in Test Reader account.

## What changed

- Explore is a 280px desktop dropdown anchored beneath the Explore trigger, with a primary Bible & Commentary label and a smaller muted description beneath it. Full descriptions remain intact.
- Account is a right-aligned 240px desktop dropdown with vertically stacked 44px action rows and a divider before Sign out. Continue studying and Sign out remain the only public account actions; Bookmarks/Highlights were not reintroduced.
- The account button uses a three-column grid for avatar, name, and caret. This fixes the previous intrinsic flex sizing that truncated even Test Reader. Desktop width is capped at 224px; the mobile button can use up to 260px. Longer names truncate only at the cap and retain their full accessible label and title.
- Landing and About retain one shared LandingHeader component with the same dimensions, typography, spacing, disclosure behavior, and responsive layout. Landing remains transparent over the hero. About uses warm charcoal-brown #342725, with less space before its content.
- Public navigation uses a 2px focus indicator with no 6px halo. The old appearance came from the public-page 3px outline plus a 6px box shadow and an About-specific override; only navigation focus styling was refined.
- Mobile navigation is a bounded floating card. Nested dropdowns stay in normal flow within it, with 44px targets, a viewport-height scroll limit, and layering above the About contents navigation.
- Added Bringing Scripture Into Focus directly below the gold OUR MISSION label, using the exact existing Our Vision H2 styling. The mission statement, supporting paragraph, and commentary disclaimer remain unchanged.
- Continue Reading now shows only the saved location and translation in its existing small subtitle inside the link. Verse numbers are retained when present, and translation/commentary/verse URL parameters are preserved.

## Interaction fixes found in real browsers

- Closing an in-flow Explore menu on pointer-down moved the Account button before a touch click completed. Public disclosures now defer outside dismissal to the completed click; the reader keeps its existing mousedown behavior.
- Replacing the hamburger SVG with its close icon detached the original click target before the document listener ran. Outside-click detection now checks the original composed event path, so an inside icon tap is still recognized as inside.
- Chrome focus transfer could collapse one disclosure before the next trigger activated. Sibling disclosure triggers in the same header retain their position until activation, while ordinary focus leaving and outside clicks still close menus.

## About header before and after

| Width | Before | After | Reduction | Screenshots |
|---|---:|---:|---:|---|
| 1440px | 124px | 72px | 41.9% | [Before](before-1440-about-header.jpg) · [After](after-1440-about-header.jpg) |
| 1280px | 124px | 72px | 41.9% | [Before](before-1280-about-header.jpg) · [After](after-1280-about-header.jpg) |
| 768px | 106px | 64px | 39.6% | [Before](before-768-about-header.jpg) · [After](after-768-about-header.jpg) |
| 390px | 104px | 64px | 38.5% | [Before](before-390-about-header.jpg) · [After](after-390-about-header.jpg) |
| 320px | 104px | 64px | 38.5% | [Before](before-320-about-header.jpg) · [After](after-320-about-header.jpg) |

The reduction is within the requested 35–45% at every measured width. Header controls remain vertically centered with at least 44px click targets. The About background changes from #233e34 to #342725. Fixed opaque color pairs provide about 13.69:1 for ivory header text, 12.97:1 for primary menu text, 5.56:1 for descriptions, and 8.41:1 for Sign out text against parchment. These ratios describe the solid surfaces, not text over the landing photograph.

## Final dropdown dimensions

| Width | Explore | Account |
|---|---:|---:|
| 1440px | 280 × 101.75px | 240 × 111px |
| 1280px | 280 × 101.75px | 240 × 111px |
| 768px | 314 × 101.75px | 260 × 111px |
| 390px | 314 × 101.75px | 260 × 111px |
| 320px | 246 × 101.75px | 246 × 111px |

On small screens the Explore card uses the available navigation-card width; Account stays at or below 260px. All expanded cards fit inside the viewport.

## Both dropdowns open, before and after

| Width | Landing Explore | Landing Account | About Explore | About Account |
|---|---|---|---|---|
| 1440px | [Before](before-1440-landing-explore.jpg) · [After](after-1440-landing-explore.jpg) | [Before](before-1440-landing-account.jpg) · [After](after-1440-landing-account.jpg) | [Before](before-1440-about-explore.jpg) · [After](after-1440-about-explore.jpg) | [Before](before-1440-about-account.jpg) · [After](after-1440-about-account.jpg) |
| 1280px | [Before](before-1280-landing-explore.jpg) · [After](after-1280-landing-explore.jpg) | [Before](before-1280-landing-account.jpg) · [After](after-1280-landing-account.jpg) | [Before](before-1280-about-explore.jpg) · [After](after-1280-about-explore.jpg) | [Before](before-1280-about-account.jpg) · [After](after-1280-about-account.jpg) |
| 768px | [Before](before-768-landing-explore.jpg) · [After](after-768-landing-explore.jpg) | [Before](before-768-landing-account.jpg) · [After](after-768-landing-account.jpg) | [Before](before-768-about-explore.jpg) · [After](after-768-about-explore.jpg) | [Before](before-768-about-account.jpg) · [After](after-768-about-account.jpg) |
| 390px | [Before](before-390-landing-explore.jpg) · [After](after-390-landing-explore.jpg) | [Before](before-390-landing-account.jpg) · [After](after-390-landing-account.jpg) | [Before](before-390-about-explore.jpg) · [After](after-390-about-explore.jpg) | [Before](before-390-about-account.jpg) · [After](after-390-about-account.jpg) |
| 320px | [Before](before-320-landing-explore.jpg) · [After](after-320-landing-explore.jpg) | [Before](before-320-landing-account.jpg) · [After](after-320-landing-account.jpg) | [Before](before-320-about-explore.jpg) · [After](after-320-about-explore.jpg) | [Before](before-320-about-account.jpg) · [After](after-320-about-account.jpg) |

## Landing header and location-only subtitle

| Width | Before | After |
|---|---|---|
| 1440px | [Screenshot](before-1440-landing-header.jpg) | [Screenshot](after-1440-landing-header.jpg) |
| 1280px | [Screenshot](before-1280-landing-header.jpg) | [Screenshot](after-1280-landing-header.jpg) |
| 768px | [Screenshot](before-768-landing-header.jpg) | [Screenshot](after-768-landing-header.jpg) |
| 390px | [Screenshot](before-390-landing-header.jpg) | [Screenshot](after-390-landing-header.jpg) |
| 320px | [Screenshot](before-320-landing-header.jpg) | [Screenshot](after-320-landing-header.jpg) |

## Additional visual checks

- Mission heading: [Desktop](after-1440-mission-heading.jpg) · [Mobile](after-390-mission-heading.jpg).
- Long names: [Desktop](after-1440-long-name-account.jpg) · [320px mobile](after-320-long-name-account.jpg).
- Chrome checks: [Desktop long name](after-chromium-1440-long-name-account.jpg) · [320px long name](after-chromium-320-long-name-account.jpg) · [Desktop mission](after-chromium-1440-mission-heading.jpg) · [Mobile mission](after-chromium-390-mission-heading.jpg).

## Validation

- Full frontend suite: 36 files, 266 tests passed after the final interaction fixes. Regressions cover SVG replacement, hamburger toggling, touch-style blur, switching disclosures in both directions, natural Tab order, Escape/focus restoration, outside dismissal, existing reader outside-click behavior, the new mission heading, and the location-only subtitle.
- Frontend production build and ESLint on all changed JS/JSX files passed. CSS compiled through the production build.
- Production-build WebKit checks passed at 1440, 1280, 768, 390, and 320px on Landing and About: position, width, vertical menu structure, alignment, targets, short-name display, viewport fit, mission/Vision heading typography equality, and clicking the subtitle to the exact saved reader URL.
- WebKit and installed Chrome both passed long-name, avatar alignment, bounded chip sizing, desktop non-overlap, actual mobile touch switching, outside touch/mouse dismissal, Enter/Escape/focus restoration, and real sign-out checks at all five widths. Chrome used normal Tab; this local WebKit used its all-controls Option+Tab shortcut. Standard Tab order is also covered in component tests.
- Before/after and additional screenshots were inspected at desktop and narrow-mobile sizes. Browser APIs were mocked; no real account/provider/production data was used.
- No backend, database, production branch, deployment, or dependency changes.

Raw evidence: [Before dimensions](before-measurements.json) · [After dimensions](after-measurements.json) · [WebKit interactions](interaction-checks.json) · [Chrome interactions](interaction-checks-chromium.json).

## Source files

- LandingHeader.jsx, ExploreDropdown.jsx, LandingNavbar.css: shared navigation structure, layout, responsive presentation, and interaction behavior.
- useClickOutside.js and utils/disclosureFocus.js: original click-path detection and stable focus handoff, with the existing reader default preserved.
- AboutPage.css and AboutPage.jsx: warm compact header/content spacing and the new mission title.
- LandingPage.jsx: location-only subtitle, retaining existing styling and destination.
- LandingHeader.test.jsx, useClickOutside.test.jsx, AboutPage.test.jsx, LandingPage.test.jsx: focused regressions.
