const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    parseTahotLine, parseTagntLine, parseLexiconLine,
    parseMorphologyCodeFile, parseMorphologyExpansion,
    grammarDisplayForMorphemes, morphologyLookupKey, deriveLexicalEntry,
    wordLanguageForWord, importOriginalLanguage, FULL_SCOPE,
} = require("../../src/importer/importOriginalLanguage");
const { biblePool: pool } = require("../../src/db/db");

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

test("TAHOT parser accepts parenthetical alternate verse numbers", () => {
    // Gen.32.1(32.2): the main number is the English verse Gnosis
    // uses; the parenthetical is the Hebrew alternate numbering.
    const jacob = parseTahotLine("Gen.32.1(32.2)#01=L\tוְ/יַעֲקֹ֖ב\tve./ya.'a.Ko\tand/ Jacob\tH9002/{H3290}\tHC/Npm\t\t\tH3290\t\t\tH9002=ו=and/{H3290=יַעֲקֹב=Jacob»Israel@Gen.25.26-Rev}\t\t\t\t\t");
    assert.equal(jacob.book, "Gen");
    assert.equal(jacob.chapter, 32);
    assert.equal(jacob.verse, 1);
    assert.equal(jacob.altChapter, 32);
    assert.equal(jacob.altVerse, 2);
    assert.equal(jacob.wordIndex, 1);

    // Psalm titles are stored as verse 0 with the Hebrew numbering
    // in parentheses; the parser keeps the main (English) number.
    const title = parseTahotLine("Psa.3.0(3.1)#01=L\tמִזְמ֥וֹר\tmiz.Mor\ta psalm\t{H4210}\tHNcmsa\t\t\tH4210\t\t\t{H4210=מִזְמוֹר=melody}\t\t\t\t\t");
    assert.equal(title.book, "Psa");
    assert.equal(title.chapter, 3);
    assert.equal(title.verse, 0);
    assert.equal(title.altVerse, 1);
    assert.equal(title.gloss, "a psalm");

    // A plain ref has no alternate numbering.
    const plain = parseTahotLine(dataLines("tahot-gen-1-1.txt")[0]);
    assert.equal(plain.altChapter, null);
    assert.equal(plain.altVerse, null);
});

