const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    parseTahotLine, parseTagntLine, parseLexiconLine,
    parseMorphologyCodeFile, parseMorphologyExpansion,
    grammarDisplayForMorphemes, morphologyLookupKey, deriveLexicalEntry,
} = require("../../src/importer/importOriginalLanguage");

const fixtures = path.join(__dirname, "..", "fixtures", "original-language");
const readFixture = name => fs.readFileSync(path.join(fixtures, name), "utf8");
// Expected original-script literals are normalized to NFC before
// comparing: the source files mix legacy Greek oxia characters and
// Hebrew combining-mark orders, and the importer stores NFC.
const nfc = value => value.normalize("NFC");
const dataLines = name => readFixture(name)
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith("#"));

test("morphology expansions flatten to display tokens", () => {
    assert.deepEqual(
        parseMorphologyExpansion("Function=Noun; Case=Genitive; Number=Singular; Gender=Feminine"),
        ["Noun", "Genitive", "Singular", "Feminine"]);
    assert.deepEqual(
        parseMorphologyExpansion("Function=Verb; Tense=Present; Voice=Middle or Passive Deponent; Mood=Indicative; Person=1st; Number=Singular"),
        ["Verb", "Present", "Middle or Passive Deponent", "Indicative", "1st", "Singular"]);
    // Hebrew verb expansions carry "hence" clauses: their meaning is
    // flattened into the token list, not dropped.
    assert.deepEqual(
        parseMorphologyExpansion("Function=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Perfect (hence Tense=Past/present; Mood=Indicative); Person=Third; Gender=Masculine; Number=Singular"),
        ["Verb", "Qal", "Simple", "Active", "Perfect", "Past/present", "Indicative", "Third", "Masculine", "Singular"]);
    assert.deepEqual(parseMorphologyExpansion("Function=Preposition"), ["Preposition"]);
});

test("morphology lookup keys are positional: only the first morpheme carries the language letter", () => {
    // First morpheme: used as-is (HR, HVqp3ms, N-GSF).
    assert.equal(morphologyLookupKey("HR", "H", true), "HR");
    assert.equal(morphologyLookupKey("HVqp3ms", "H", true), "HVqp3ms");
    assert.equal(morphologyLookupKey("N-GSF", "G", true), "N-GSF");
    // Later morphemes: bare codes take the word's language letter.
    assert.equal(morphologyLookupKey("Ncfsa", "H", false), "HNcfsa");
    assert.equal(morphologyLookupKey("To", "H", false), "HTo");
    assert.equal(morphologyLookupKey("Sp3ms", "H", false), "HSp3ms");
    // A bare code starting with A is an adjective, not Aramaic.
    assert.equal(morphologyLookupKey("Aafsa", "H", false), "HAafsa");
    assert.equal(morphologyLookupKey("Acmsc", "H", false), "HAcmsc");
});

test("TAHOT Genesis 1:1 parses into words with morphemes", () => {
    const rows = dataLines("tahot-gen-1-1.txt").map(parseTahotLine);
    assert.equal(rows.length, 7);
    assert.ok(rows.every(Boolean));

    const first = rows[0];
    assert.equal(first.book, "Gen");
    assert.equal(first.chapter, 1);
    assert.equal(first.verse, 1);
    assert.equal(first.wordIndex, 1);
    assert.equal(first.type, "L");
    assert.equal(first.wordText, "בְּרֵאשִׁ֖ית");
    assert.equal(first.transliteration, "be.re.Shit");
    assert.equal(first.gloss, "in beginning");
    assert.equal(first.rootStrong, "H7225G");
    assert.equal(first.morphemes.length, 2);
    assert.equal(first.morphemes[0].text, "בְּ");
    assert.equal(first.morphemes[0].strongNumber, "H9003");
    assert.equal(first.morphemes[0].morphologyCode, "HR");
    assert.equal(first.morphemes[0].isRoot, false);
    assert.equal(first.morphemes[1].text, "רֵאשִׁ֖ית");
    assert.equal(first.morphemes[1].strongNumber, "H7225G");
    assert.equal(first.morphemes[1].morphologyCode, "Ncfsa");
    assert.equal(first.morphemes[1].isRoot, true);

    // Single-morpheme verb: בָּרָא, Qal perfect 3ms.
    const created = rows[1];
    assert.equal(created.wordText, "\u05d1\u05b8\u05bc\u05e8\u05b8\u05a3\u05d0");
    assert.equal(created.rootStrong, "H1254A");
    assert.equal(created.morphemes.length, 1);
    assert.equal(created.morphemes[0].morphologyCode, "HVqp3ms");

    // Object marker אֶת with the definite-article prefix word.
    const heavens = rows[4];
    assert.equal(heavens.wordText, "\u05d4\u05b7\u05e9\u05b8\u05bc\u05c1\u05de\u05b7\u0596\u05d9\u05b4\u05dd");
    assert.equal(heavens.rootStrong, "H8064");
    assert.equal(heavens.morphemes[1].morphologyCode, "Ncmpa");

    // Sof pasuq: the verse-end mark stays in the word text, the
    // backslash marker is stripped, and the punctuation Strong's is
    // not treated as a morpheme.
    const earth = rows[6];
    assert.equal(earth.wordText, "\u05d4\u05b8\u05d0\u05b8\u05bd\u05e8\u05b6\u05e5\u05c3");
    assert.equal(earth.rootStrong, "H0776G");
    assert.equal(earth.morphemes.length, 2);
    assert.ok(!earth.morphemes.some(morpheme => morpheme.strongNumber === "H9016"));
});

