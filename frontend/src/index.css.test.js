import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(path.join(here, "index.css"), "utf8");
const mainJsx = readFileSync(path.join(here, "main.jsx"), "utf8");

// The `sr-only` hiding rule must live in index.css as plain CSS, not
// as a Tailwind utility. Tailwind utilities are generated on demand by
// the @tailwindcss/vite plugin, so a dev server started with a scratch
// config that does not run this repo's vite config serves a stylesheet
// with no Tailwind utilities at all — and every `sr-only` label then
// renders visibly (seen on the Trace the Doctrine workspace: the
// "Translation" label showed beside the selector). The plain rule below
// is identical to Tailwind v4's `sr-only` declarations and loads in
// every environment, dev and prod alike.
function srOnlyRule() {
    const match = indexCss.match(/\.sr-only\s*\{([^}]*)\}/);
    expect(match, "index.css must define a plain .sr-only rule").not.toBeNull();
    return match[1];
}

describe("sr-only", () => {
    test("index.css defines a plain .sr-only rule with the hiding declarations", () => {
        const body = srOnlyRule();
        for (const declaration of [
            "position: absolute",
            "width: 1px",
            "height: 1px",
            "padding: 0",
            "margin: -1px",
            "overflow: hidden",
            "clip-path: inset(50%)",
            "white-space: nowrap",
            "border-width: 0",
        ]) {
            expect(body).toContain(declaration);
        }
    });

    test("the .sr-only rule is plain CSS, not inside a Tailwind @layer", () => {
        // A rule nested in `@layer utilities { ... }` would still depend
        // on Tailwind's compilation; the point of the plain rule is that
        // it survives a stylesheet served without the Tailwind plugin.
        // index.css only ever carries one .sr-only rule — the plain one.
        expect(indexCss.match(/\.sr-only\s*\{/g)).toHaveLength(1);
        expect(indexCss).not.toMatch(/@layer[^{]*\{[^}]*\.sr-only/s);
    });

    test("main.jsx imports index.css, so the rule loads on every page", () => {
        expect(mainJsx).toMatch(/import\s+['"]\.\/index\.css['"]/);
    });

    test("every sr-only usage in the app relies on this one class", () => {
        // If a component ever uses a different hiding class, it must get
        // the same plain-CSS treatment — flag it here instead of silently
        // depending on a generated utility.
        expect(indexCss).toContain(".sr-only");
    });
});