test("TAHOT parser normalizes Strong's markers and drops non-word slots", () => {
    // A trailing "+" on a Strong's number means the tag also covers
    // the next Hebrew word (Tubal-cain); it is not part of the
    // number, so the word keys to the H8423 lexicon entry.
    const tubal = parseTahotLine("Gen.4.22#06=L\tתּ֣וּבַל\tTu.val\tTubal-\t{H8423}+\tHNpm\t\t\tH8423_A\t\t\t{H8423=תּוּבַל־קַ֫יִן=Tubal-cain»Tubal-cain@Gen.4.22}+\t\t\t\t\t");
    assert.equal(tubal.rootStrong, "H8423");
    assert.ok(!tubal.morphemes.some(morpheme => morpheme.strongNumber.endsWith("+")));

    // A trailing space after a Strong's number is a source quirk.
    const outer = parseTahotLine("2Ki.16.18#10=L\tהַֽ/חִיצ֔וֹנָה\tha./chi.Tzo.nah\t<the>/ outer\tH9009/{H2435} \tHTd/Aafsa\t\t\tH2435\t\t\tH9009=ה=the/{H2435=חִיצוֹן=outer} \t\t\t\t\t");
    assert.equal(outer.rootStrong, "H2435");

    // A "//" word boundary inside a row (Gen 30:11 "בָּא גָד") is a
    // space in the display text, and the empty separator slot is not
    // a morpheme: the second word keeps its Strong's and grammar.
    const fortune = parseTahotLine("Gen.30.11#03=Q(K)\tבָּ֣א//גָ֑ד\tbe.//gad\tit has come//good fortune\t{H0935G}//{H1409}\tHVqp3ms//Ncmsa\tK= be./gad (בְּ/גָד) \"with/ good fortune\" (H9003/H1409=HR/Ncfsa)\tL= בָּ֣/גָ֑ד ¦ ;\tH0935G, H1409\t\t\t{H0935G=בּוֹא=: come»to come (in):1_come;_go_in}//{H1409=גָּד=fortune}\t\t\t\t\t");
    assert.equal(fortune.wordText, nfc("בָּ֣א גָ֑ד"));
    assert.equal(fortune.rootStrong, "H0935G");
    assert.equal(fortune.morphemes.length, 2);
    assert.equal(fortune.morphemes[1].strongNumber, "H1409");
    assert.equal(fortune.morphemes[1].morphologyCode, "Ncmsa");

    // A maqqef morpheme (H9014) is punctuation, not a word part:
    // it is dropped, and the mark stays in the word text.
    const what = parseTahotLine("Exo.4.2#04=Q(K)\tמַה/־/זֶּ֣ה\tmah/-/zeh-\twhat/ /[is] this?\t{H4100}/H9014/{H2088}\tHPi//Tm\tK= ma.//zeh (מַ//זֶּה) \"what// [is] this?\" ({H4100}//H2088=HPi//Tm)\tL= מַ//זֶּ֣ה ¦ ;\tH4100, H2088\t\t\t{H4100=מָה=what?}/H9014=־=link/{H2088=זֶה=this}\t\t\t\t\t");
    assert.equal(what.wordText, nfc("מַה־זֶּ֣ה"));
    assert.equal(what.rootStrong, "H4100");
    assert.equal(what.morphemes.length, 2);
    assert.ok(!what.morphemes.some(morpheme => morpheme.strongNumber === "H9014"));

    // A Qere omission: the Ketiv has a word but the followed Qere
    // reading omits it, so the row is not a word at all.
    assert.equal(parseTahotLine("Jdg.16.25#02=Q(K)\t\t[ ]\t[ ]\t\t\tK= ki (כִּי) \"for\" (H3588A=HR)\tL= כְּי ¦ ;\t\tH3588A\t\t\t\t\t\t\t"), null);
    // The same omission with a parenthetical alternate verse number
    // (1 Samuel 24:8 in Hebrew numbering is 24:9) is skipped too:
    // the empty-word check runs before the reference is parsed.
    assert.equal(parseTahotLine("1Sa.24.8(24.9)#06=Q(K)\t\t[ ]\t[ ]\t\t\tK= min- (מִן\\־) \"from\" (H4480A\\H9014=HR)\tL= מֵֽן\\־ ¦ ;\t\tH4480A\t\t\t\t\t\t\t"), null);
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

test("TAGNT parser accepts parenthetical alternate verse numbers", () => {
    // Mrk.12.15(12.14): the main number is the English verse Gnosis
    // uses; the parenthetical is the alternate numbering.
    const pay = parseTagntLine("Mrk.12.15(12.14)#01=NKO\tδῶμεν (dōmen)\tshall we pay\tG1325=V-2AAS-1P\tδίδωμι=to give\tNA28+NA27+Tyn+SBL+WH+Treg+TR+Byz\t\t\t¿Demos\tto give\t#01\tG1325_A\t\t\t\t\t");
    assert.equal(pay.book, "Mrk");
    assert.equal(pay.chapter, 12);
    assert.equal(pay.verse, 15);
    assert.equal(pay.altChapter, 12);
    assert.equal(pay.altVerse, 14);
    assert.equal(pay.wordText, nfc("δῶμεν"));
    assert.equal(pay.inNA28, true);

    // A plain ref has no alternate numbering.
    const plain = parseTagntLine(dataLines("tagnt-php-3-8.txt")[0]);
    assert.equal(plain.altChapter, null);
    assert.equal(plain.altVerse, null);
});

test("TAGNT parser splits compound words into per-component morphemes", () => {
    // Luk 13:11 "eighteen" (δεκαοκτὼ) is ten + eight: each component
    // gets its own morpheme with its own grammar code, so both codes
    // expand (a joined code like "A-NUI + G3638" has no expansion).
    const eighteen = parseTagntLine("Luk.13.11#09=N(k)O\tδεκαοκτὼ (dekaoktō)\teighteen\tG1176=A-NUI + G3638=A-NUI\tδέκα=ten + ὀκτώ=eight\tNA28+NA27+Tyn+SBL\tδέκα καὶ ὀκτὼ (t=deka kai oktō) eighteen - G1176=A-NUI + G2532=CONJ + G3638=A-NUI in: WH+Treg+TR+Byz\t\tdiez y ocho\tten + eight\t#09\tG3638, G1176\tG2532\t\t\t\t");
    assert.equal(eighteen.wordText, nfc("δεκαοκτὼ"));
    assert.equal(eighteen.gloss, "eighteen");
    assert.equal(eighteen.rootStrong, "G1176");
    assert.equal(eighteen.strongNumber, "G1176");
    assert.equal(eighteen.morphologyCode, "A-NUI");
    assert.equal(eighteen.lemma, nfc("δέκα"));
    assert.equal(eighteen.lemmaGloss, "ten");
    assert.equal(eighteen.inNA28, true);
    assert.equal(eighteen.morphemes.length, 2);
    assert.equal(eighteen.morphemes[0].strongNumber, "G1176");
    assert.equal(eighteen.morphemes[0].morphologyCode, "A-NUI");
    assert.equal(eighteen.morphemes[0].isRoot, true);
    assert.equal(eighteen.morphemes[1].strongNumber, "G3638");
    assert.equal(eighteen.morphemes[1].morphologyCode, "A-NUI");
    assert.equal(eighteen.morphemes[1].gloss, "eight");
    assert.equal(eighteen.morphemes[1].isRoot, false);
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

test("Aramaic ranges are word-level: Daniel 2:4 switches mid-verse", () => {
    const tahot = { source: "tahot", language: "hebrew" };
    const daniel = { ...tahot, name: "Daniel" };
    const word = (chapter, verse, wordIndex) => ({ chapter, verse, wordIndex });
    // Daniel 2:4 words 1–4 are Hebrew (the narrative), words 5–12
    // Aramaic (the quoted speech) — verified against the STEPBible
    // rows: word 4 is אֲרָמִית "Aramaic" (H-code), word 5 מַלְכָּ
    // "O king" (A-code).
    assert.equal(wordLanguageForWord(daniel, word(2, 4, 1)), "hebrew");
    assert.equal(wordLanguageForWord(daniel, word(2, 4, 4)), "hebrew");
    assert.equal(wordLanguageForWord(daniel, word(2, 4, 5)), "aramaic");
    assert.equal(wordLanguageForWord(daniel, word(2, 4, 12)), "aramaic");
    // The verse before the switch and the chapter after the range.
    assert.equal(wordLanguageForWord(daniel, word(2, 3, 1)), "hebrew");
    assert.equal(wordLanguageForWord(daniel, word(7, 28, 1)), "aramaic");
    assert.equal(wordLanguageForWord(daniel, word(8, 1, 1)), "hebrew");
    // Whole-passage ranges: Ezra, Jeremiah, Genesis 31:47.
    const ezra = { ...tahot, name: "Ezra" };
    assert.equal(wordLanguageForWord(ezra, word(4, 7, 1)), "hebrew");
    assert.equal(wordLanguageForWord(ezra, word(4, 8, 1)), "aramaic");
    assert.equal(wordLanguageForWord(ezra, word(6, 18, 1)), "aramaic");
    assert.equal(wordLanguageForWord(ezra, word(6, 19, 1)), "hebrew");
    assert.equal(wordLanguageForWord(ezra, word(7, 12, 1)), "aramaic");
    assert.equal(wordLanguageForWord(ezra, word(7, 26, 1)), "aramaic");
    assert.equal(wordLanguageForWord(ezra, word(7, 27, 1)), "hebrew");
    const jeremiah = { ...tahot, name: "Jeremiah" };
    assert.equal(wordLanguageForWord(jeremiah, word(10, 10, 1)), "hebrew");
    assert.equal(wordLanguageForWord(jeremiah, word(10, 11, 1)), "aramaic");
    assert.equal(wordLanguageForWord(jeremiah, word(10, 12, 1)), "hebrew");
    const genesis = { ...tahot, name: "Genesis" };
    assert.equal(wordLanguageForWord(genesis, word(31, 46, 1)), "hebrew");
    assert.equal(wordLanguageForWord(genesis, word(31, 47, 1)), "aramaic");
    assert.equal(wordLanguageForWord(genesis, word(31, 48, 1)), "hebrew");
    // Greek passages never switch.
    assert.equal(wordLanguageForWord(
        { source: "tagnt", language: "greek", name: "Philippians" },
        word(3, 8, 1)), "greek");
});

test("downloadStepBibleFiles concatenates the TAHOT/TAGNT parts and skips present single files", async () => {
    const { downloadStepBibleFiles } = require("../../src/importer/importOriginalLanguage");
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ol-download-test-"));
    try {
        const fetched = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            fetched.push(url);
            // Multi-part files: the first part has no trailing newline,
            // the second carries a BOM — both are normalized on join.
            let text = "single\n";
            // URLs are encodeURI'd, so match the distinctive part names.
            if (String(url).includes("Gen-Deu")) text = "Gen-Deu part";
            else if (String(url).includes("Jos-Est")) text = "\uFEFFJos-Est part\n";
            else if (String(url).includes("Job-Sng")) text = "Job-Sng part\n";
            else if (String(url).includes("Isa-Mal")) text = "Isa-Mal part\n";
            else if (String(url).includes("Mat-Jhn")) text = "Mat-Jhn part";
            else if (String(url).includes("Act-Rev")) text = "\uFEFFAct-Rev part\n";
            return { ok: true, arrayBuffer: async () => Buffer.from(text, "utf8") };
        };
        try {
            await downloadStepBibleFiles(dataDir);
        } finally {
            globalThis.fetch = realFetch;
        }
        assert.equal(
            fs.readFileSync(path.join(dataDir, "tahot.txt"), "utf8"),
            "Gen-Deu part\nJos-Est part\nJob-Sng part\nIsa-Mal part\n");
        assert.equal(
            fs.readFileSync(path.join(dataDir, "tagnt.txt"), "utf8"),
            "Mat-Jhn part\nAct-Rev part\n");
        assert.equal(fs.readFileSync(path.join(dataDir, "tbesh.txt"), "utf8"), "single\n");
        // A second run skips the single files but rebuilds the
        // multi-part files, so a stale partial download never passes
        // as complete.
        const before = fetched.length;
        globalThis.fetch = async (url) => {
            fetched.push(url);
            return { ok: true, arrayBuffer: async () => Buffer.from("again\n", "utf8") };
        };
        try {
            await downloadStepBibleFiles(dataDir);
        } finally {
            globalThis.fetch = realFetch;
        }
        assert.equal(fetched.length - before, 6); // 4 TAHOT + 2 TAGNT parts
        assert.equal(
            fs.readFileSync(path.join(dataDir, "tahot.txt"), "utf8"),
            "again\nagain\nagain\nagain\n");
        assert.equal(fs.readFileSync(path.join(dataDir, "tbesh.txt"), "utf8"), "single\n");
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
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
    // A tag gloss carrying a STEPBible first-occurrence reference
    // ("Rimmon@Jos.15.32") derives the plain gloss "Rimmon" — the
    // "@" marker is a cross-reference, not part of the meaning.
    const rimmon = parseTahotLine("Jos.15.32#04=L\tוְ/רִמּ֑וֹן\tve./ri.Mon\tand/ Rimmon\tH9002/{H7417I}\tHC/Npl\t\t\tH7417I\t\t\tH9002=ו=and/{H7417I=רִמּוֹן, רִמּוֹנוֹ=Rimmon@Jos.15.32}\t\t\t\t");
    const derivedRimmon = deriveLexicalEntry("H7417I", { ...rimmon, language: "hebrew" });
    assert.equal(derivedRimmon.lemma, "רִמּוֹן, רִמּוֹנוֹ");
    assert.equal(derivedRimmon.gloss, "Rimmon");
    assert.equal(derivedRimmon.strongBase, "H7417");
});

test("FULL_SCOPE covers all 66 books and 1,189 chapters with Gnosis names", () => {
    const books = require("../../src/data/bible_books.json");
    const names = new Set(books.map(book => book.name));
    assert.equal(FULL_SCOPE.length, 66);
    assert.equal(FULL_SCOPE.reduce((total, passage) => total + passage.chapters.length, 0), 1189);
    assert.equal(new Set(FULL_SCOPE.map(passage => passage.name)).size, 66);
    assert.equal(new Set(FULL_SCOPE.map(passage => passage.book)).size, 66);
    for (const passage of FULL_SCOPE) {
        assert.ok(names.has(passage.name), passage.name);
        assert.ok(["tahot", "tagnt"].includes(passage.source), passage.book);
        assert.ok(["hebrew", "greek"].includes(passage.language), passage.book);
        // Chapters are exactly 1..N with no gaps.
        assert.deepEqual(passage.chapters,
            Array.from({ length: passage.chapters.length }, (_, index) => index + 1));
    }
    // Spot-checks against the measured STEPBible maxima: the
    // abbreviations differ from Gnosis's in several places.
    const byName = new Map(FULL_SCOPE.map(passage => [passage.name, passage]));
    assert.equal(byName.get("Psalms").book, "Psa");
    assert.equal(byName.get("Psalms").chapters.length, 150);
    assert.equal(byName.get("Ezekiel").book, "Ezk");
    assert.equal(byName.get("Joel").book, "Jol");
    assert.equal(byName.get("Nahum").book, "Nam");
    assert.equal(byName.get("Mark").book, "Mrk");
    assert.equal(byName.get("John").book, "Jhn");
    assert.equal(byName.get("Song of Solomon").book, "Sng");
    assert.equal(byName.get("Obadiah").chapters.length, 1);
});

// Full-import loop against a mocked pool, using the real fixture
// files as the data dir: Genesis 1, Daniel 2, Psalms 3 (title + verse
// 1) and Philippians 3. The mock simulates a fresh database on the
// first run (each new key inserts) and an already-imported one on the
// second (every upsert conflicts and inserts nothing).
const insertedLexical = new Set();
const insertedMorphology = new Set();
const wordUpserts = [];
const queryMock = test.mock.method(pool, "query", async (sql, params = []) => {
    if (typeof sql === "string" && sql.includes("FROM ol_sources")) {
        return { rows: ["STEPBible-TAHOT", "STEPBible-TAGNT", "STEPBible-TBESH",
            "STEPBible-TBESG", "STEPBible-TEHMC", "STEPBible-TEGMC"]
            .map((code, index) => ({ id: index + 1, code })) };
    }
    if (typeof sql === "string" && sql.includes("FROM bible_books")) {
        return { rows: [
            { id: 1, name: "Genesis" }, { id: 28, name: "Daniel" },
            { id: 20, name: "Psalms" }, { id: 50, name: "Philippians" },
            { id: 4, name: "Numbers" },
        ] };
    }
    if (typeof sql === "string" && sql.includes("INTO ol_lexical_entries")) {
        if (insertedLexical.has(params[0])) return { rows: [] };
        insertedLexical.add(params[0]);
        return { rows: [{ id: insertedLexical.size }] };
    }
    if (typeof sql === "string" && sql.includes("INTO ol_morphology_codes")) {
        const key = `${params[1]}:${params[0]}`;
        if (insertedMorphology.has(key)) return { rows: [] };
        insertedMorphology.add(key);
        return { rows: [{ id: insertedMorphology.size }] };
    }
    if (typeof sql === "string" && sql.includes("INTO ol_word_occurrences")) {
        wordUpserts.push({ sql, params });
        return { rows: [] };
    }
    throw new Error(`Unexpected query in importer test: ${sql}`);
});

test.after(async () => {
    queryMock.mock.restore();
    await pool.end();
});

test("importOriginalLanguage imports the scoped chapters and is idempotent", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ol-import-test-"));
    try {
        fs.writeFileSync(path.join(dataDir, "tahot.txt"),
            ["tahot-gen-1-1.txt", "tahot-dan-2-4.txt", "tahot-psa-3-0.txt", "tahot-psa-3-1.txt"]
                .map(name => readFixture(name)).join("\n"));
        fs.writeFileSync(path.join(dataDir, "tagnt.txt"), readFixture("tagnt-php-3-8.txt"));
        fs.writeFileSync(path.join(dataDir, "tbesh.txt"), readFixture("tbesh-sample.txt"));
        fs.writeFileSync(path.join(dataDir, "tbesg.txt"), readFixture("tbesg-sample.txt"));
        fs.writeFileSync(path.join(dataDir, "tehmc.txt"), readFixture("tehmc-sample.txt"));
        fs.writeFileSync(path.join(dataDir, "tegmc.txt"), readFixture("tegmc-sample.txt"));
        const scope = [
            { book: "Gen", name: "Genesis", chapters: [1], source: "tahot", language: "hebrew" },
            { book: "Dan", name: "Daniel", chapters: [2], source: "tahot", language: "hebrew" },
            { book: "Psa", name: "Psalms", chapters: [3], source: "tahot", language: "hebrew" },
            { book: "Php", name: "Philippians", chapters: [3], source: "tagnt", language: "greek" },
        ];

        const first = await importOriginalLanguage({ dataDir, scope });
        // 7 (Gen 1:1) + 12 (Dan 2:4) + 6 (Psa 3:0) + 7 (Psa 3:1) + 28
        // (Php 3:8 in NA28; the TR-only word is excluded).
        assert.equal(first.words, 60);
        assert.equal(first.aramaicWords, 8);
        assert.equal(first.altRefRows, 13);
        assert.ok(first.lexicalEntries > 0);
        assert.ok(first.morphologyCodes > 0);
        assert.equal(wordUpserts.length, 60);
        assert.ok(wordUpserts.every(upsert => upsert.sql.includes("ON CONFLICT")));

        const wordKey = upsert => upsert.params.slice(1, 5).join(":");
        const byKey = new Map(wordUpserts.map(upsert => [wordKey(upsert), upsert]));
        // Daniel 2:4 switches mid-verse: words 1–4 Hebrew, 5–12 Aramaic.
        assert.equal(byKey.get("28:2:4:4").params[5], "hebrew");
        assert.equal(byKey.get("28:2:4:5").params[5], "aramaic");
        assert.equal(byKey.get("28:2:4:12").params[5], "aramaic");
        // Psalm titles are stored at verse 0, never merged into verse 1.
        assert.equal([...byKey.values()].filter(upsert => upsert.params[3] === 0).length, 6);
        // The TR-only Philippians word (#26) is not imported.
        assert.ok(![...byKey.keys()].some(key => key === "50:3:8:26"));
        // The sample lexicons/morphology files do not cover everything,
        // so warnings exist — but only of the two known kinds.
        assert.ok(first.warnings.length > 0);
        assert.ok(first.warnings.every(message =>
            /No lexicon row|No (hebrew|greek) morphology expansion/.test(message)));

        const keysBefore = wordUpserts.map(wordKey);
        const second = await importOriginalLanguage({ dataDir, scope });
        // Same words re-upserted onto the same keys (no duplicates by
        // construction), but nothing new inserted.
        assert.equal(second.words, 60);
        assert.equal(second.lexicalEntries, 0);
        assert.equal(second.morphologyCodes, 0);
        assert.equal(wordUpserts.length, 120);
        assert.deepEqual(wordUpserts.slice(60).map(wordKey), keysBefore);
        assert.ok(second.warnings.every(message =>
            /No lexicon row|No (hebrew|greek) morphology expansion/.test(message)));
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test("importOriginalLanguage renumbers verses spanning a Hebrew/English verse-boundary shift", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ol-import-merge-"));
    try {
        fs.writeFileSync(path.join(dataDir, "tahot.txt"), readFixture("tahot-num-26-1.txt"));
        fs.writeFileSync(path.join(dataDir, "tagnt.txt"), "");
        fs.writeFileSync(path.join(dataDir, "tbesh.txt"), readFixture("tbesh-sample.txt"));
        fs.writeFileSync(path.join(dataDir, "tbesg.txt"), readFixture("tbesg-sample.txt"));
        fs.writeFileSync(path.join(dataDir, "tehmc.txt"), readFixture("tehmc-sample.txt"));
        fs.writeFileSync(path.join(dataDir, "tegmc.txt"), readFixture("tegmc-sample.txt"));
        const scope = [
            { book: "Num", name: "Numbers", chapters: [26], source: "tahot", language: "hebrew" },
        ];

        const result = await importOriginalLanguage({ dataDir, scope });
        // Numbers 26:1 is 13 words in English: the tail of Hebrew
        // 25:19 ("after the plague", 3 words) plus Hebrew 26:1
        // ("the LORD said to Moses…", 10 words). Both groups share
        // the English verse number, so the source word index restarts
        // at 1 for the second group.
        assert.equal(result.words, 13);
        assert.deepEqual([...result.mergedVerses], ["Numbers 26:1"]);
        const numUpserts = wordUpserts.filter(upsert =>
            upsert.params[1] === 4 && upsert.params[2] === 26 && upsert.params[3] === 1);
        assert.equal(numUpserts.length, 13);
        // Stored word indices run 1–13 in file order — the second
        // group continues where the first left off instead of
        // overwriting it on the (book, chapter, verse, word_index)
        // key, which would silently drop real text.
        assert.deepEqual(numUpserts.map(upsert => upsert.params[4]),
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
        assert.equal(numUpserts[0].params[6], nfc("וַיְהִ֖י"));
        assert.equal(numUpserts[3].params[6], nfc("וַיֹּ֤אמֶר"));
        assert.equal(numUpserts[11].params[6], nfc("הַכֹּהֵ֖ן"));
        assert.equal(numUpserts[12].params[6], nfc("לֵאמֹֽר׃"));
    } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