test("TAHOT parser ignores headers and verse lines", () => {
    assert.equal(parseTahotLine(""), null);
    assert.equal(parseTahotLine("# Gen.1.1"), null);
    assert.equal(parseTahotLine("#_Gen.1.1"), null);
});

test("TAGNT Philippians 3:8 parses into words; TR-only words are flagged", () => {
    const rows = dataLines("tagnt-php-3-8.txt").map(parseTagntLine);
    assert.equal(rows.length, 29);
    assert.ok(rows.every(Boolean));

    const first = rows[0];
    assert.equal(first.book, "Php");
    assert.equal(first.chapter, 3);
    assert.equal(first.verse, 8);
    assert.equal(first.wordIndex, 1);
    assert.equal(first.type, "NKO");
    assert.equal(first.wordText, nfc("ἀλλὰ"));
    assert.equal(first.transliteration, "alla");
    assert.equal(first.gloss, "But");
    assert.equal(first.strongNumber, "G0235");
    assert.equal(first.morphologyCode, "CONJ");
    assert.equal(first.lemma, nfc("ἀλλά"));
    assert.equal(first.inNA28, true);

    const knowledge = rows[11];
    assert.equal(knowledge.wordText, nfc("γνώσεως"));
    assert.equal(knowledge.transliteration, "gnōseōs");
    assert.equal(knowledge.strongNumber, "G1108");
    assert.equal(knowledge.morphologyCode, "N-GSF");
    assert.equal(knowledge.lemma, nfc("γνῶσις"));

    const christ = rows[12];
    assert.equal(christ.wordText, nfc("Χριστοῦ"));
    assert.equal(christ.strongNumber, "G5547");
    assert.equal(christ.morphologyCode, "N-GSM-T");

    // The Textus Receptus-only "εἶναι" (#26) is in TR+Byz only, so it
    // is not part of the NA28 text the importer keeps.
    const traditionalOnly = rows[25];
    assert.equal(traditionalOnly.wordIndex, 26);
    assert.equal(traditionalOnly.type, "k");
    assert.equal(traditionalOnly.inNA28, false);
    assert.equal(rows.filter(row => row.inNA28).length, 28);
});

test("TAGNT parser ignores headers and verse lines", () => {
    assert.equal(parseTagntLine(""), null);
    assert.equal(parseTagntLine("# Php.3.8"), null);
    assert.equal(parseTagntLine("#_Php.3.8"), null);
});

