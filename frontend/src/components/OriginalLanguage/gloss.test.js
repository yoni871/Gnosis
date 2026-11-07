import { describe, expect, test } from "vitest";

import { displayGloss, hasGloss } from "./gloss";

describe("displayGloss", () => {
    test("keeps real glosses, including STEPBible's supplied-word brackets", () => {
        expect(displayGloss("the heavens")).toBe("the heavens");
        expect(displayGloss("in beginning")).toBe("in beginning");
        // Bracketed words mixed with real content are STEPBible's own
        // convention for supplied words, not placeholders.
        expect(displayGloss("<to> the light")).toBe("<to> the light");
        expect(displayGloss("[that] which")).toBe("[that] which");
        expect(displayGloss("<it> was")).toBe("<it> was");
    });

    test("the object-marker label is stripped from mixed glosses, not shown as a meaning", () => {
        // "<obj.>" is a grammatical label, not a supplied word: the
        // Grammar column already states the object-marker role.
        expect(displayGloss("and <obj.>")).toBe("and");
        expect(displayGloss("<obj.> them")).toBe("them");
        expect(displayGloss("<obj.> it")).toBe("it");
    });

    test("a gloss that is only a bracketed placeholder shows an em dash", () => {
        expect(displayGloss("<the>")).toBe("—");
        expect(displayGloss("<obj.>")).toBe("—");
        expect(displayGloss("  <the>  ")).toBe("—");
    });

    test("an empty or missing gloss shows an em dash, never an invented definition", () => {
        expect(displayGloss("")).toBe("—");
        expect(displayGloss("   ")).toBe("—");
        expect(displayGloss(null)).toBe("—");
        expect(displayGloss(undefined)).toBe("—");
    });

    test("hasGloss agrees with displayGloss", () => {
        expect(hasGloss("knowledge")).toBe(true);
        expect(hasGloss("<to> the light")).toBe(true);
        expect(hasGloss("and <obj.>")).toBe(true);
        expect(hasGloss("<the>")).toBe(false);
        expect(hasGloss("<obj.>")).toBe(false);
        expect(hasGloss("")).toBe(false);
        expect(hasGloss(null)).toBe(false);
    });
});
