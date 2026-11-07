# Compact landing and About refinements

Baseline: latest fetched `main`, commit `b12d355`. Measurements and screenshots use the production build in WebKit with reduced motion, a 900px viewport height, and mocked APIs for a synthetic signed-in reader saved at Genesis 1:5, ESV, commentary 3. No live account or production data was used.

## Result

- Continue Reading and its smaller subtitle are children of one link. The complete saved book/chapter/verse, translation, and commentary URL is preserved. The reading location is not repeated below the link. Passage and translation stay together when the subtitle wraps on narrow screens.
- Explore keeps its complete title and description in a compact desktop row. Account actions share one row. All existing content and navigation remain; the public account menu had Continue studying and Sign out, not Profile/Settings, and those actions remain unchanged. Bookmarks and Highlights were not added.
- The mission section already contained only one H2. The second visible desktop “Our Mission” was a sidebar anchor, not a duplicate heading or CSS-generated content. Its label is now “Mission,” retaining the same #mission target and mobile section navigation. Exactly one visible “Our Mission” remains at all five widths.
- The exact mission statement remains a paragraph: 16px desktop/tablet and 15.5px mobile, with a restrained burgundy tone and left rule. Baseline main already had a mission-specific 16–17.28px rule overriding the generic larger statement style; this change edits that rule directly rather than stacking new overrides.
- Removed competing legacy account-menu declarations from LandingPage.css; LandingNavbar.css owns public popovers. Reader menus are untouched.

## Rendered expanded dropdown heights

| Viewport | Explore before → after | Reduction | Account before → after | Reduction |
|---|---:|---:|---:|---:|
| 1440px | 95.03 → 36.00px | 62.1% | 102.00 → 36.00px | 64.7% |
| 1280px | 95.03 → 36.00px | 62.1% | 102.00 → 36.00px | 64.7% |
| 768px | 91.03 → 58.45px | 35.8% | 98.00 → 52.00px | 46.9% |
| 390px | 91.03 → 75.72px | 16.8% | 98.00 → 52.00px | 46.9% |
| 320px | 91.03 → 75.72px | 16.8% | 98.00 → 52.00px | 46.9% |

Desktop menus exceed the requested 60% reduction. The responsive navigation at 768px and below retains minimum 44px touch targets. A 60% reduction would require panels under 36.41px for Explore and 39.2px for Account, smaller than a single accessible 44px target even before borders/padding. Explore also retains its full description, which wraps on 390px and 320px screens. Mobile reductions therefore preserve touch targets and readable content rather than forcing the desktop percentage. Desktop items are 28px high with visible keyboard focus; mobile account items are 44px, and Explore targets are 50.45–67.72px.

Continue Reading grows from 54.75px to about 60.83px (77.52px at 320px where its subtitle wraps), replacing the previous button-plus-separate-paragraph stack. Secondary text is 11.52px with lighter weight and high-contrast subdued ivory on the existing green CTA.

## Before and after screenshots

| Width | Continue Reading | Explore expanded | Account expanded | Mission section |
|---|---|---|---|---|
| 1440px | [Before](before-1440-continue.jpg) · [After](after-1440-continue.jpg) | [Before](before-1440-explore.jpg) · [After](after-1440-explore.jpg) | [Before](before-1440-profile.jpg) · [After](after-1440-profile.jpg) | [Before](before-1440-mission.jpg) · [After](after-1440-mission.jpg) |
| 1280px | [Before](before-1280-continue.jpg) · [After](after-1280-continue.jpg) | [Before](before-1280-explore.jpg) · [After](after-1280-explore.jpg) | [Before](before-1280-profile.jpg) · [After](after-1280-profile.jpg) | [Before](before-1280-mission.jpg) · [After](after-1280-mission.jpg) |
| 768px | [Before](before-768-continue.jpg) · [After](after-768-continue.jpg) | [Before](before-768-explore.jpg) · [After](after-768-explore.jpg) | [Before](before-768-profile.jpg) · [After](after-768-profile.jpg) | [Before](before-768-mission.jpg) · [After](after-768-mission.jpg) |
| 390px | [Before](before-390-continue.jpg) · [After](after-390-continue.jpg) | [Before](before-390-explore.jpg) · [After](after-390-explore.jpg) | [Before](before-390-profile.jpg) · [After](after-390-profile.jpg) | [Before](before-390-mission.jpg) · [After](after-390-mission.jpg) |
| 320px | [Before](before-320-continue.jpg) · [After](after-320-continue.jpg) | [Before](before-320-explore.jpg) · [After](after-320-explore.jpg) | [Before](before-320-profile.jpg) · [After](after-320-profile.jpg) | [Before](before-320-mission.jpg) · [After](after-320-mission.jpg) |

[Raw baseline measurements](before-measurements.json) · [Raw refined measurements](after-measurements.json)

## Validation

- 50 relevant frontend tests passed across LandingPage, AboutPage, ExploreDropdown, AboutSectionNavigation, and readingState. Updated assertions cover subtitle containment, unique location description, exact saved destination, one mission heading/text instance, semantic paragraph wording, and the retained mission anchor.
- Production build passed after the final visual refinement.
- ESLint passed for all changed JS/JSX files. CSS compiled through the production build and existing responsive rules were inspected directly.
- Browser checks passed at 1440, 1280, 768, 390, and 320px: full subtitle inside the link; clicking it reaches /bible/Genesis/1?translation=ESV&commentary=3&verse=5; Explore and account Escape restore focus; no menu overflow; mobile targets at least 44px; one visible Our Mission heading; correct mission font sizes; no About-page horizontal overflow.
- Inspected desktop and narrow-mobile screenshots, then refined the narrow subtitle to avoid an orphaned translation.
- No authentication, backend, database, production branch, or deployment changes. No new dependencies.

## Files changed

- frontend/src/pages/LandingPage.jsx and LandingHero.css: integrated CTA.
- frontend/src/components/LandingNavbar.css and frontend/src/pages/LandingPage.css: compact shared public menus and removal of conflicting legacy declarations.
- frontend/src/pages/AboutPage.css and aboutContent.js: mission paragraph treatment and navigation label.
- LandingPage.test.jsx and AboutPage.test.jsx: focused regressions.
- This screenshot/measurement directory: review evidence for all five widths.
