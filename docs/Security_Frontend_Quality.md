# Frontend regression and lint follow-up

Stacked on PR #76. No live application, database or soak configuration changes.

The reader suites previously oversubscribed runners and sometimes exceeded the
five-second test deadline. Vitest now runs at most two DOM workers. The reader
and commentary also avoid redundant effect-driven reset renders: navigation
adjusts local state in the owning render, commentary derives loading from its
request identity and rejects stale results, and language dialogs reset by
passage identity. No test deadline was raised and no lint rules were disabled.

Floating UI callback setters are destructured rather than accessing a refs
container during render. Hook dependencies, unused catch bindings/imports and a
test-only render mutation are corrected. Initial auth restoration still advances
the ownership version after either success or rejection; session/auth protocol
behavior is unchanged. Existing Strict Mode, stale-response, private-state,
reader navigation, dropdown, modal focus and recovery tests remain enforced.

Validation: full frontend suite 378/378 passed with the default configuration;
ESLint reports zero errors and zero warnings. CI now enforces lint as well as
tests and the production build. Final combined validation is recorded in the PR.