test("lexicon rows give the short gloss, never the fuller definition", () => {
    const tbesh = dataLines("tbesh-sample.txt").map(line => parseLexiconLine(line));
    const byStrong = new Map(tbesh.filter(Boolean).map(entry => [entry.strongNumber, entry]));
    const beginning = byStrong.get("H7225G");
    assert.equal(beginning.strongBase, "H7225");
    assert.equal(beginning.lemma, "רֵאשִׁית");
    assert.equal(beginning.transliteration, "re.shit");
    assert.equal(beginning.gloss, "first: beginning");
    assert.equal(beginning.lexicalMorphology, "H:N-F");
    assert.ok(!("definition" in beginning));

    // Two words share Strong's 1254; the lowercase sub-letter in the
    // lexicon's first column is dropped from the plain base number.
    const create = byStrong.get("H1254A");
    assert.equal(create.strongBase, "H1254");
    assert.equal(create.lemma, "בָּרָא");
    assert.equal(create.gloss, "to create");

    // Prefix entries carry a leading "/" on the lemma in the lexicon.
    assert.equal(byStrong.get("H9003").lemma, "ב");
    assert.equal(byStrong.get("H9003").gloss, "in/on/with");

    const tbesg = dataLines("tbesg-sample.txt").map(line => parseLexiconLine(line));
    const greek = new Map(tbesg.filter(Boolean).map(entry => [entry.strongNumber, entry]));
    assert.equal(greek.get("G1108").lemma, nfc("γνῶσις"));
    assert.equal(greek.get("G1108").gloss, "knowledge");
    assert.equal(greek.get("G5547").lemma, nfc("Χριστός"));
    assert.equal(greek.get("G5547").gloss, "Christ");

    assert.equal(parseLexiconLine("TBESH - Translators Brief lexicon"), null);
    assert.equal(parseLexiconLine(""), null);
});

test("morphology-code files load and expand the fixture codes", () => {
    const hebrew = parseMorphologyCodeFile(readFixture("tehmc-sample.txt"));
    assert.equal(hebrew.get("HNcfsa"), "Function=Noun ; Form=Common ; Gender=Feminine; Number=Singular; State=Absolute");
    assert.equal(hebrew.get("HR"), "Function=Preposition");
    assert.equal(hebrew.get("HVqp3ms").includes("Stem=Qal"), true);
    const greek = parseMorphologyCodeFile(readFixture("tegmc-sample.txt"));
    assert.equal(greek.get("N-GSF"), "Function=Noun; Case=Genitive; Number=Singular; Gender=Feminine");
    assert.equal(greek.get("V-PNI-1S").includes("Person=1st"), true);
});

test("grammar display joins morphemes with + and features with ·", () => {
    const hebrew = parseMorphologyCodeFile(readFixture("tehmc-sample.txt"));
    const greek = parseMorphologyCodeFile(readFixture("tegmc-sample.txt"));
    const first = parseTahotLine(dataLines("tahot-gen-1-1.txt")[0]);
    const firstMorphemes = first.morphemes.map((morpheme, index) => ({
        ...morpheme,
        expansion: hebrew.get(morphologyLookupKey(morpheme.morphologyCode, first.languageLetter, index === 0)),
    }));
    assert.equal(
        grammarDisplayForMorphemes(firstMorphemes),
        "Preposition + Noun · Common · Feminine · Singular · Absolute");
    const created = parseTahotLine(dataLines("tahot-gen-1-1.txt")[1]);
    const createdMorphemes = created.morphemes.map((morpheme, index) => ({
        ...morpheme,
        expansion: hebrew.get(morphologyLookupKey(morpheme.morphologyCode, created.languageLetter, index === 0)),
    }));
    assert.equal(
        grammarDisplayForMorphemes(createdMorphemes),
        "Verb · Qal · Simple · Active · Perfect · Past/present · Indicative · Third · Masculine · Singular");
    const knowledge = parseTagntLine(dataLines("tagnt-php-3-8.txt")[11]);
    const knowledgeMorphemes = knowledge.morphemes.map(morpheme => ({
        ...morpheme,
        expansion: greek.get(morpheme.morphologyCode),
    }));
    assert.equal(grammarDisplayForMorphemes(knowledgeMorphemes), "Noun · Genitive · Singular · Feminine");
});

test("lexical fallback derives lemma and gloss from the word row", () => {
    const word = parseTagntLine(dataLines("tagnt-php-3-8.txt")[11]);
    const derived = deriveLexicalEntry("G1108", { ...word, language: "greek" });
    assert.equal(derived.lemma, nfc("γνῶσις"));
    assert.equal(derived.gloss, "knowledge");
    assert.equal(derived.strongBase, "G1108");
    const hebrew = parseTahotLine(dataLines("tahot-gen-1-1.txt")[0]);
    const derivedHebrew = deriveLexicalEntry("H7225G", { ...hebrew, language: "hebrew" });
    assert.equal(derivedHebrew.lemma, "רֵאשִׁית");
    assert.equal(derivedHebrew.gloss, "beginning");
    assert.equal(derivedHebrew.strongBase, "H7225");
});
