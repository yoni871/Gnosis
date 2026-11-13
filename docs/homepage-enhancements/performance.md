# Homepage enhancement lab comparison

Measured locally against production builds with Chromium, cache disabled, a 4x CPU slowdown, a 1440 x 1000 viewport, and the same scripted Explore interaction. These are repeatable lab observations rather than field Core Web Vitals.

| Route | Build | LCP | CLS | Interaction duration | Transfer |
| --- | --- | ---: | ---: | ---: | ---: |
| `/` | Before | 2920 ms | 0.080 | 320 ms | 684 KB |
| `/` | After | 2208 ms | 0.080 | 200 ms | 684 KB |
| `/biblical-history` | Before | 1796 ms | 0.011 | 152 ms | 449 KB |
| `/biblical-history` | After | 1264 ms | 0.011 | 208 ms | 456 KB |

The interaction-duration column is the maximum Event Timing entry from the scripted Explore click; it is an INP proxy, not Chrome's field INP. LCP naturally varies between local runs, so the important regression guards are unchanged CLS, no new runtime dependency, lazy-loaded motion, and a 7 KB transfer increase for the History selector and choreography.

Verification also covered desktop and mobile scrolling, reduced-motion mode, selector keyboard navigation, all 66 rendered book routes, and the legacy directory redirect fallback.
