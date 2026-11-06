# Landing and About refinements

These previews use synthetic account and reading-position data. No real account,
backend, or database was accessed. The application keeps its existing fonts,
forest-green/ivory/gold palette, authentication, and reading-progress flow.

| View | Desktop | Mobile |
| --- | --- | --- |
| Continue reading | [1440px](landing-desktop.jpg) | [390px](landing-mobile.jpg) |
| Explore disclosure | [1440px](explore-desktop.jpg) | [390px](explore-mobile.jpg) |
| Account disclosure | [1440px](account-desktop.jpg) | [390px](account-mobile.jpg) |
| About mission | [1440px](about-mission-desktop.jpg) | [390px](about-mission-mobile.jpg) |

Tablet previews: [landing](landing-tablet.jpg), [About mission](about-mission-tablet.jpg).

Browser validation used a temporary Playwright installation and the installed
WebKit browser. No project dependency was added. The full viewport matrix is
1440 × 1000, 820 × 1180, 390 × 844, and 320 × 740, tested as both a guest and a
signed-in reader with reduced motion enabled. See [checks.json](checks.json).

Checks cover horizontal overflow, compact in-bounds Explore/account panels,
Enter/Space disclosure activation, link focus, Escape focus restoration, focus
leaving the disclosure, a single mission title, and 16–18px mission typography.
On macOS WebKit, Option-Tab follows navigation links; the existing component
unit tests additionally verify standard Tab behavior. Continue reading was
clicked and navigated to the saved book, chapter, verse, translation and
commentary: `/bible/Genesis/1?translation=ESV&commentary=3&verse=5`.
