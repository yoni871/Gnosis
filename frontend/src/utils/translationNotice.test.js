import { describe, expect, test } from "vitest";

import { getTranslationNotice } from "./translationNotice";

const TRANSLATIONS = [
    { id: 1, name: "Berean Standard Bible", abbreviation: "BSB" },
    {
        id: 5,
        name: "English Standard Version",
        abbreviation: "ESV",
        notice: "Scripture quotations are from the ESV® Bible.",
        notice_url: "https://www.esv.org",
    },
    {
        id: 7,
        name: "New Living Translation",
        abbreviation: "NLT",
        notice: "Scripture quotations marked (NLT) are taken from the Holy Bible, New Living Translation.",
        notice_url: null,
    },
];

describe("getTranslationNotice", () => {
    test("a stored translation has no notice", () => {
        expect(getTranslationNotice(TRANSLATIONS, "BSB")).toBeNull();
    });

    test("a licensed translation returns its notice and link host", () => {
        expect(getTranslationNotice(TRANSLATIONS, "ESV")).toEqual({
            text: "Scripture quotations are from the ESV® Bible.",
            url: "https://www.esv.org",
            host: "www.esv.org",
        });
    });

    test("a notice without a link returns a null url and host", () => {
        expect(getTranslationNotice(TRANSLATIONS, "NLT")).toEqual({
            text: "Scripture quotations marked (NLT) are taken from the Holy Bible, New Living Translation.",
            url: null,
            host: null,
        });
    });

    test("an unknown abbreviation returns null", () => {
        expect(getTranslationNotice(TRANSLATIONS, "MSG")).toBeNull();
    });

    test("a malformed link never breaks the notice", () => {
        const rows = [
            { abbreviation: "ESV", notice: "Notice.", notice_url: "not a url" },
        ];
        expect(getTranslationNotice(rows, "ESV")).toEqual({
            text: "Notice.",
            url: "not a url",
            host: null,
        });
    });
});
