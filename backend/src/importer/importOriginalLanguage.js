// Original Language Analysis — STEPBible importer (Phase 2).
//
// Imports word-level Hebrew, Aramaic and Greek data from
// STEPBible-Data (Tyndale House / STEPBible.org), CC BY 4.0, into
// the ol_* tables created by migration
// 20261106234443_add-original-language-analysis.
//
// Data files are NOT committed to this repo: the STEPBible licence
// header asks that copies of the data files not be posted elsewhere,
// so the importer downloads them from the canonical STEPBible GitHub
// repository into a local data directory (default
// backend/src/importer/original-language-data/, gitignored) or reads
// files already present there.
//
//   node importOriginalLanguage.js [--data-dir <dir>] [--download] [--full]
//
//   --download   fetch the STEPBible files into the data dir first
//                (the four TAHOT parts and two TAGNT parts are
//                concatenated into tahot.txt / tagnt.txt)
//   --data-dir   directory holding the six files (default as above)
//   --full       import the full 66-book canon (default scope is the
//                Phase 1 demo: Genesis 1 and Philippians 3)
//
// The import is idempotent: lexical entries, morphology codes and word
// occurrences are upserted on their natural keys, so re-running it
// refreshes the data without duplicating rows. See
// docs/OriginalLanguage.md for the operator steps.
//
// Only the short dictionary gloss is imported from the TBESH/TBESG
// lexicons. Their fuller BDB/Abbott-Smith definition paragraphs carry
// a note asking for Online Bible permission before use in a project,
// so they are deliberately left out.
const fs = require("fs");
const path = require("path");


const STEPBIBLE_BASE = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master";
// TAHOT and TAGNT each ship as several part files; the downloader
// concatenates the parts into one tahot.txt / tagnt.txt. The other
// four files are single files. (The TAHOT parts use "CC BY" with a
// space in the real filenames; the old single-part URL used "CC-BY"
// and would 404 on a fresh download.)
const STEPBIBLE_FILES = {
    tahot: [
        "Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
        "Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
        "Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
        "Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    ],
    tagnt: [
        "Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
        "Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
    ],
    tbesh: "Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt",
    tbesg: "Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt",
    tehmc: "Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt",
    tegmc: "Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt",
};

// Phase 1 scope: STEPBible book abbreviation -> Gnosis book name.
// The full-Bible map (all 66 books) is Phase 2 work: STEPBible uses
// its own 3-letter codes (e.g. Php, not Gnosis's Phil; Psa, 1Sa...).
const PHASE_1_SCOPE = [
    { book: "Gen", name: "Genesis", chapters: [1], source: "tahot", language: "hebrew" },
    { book: "Php", name: "Philippians", chapters: [3], source: "tagnt", language: "greek" },
];

// Full-Bible scope (Phase 2): all 66 books, 1,189 chapters. Chapter
// counts are the STEPBible files' own maxima, measured from the
// checked-out files (see docs/OriginalLanguagePhase2Data.md §2);
// the dry-run validation re-checks every chapter's verse count
// against Gnosis after import. STEPBible abbreviations differ from
// Gnosis's in several places (Ezk, Jol, Nam, Mrk, Jhn, Sng, Ezr...),
// so the map is explicit, never derived by string rules.
const chaptersUpTo = count => Array.from({ length: count }, (_, index) => index + 1);
const FULL_SCOPE = [
    { book: "Gen", name: "Genesis", chapters: chaptersUpTo(50), source: "tahot", language: "hebrew" },
    { book: "Exo", name: "Exodus", chapters: chaptersUpTo(40), source: "tahot", language: "hebrew" },
    { book: "Lev", name: "Leviticus", chapters: chaptersUpTo(27), source: "tahot", language: "hebrew" },
    { book: "Num", name: "Numbers", chapters: chaptersUpTo(36), source: "tahot", language: "hebrew" },
    { book: "Deu", name: "Deuteronomy", chapters: chaptersUpTo(34), source: "tahot", language: "hebrew" },
    { book: "Jos", name: "Joshua", chapters: chaptersUpTo(24), source: "tahot", language: "hebrew" },
    { book: "Jdg", name: "Judges", chapters: chaptersUpTo(21), source: "tahot", language: "hebrew" },
    { book: "Rut", name: "Ruth", chapters: chaptersUpTo(4), source: "tahot", language: "hebrew" },
    { book: "1Sa", name: "1 Samuel", chapters: chaptersUpTo(31), source: "tahot", language: "hebrew" },
    { book: "2Sa", name: "2 Samuel", chapters: chaptersUpTo(24), source: "tahot", language: "hebrew" },
    { book: "1Ki", name: "1 Kings", chapters: chaptersUpTo(22), source: "tahot", language: "hebrew" },
    { book: "2Ki", name: "2 Kings", chapters: chaptersUpTo(25), source: "tahot", language: "hebrew" },
    { book: "1Ch", name: "1 Chronicles", chapters: chaptersUpTo(29), source: "tahot", language: "hebrew" },
    { book: "2Ch", name: "2 Chronicles", chapters: chaptersUpTo(36), source: "tahot", language: "hebrew" },
    { book: "Ezr", name: "Ezra", chapters: chaptersUpTo(10), source: "tahot", language: "hebrew" },
    { book: "Neh", name: "Nehemiah", chapters: chaptersUpTo(13), source: "tahot", language: "hebrew" },
    { book: "Est", name: "Esther", chapters: chaptersUpTo(10), source: "tahot", language: "hebrew" },
    { book: "Job", name: "Job", chapters: chaptersUpTo(42), source: "tahot", language: "hebrew" },
    { book: "Psa", name: "Psalms", chapters: chaptersUpTo(150), source: "tahot", language: "hebrew" },
    { book: "Pro", name: "Proverbs", chapters: chaptersUpTo(31), source: "tahot", language: "hebrew" },
    { book: "Ecc", name: "Ecclesiastes", chapters: chaptersUpTo(12), source: "tahot", language: "hebrew" },
    { book: "Sng", name: "Song of Solomon", chapters: chaptersUpTo(8), source: "tahot", language: "hebrew" },
    { book: "Isa", name: "Isaiah", chapters: chaptersUpTo(66), source: "tahot", language: "hebrew" },
    { book: "Jer", name: "Jeremiah", chapters: chaptersUpTo(52), source: "tahot", language: "hebrew" },
    { book: "Lam", name: "Lamentations", chapters: chaptersUpTo(5), source: "tahot", language: "hebrew" },
    { book: "Ezk", name: "Ezekiel", chapters: chaptersUpTo(48), source: "tahot", language: "hebrew" },
    { book: "Dan", name: "Daniel", chapters: chaptersUpTo(12), source: "tahot", language: "hebrew" },
    { book: "Hos", name: "Hosea", chapters: chaptersUpTo(14), source: "tahot", language: "hebrew" },
    { book: "Jol", name: "Joel", chapters: chaptersUpTo(3), source: "tahot", language: "hebrew" },
    { book: "Amo", name: "Amos", chapters: chaptersUpTo(9), source: "tahot", language: "hebrew" },
    { book: "Oba", name: "Obadiah", chapters: chaptersUpTo(1), source: "tahot", language: "hebrew" },
    { book: "Jon", name: "Jonah", chapters: chaptersUpTo(4), source: "tahot", language: "hebrew" },
    { book: "Mic", name: "Micah", chapters: chaptersUpTo(7), source: "tahot", language: "hebrew" },
    { book: "Nam", name: "Nahum", chapters: chaptersUpTo(3), source: "tahot", language: "hebrew" },
    { book: "Hab", name: "Habakkuk", chapters: chaptersUpTo(3), source: "tahot", language: "hebrew" },
    { book: "Zep", name: "Zephaniah", chapters: chaptersUpTo(3), source: "tahot", language: "hebrew" },
    { book: "Hag", name: "Haggai", chapters: chaptersUpTo(2), source: "tahot", language: "hebrew" },
    { book: "Zec", name: "Zechariah", chapters: chaptersUpTo(14), source: "tahot", language: "hebrew" },
    { book: "Mal", name: "Malachi", chapters: chaptersUpTo(4), source: "tahot", language: "hebrew" },
    { book: "Mat", name: "Matthew", chapters: chaptersUpTo(28), source: "tagnt", language: "greek" },
    { book: "Mrk", name: "Mark", chapters: chaptersUpTo(16), source: "tagnt", language: "greek" },
    { book: "Luk", name: "Luke", chapters: chaptersUpTo(24), source: "tagnt", language: "greek" },
    { book: "Jhn", name: "John", chapters: chaptersUpTo(21), source: "tagnt", language: "greek" },
    { book: "Act", name: "Acts", chapters: chaptersUpTo(28), source: "tagnt", language: "greek" },
    { book: "Rom", name: "Romans", chapters: chaptersUpTo(16), source: "tagnt", language: "greek" },
    { book: "1Co", name: "1 Corinthians", chapters: chaptersUpTo(16), source: "tagnt", language: "greek" },
    { book: "2Co", name: "2 Corinthians", chapters: chaptersUpTo(13), source: "tagnt", language: "greek" },
    { book: "Gal", name: "Galatians", chapters: chaptersUpTo(6), source: "tagnt", language: "greek" },
    { book: "Eph", name: "Ephesians", chapters: chaptersUpTo(6), source: "tagnt", language: "greek" },
    { book: "Php", name: "Philippians", chapters: chaptersUpTo(4), source: "tagnt", language: "greek" },
    { book: "Col", name: "Colossians", chapters: chaptersUpTo(4), source: "tagnt", language: "greek" },
    { book: "1Th", name: "1 Thessalonians", chapters: chaptersUpTo(5), source: "tagnt", language: "greek" },
    { book: "2Th", name: "2 Thessalonians", chapters: chaptersUpTo(3), source: "tagnt", language: "greek" },
    { book: "1Ti", name: "1 Timothy", chapters: chaptersUpTo(6), source: "tagnt", language: "greek" },
    { book: "2Ti", name: "2 Timothy", chapters: chaptersUpTo(4), source: "tagnt", language: "greek" },
    { book: "Tit", name: "Titus", chapters: chaptersUpTo(3), source: "tagnt", language: "greek" },
    { book: "Phm", name: "Philemon", chapters: chaptersUpTo(1), source: "tagnt", language: "greek" },
    { book: "Heb", name: "Hebrews", chapters: chaptersUpTo(13), source: "tagnt", language: "greek" },
    { book: "Jas", name: "James", chapters: chaptersUpTo(5), source: "tagnt", language: "greek" },
    { book: "1Pe", name: "1 Peter", chapters: chaptersUpTo(5), source: "tagnt", language: "greek" },
    { book: "2Pe", name: "2 Peter", chapters: chaptersUpTo(3), source: "tagnt", language: "greek" },
    { book: "1Jn", name: "1 John", chapters: chaptersUpTo(5), source: "tagnt", language: "greek" },
    { book: "2Jn", name: "2 John", chapters: chaptersUpTo(1), source: "tagnt", language: "greek" },
    { book: "3Jn", name: "3 John", chapters: chaptersUpTo(1), source: "tagnt", language: "greek" },
    { book: "Jud", name: "Jude", chapters: chaptersUpTo(1), source: "tagnt", language: "greek" },
    { book: "Rev", name: "Revelation", chapters: chaptersUpTo(22), source: "tagnt", language: "greek" },
];

// Aramaic passages in the Hebrew Bible (word-level, not per-verse).
// Ranges are inclusive of whole verses, except the start of Daniel
// 2:4, where the language switches mid-verse: words 1–4 are Hebrew
// (the narrative "the Chaldeans spoke to the king in Aramaic") and
// words 5–12 are Aramaic (the quoted speech). See
// docs/OriginalLanguagePhase2Data.md §4. A word is Aramaic only when
// it falls inside a range — an entire mixed verse is never classified
// as one language.
const ARAMAIC_RANGES = [
    { book: "Daniel", startChapter: 2, startVerse: 4, startWordIndex: 5, endChapter: 7, endVerse: 28 },
    { book: "Ezra", startChapter: 4, startVerse: 8, endChapter: 6, endVerse: 18 },
    { book: "Ezra", startChapter: 7, startVerse: 12, endChapter: 7, endVerse: 26 },
    { book: "Jeremiah", startChapter: 10, startVerse: 11, endChapter: 10, endVerse: 11 },
    { book: "Genesis", startChapter: 31, startVerse: 47, endChapter: 31, endVerse: 47 },
];

function wordLanguageForWord(passage, word) {
    if (passage.source !== "tahot") return passage.language;
    for (const range of ARAMAIC_RANGES) {
        if (range.book !== passage.name) continue;
        const afterStart =
            word.chapter > range.startChapter ||
            (word.chapter === range.startChapter && word.verse > range.startVerse) ||
            (word.chapter === range.startChapter && word.verse === range.startVerse &&
                word.wordIndex >= (range.startWordIndex || 1));
        const beforeEnd =
            word.chapter < range.endChapter ||
            (word.chapter === range.endChapter && word.verse <= range.endVerse);
        if (afterStart && beforeEnd) return "aramaic";
    }
    return passage.language;
}

const SOURCE_CODES = {
    tahot: "STEPBible-TAHOT",
    tagnt: "STEPBible-TAGNT",
    tbesh: "STEPBible-TBESH",
    tbesg: "STEPBible-TBESG",
    tehmc: "STEPBible-TEHMC",
    tegmc: "STEPBible-TEGMC",
};

// Split on a separator that is not inside parentheses, e.g. the
// semicolons in "Stem=Qal (hence Action=Simple; Voice=Active)".
function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const char of text) {
        if (char === "(") depth += 1;
        if (char === ")") depth = Math.max(0, depth - 1);
        if (char === separator && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

// Flatten one TEHMC/TEGMC expansion into display tokens, e.g.
//   "Function=Noun; Case=Genitive; Number=Singular; Gender=Feminine"
//   -> ["Noun", "Genitive", "Singular", "Feminine"]
//   "Function=Verb; Stem=Qal (hence Action=Simple; Voice=Active);
//    Form=Perfect (hence Tense=Past/present; Mood=Indicative);
//    Person=Third; Gender=Masculine; Number=Singular"
//   -> ["Verb", "Qal", "Simple", "Active", "Perfect", "Past/present",
//       "Indicative", "Third", "Masculine", "Singular"]
// The "hence" clauses are Tyndale House's own explanation of what a
// stem/form implies; flattening keeps their meaning while the verbatim
// expansion stays in ol_morphology_codes for the detail view.
function parseMorphologyExpansion(expansion) {
    const tokens = [];
    for (const segment of splitTopLevel(expansion, ";")) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const equals = trimmed.indexOf("=");
        if (equals === -1) {
            tokens.push(trimmed);
            continue;
        }
        const value = trimmed.slice(equals + 1).trim();
        const hence = value.indexOf(" (hence ");
        if (hence === -1) {
            tokens.push(value);
            continue;
        }
        tokens.push(value.slice(0, hence).trim());
        const inner = value.slice(hence + " (hence ".length, value.lastIndexOf(")"));
        for (const pair of splitTopLevel(inner, ";")) {
            const pairEquals = pair.trim().indexOf("=");
            tokens.push(pairEquals === -1 ? pair.trim() : pair.trim().slice(pairEquals + 1).trim());
        }
    }
    return tokens.filter(token => token.length > 0);
}

// Expanded grammar display for one word: each morpheme's tokens
// joined with " · ", morphemes joined with " + ", e.g.
//   "Preposition + Noun · Common · Feminine · Singular · Absolute"
//   "Noun · Genitive · Singular · Feminine"
function grammarDisplayForMorphemes(morphemes) {
    return morphemes
        .map(morpheme => parseMorphologyExpansion(morpheme.expansion).join(" · "))
        .join(" + ");
}

// Parse one TAHOT (Hebrew) word row. Returns null for header, verse
// and blank lines. Columns (tab-separated):
//   1 ref "Gen.1.1#01=L" (ref + word index + text type)
//   2 word, "/" separates prefix/root/suffix morphemes
//   3 transliteration, "/" separated the same way
//   4 gloss, "/" separated the same way
//   5 dStrongs, "/" separated; the root is wrapped in {}
//   6 morphology codes, "/" separated per morpheme
//   7 variant info (usually empty)
//   8 (unused here)
//   9 sStrong+Instance of the root
//   10 (unused here)
//   11 (unused here)
//   12 expanded tags "H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}"
function parseTahotLine(line) {
    if (!line || line.startsWith("#")) return null;
    // Hebrew combining marks arrive in different orders in different
    // STEPBible columns (the expanded-tag lemma puts the shin dot
    // before the vowel point, the lexicon puts it after), and Greek
    // uses legacy oxia characters (U+1F79) alongside tonos (U+03CC).
    // NFC makes the same word compare equal wherever it came from.
    const cols = line.normalize("NFC").split("\t");
    if (cols.length < 6) return null;
    // A row with no word text is a Qere omission: the Ketiv has a
    // word (in the variant columns) but the followed Qere reading
    // omits it, so there is no word to analyse or display.
    if (!cols[1] || !cols[1].trim()) return null;
    // Some refs carry a parenthetical alternate numbering, e.g.
    // Gen.32.1(32.2) or Psa.3.0(3.1): the main number is the English
    // (NRSV) verse Gnosis uses; the parenthetical is the alternate
    // (Hebrew) numbering. The importer stores the main number and
    // keeps the alternate only for reporting (counts.altRefRows).
    const refMatch = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=([A-Za-z]*)/.exec(cols[0]);
    if (!refMatch) return null;
    const [, book, chapter, verse, altChapter, altVerse, wordIndex, type] = refMatch;
    // "\" marks maqqef (־) and sof pasuq (׃) punctuation: it is a
    // STEPBible marker, not part of the word, so it is stripped from
    // the display text (the punctuation character itself is kept).
    // In the dStrongs and expanded-tags columns the same "\" separates
    // a trailing punctuation Strong's (H9014 maqqef, H9016 sof pasuq),
    // which is not a morpheme of the word and is dropped here; the
    // mark stays visible in wordText. A trailing "+" on a Strong's
    // number (e.g. {H8423}+) means the tag also covers the next
    // Hebrew word (compound names like Tubal-cain); it is not part
    // of the number. A trailing space (e.g. {H2435} ) is a source
    // quirk. Both are stripped so the number matches its lexicon key.
    const stripMarker = part => part.split("\\")[0].trim().replace(/\+$/, "");
    const wordParts = cols[1].split("/").map(part => part.replace(/\\/g, ""));
    const translitParts = cols[2].split("/");
    const glossParts = cols[3].split("/");
    const strongParts = cols[4].split("/").map(stripMarker);
    const morphParts = cols[5].split("/");
    const expandedParts = (cols[11] || "").split("/").map(stripMarker);
    const languageLetter = /^[HA]/.test(morphParts[0]) ? morphParts[0][0] : "H";
    const morphemes = wordParts.map((text, i) => {
        const strongRaw = strongParts[i] || "";
        const isRoot = strongRaw.startsWith("{") && strongRaw.endsWith("}");
        const strong = strongRaw.replace(/[{}]/g, "");
        const expanded = expandedParts[i] || "";
        return {
            text,
            transliteration: (translitParts[i] || "").trim(),
            gloss: (glossParts[i] || "").trim(),
            strongNumber: strong || null,
            morphologyCode: morphParts[i] || "",
            isRoot,
            expandedTag: expanded,
        };
    }).filter(morpheme =>
        // Drop separator slots and punctuation morphemes: a "//" word
        // boundary inside a row (e.g. Gen 30:11 "בָּא גָד") leaves an
        // empty slot with no text, Strong's or grammar, and a maqqef
        // or sof pasuq morpheme (H9014/H9016) carries no grammar
        // either. Neither is a word part, and both otherwise warn
        // for a missing morphology expansion.
        (morpheme.text.trim() || (morpheme.strongNumber || "").trim() || morpheme.morphologyCode.trim()) &&
        morpheme.strongNumber !== "H9014" && morpheme.strongNumber !== "H9016"
    );
    const root = morphemes.find(morpheme => morpheme.isRoot) || morphemes[morphemes.length - 1];
    return {
        book, chapter: Number(chapter), verse: Number(verse),
        wordIndex: Number(wordIndex), type,
        altChapter: altChapter ? Number(altChapter) : null,
        altVerse: altVerse ? Number(altVerse) : null,
        // "//" is a word boundary inside a row: it becomes a space,
        // while "/" morpheme boundaries vanish.
        wordText: cols[1].replace(/\\/g, "").replace(/\/\//g, " ").replace(/\//g, ""),
        transliteration: translitParts.join("").trim(),
        gloss: glossParts.map(part => part.trim()).filter(Boolean).join(" "),
        morphemes, rootStrong: root ? root.strongNumber : null,
        languageLetter,
    };
}

// Parse one TAGNT (Greek) word row. Returns null for header, verse
// and blank lines. Columns (tab-separated):
//   1 ref "Php.3.8#01=NKO" (ref + word index + word type)
//   2 word + transliteration in parens, e.g. "ἀλλὰ (alla)"
//   3 gloss
//   4 dStrong=Grammar, e.g. "G1108=N-GSF" (Robinson codes)
//   5 lemma=gloss, e.g. "γνῶσις=knowledge"
//   6 editions, e.g. "NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz"
//   12 sStrong+Instance, e.g. "G1108" (instance suffixes _A/_B stripped)
function parseTagntLine(line) {
    if (!line || line.startsWith("#")) return null;
    const cols = line.normalize("NFC").split("\t");
    if (cols.length < 6) return null;
    // As in parseTahotLine: an optional parenthetical alternate
    // numbering, e.g. Mrk.12.15(12.14), keeps the main (English) verse
    // and records the alternate for reporting only.
    const refMatch = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=([A-Za-z()]*)/.exec(cols[0]);
    if (!refMatch) return null;
    const [, book, chapter, verse, altChapter, altVerse, wordIndex, type] = refMatch;
    const wordMatch = /^([^(]+?)\s*\(([^)]+)\)\s*$/.exec(cols[1].trim());
    const wordText = wordMatch ? wordMatch[1].trim() : cols[1].trim();
    const transliteration = wordMatch ? wordMatch[2].trim() : "";
    // A compound word joins two Greek words with " + " in both the
    // dStrong=Grammar column (e.g. "G1473=P-1NS + G2532=CONJ" for
    // κἀγὼ) and the lemma=gloss column ("καί=and + ἐγώ=I"): each
    // component becomes its own morpheme so its grammar code expands
    // (a joined code like "P-1NS + G2532" has no expansion).
    const grammarParts = (cols[3] || "").split(" + ");
    const lemmaParts = (cols[4] || "").split(" + ");
    const components = grammarParts.map((part, i) => {
        const [strong, code] = part.split("=");
        const [lemma, ...glossParts] = (lemmaParts[i] || "").split("=");
        return {
            strongNumber: strong || null,
            morphologyCode: code || "",
            lemma: lemma || "",
            gloss: glossParts.join("=") || "",
        };
    });
    const strongNumber = components[0].strongNumber;
    const morphologyCode = components[0].morphologyCode;
    const wordGloss = (cols[2] || "").trim();
    const editions = (cols[5] || "").split("+");
    return {
        book, chapter: Number(chapter), verse: Number(verse),
        wordIndex: Number(wordIndex), type,
        altChapter: altChapter ? Number(altChapter) : null,
        altVerse: altVerse ? Number(altVerse) : null,
        wordText, transliteration,
        gloss: wordGloss,
        strongNumber: strongNumber || null,
        morphologyCode: morphologyCode || "",
        lemma: components[0].lemma,
        lemmaGloss: components[0].gloss,
        editions,
        inNA28: editions.includes("NA28"),
        morphemes: components.map((component, i) => ({
            text: wordText, transliteration,
            gloss: components.length > 1 ? component.gloss || wordGloss : wordGloss,
            strongNumber: component.strongNumber,
            morphologyCode: component.morphologyCode,
            isRoot: i === 0, expandedTag: "",
        })),
        rootStrong: strongNumber || null,
        languageLetter: "G",
    };
}

// Parse one TBESH/TBESG lexicon row. Returns null for headers and
// blank lines. Columns (tab-separated):
//   1 sStrong (e.g. H7225)   2 "dStrong =" (+ relation, e.g. "a Name of")
//   3 dStrong (or the related entry)   4 lemma   5 transliteration
//   6 brief morphology   7 SHORT GLOSS   8 fuller definition (NOT imported:
//   the file header asks for Online Bible permission before applying
//   these definitions in a project)
function parseLexiconLine(line) {
    if (!line || line.startsWith("﻿") || !/^[HG]\d/.test(line)) return null;
    const cols = line.normalize("NFC").split("\t");
    if (cols.length < 7) return null;
    const dStrong = (cols[1] || "").trim().split(/\s+/)[0];
    if (!/^[HG]\d/.test(dStrong)) return null;
    // Column 1 is the plain Strong's number, except that two different
    // words sharing one number get a lowercase sub-letter (H1254a/H1254b
    // for בָּרָא "to create" vs "to fatten"); the sub-letter is dropped
    // so the base is the plain Strong's number (H1254).
    return {
        strongNumber: dStrong,
        strongBase: cols[0].trim().replace(/[a-z]$/, ""),
        lemma: (cols[3] || "").trim().replace(/^\//, ""),
        transliteration: (cols[4] || "").trim(),
        gloss: (cols[6] || "").trim(),
        lexicalMorphology: (cols[5] || "").trim(),
    };
}

// Parse a TEHMC/TEGMC morphology-code file into code -> expansion.
// Rows are "CODE\tFunction=...; ..."; header and section lines are
// skipped. Hebrew codes carry their language letter (HNcfsa); a
// bare code (Ncfsa) is looked up with the word's language letter.
function parseMorphologyCodeFile(text) {
    const map = new Map();
    for (const line of text.split(/\r?\n/)) {
        const cols = line.split("\t");
        if (cols.length < 2) continue;
        const code = cols[0].trim();
        const expansion = cols[1].trim();
        if (!code || !expansion || !/^[HA]?[A-Z]/.test(code)) continue;
        if (!map.has(code)) map.set(code, expansion);
    }
    return map;
}

// The morphology-code lookup key for one morpheme. The language
// letter (H for Hebrew, A for Aramaic) is carried on the FIRST
// morpheme's code only (HR, HVqp3ms, HNcmpa); later morphemes carry
// bare codes (Ncfsa, Sp3ms) that take the word's language letter.
// A bare code starting with A is an adjective (Aafsa -> HAafsa), not
// an Aramaic-prefixed code, so the lookup is positional, not a
// first-letter test. Greek codes (N-GSF, V-PNI-1S) are used as-is.
function morphologyLookupKey(code, languageLetter, isFirstMorpheme) {
    if (isFirstMorpheme) return code;
    if (languageLetter === "G") return code;
    return `${languageLetter}${code}`;
}

// Derive a lexical entry for a Strong's number from a word row's
// expanded tags (TAHOT col 12) or lemma=gloss (TAGNT col 5), used
// only when the TBESH/TBESG lexicon has no row for that number.
function deriveLexicalEntry(strongNumber, word) {
    if (word.language === "greek") {
        return {
            strongNumber,
            strongBase: strongNumber.replace(/[A-Z]$/, ""),
            lemma: word.lemma || "",
            transliteration: word.transliteration || "",
            gloss: word.lemmaGloss || word.gloss || "",
            lexicalMorphology: "",
        };
    }
    const root = word.morphemes.find(morpheme => morpheme.strongNumber === strongNumber);
    const tag = root ? root.expandedTag.replace(/[{}]/g, "") : "";
    const tagParts = tag.split("=");
    // The tag gloss can carry STEPBible cross-reference markers:
    // "»" (a sense cross-reference) and "@" (first-occurrence
    // reference, e.g. "Rimmon@Jos.15.32"). Neither belongs in the
    // displayed gloss, so both are stripped here.
    const gloss = (tagParts[2] || "").split("»")[0].split("@")[0].replace(/^:\s*/, "").trim();
    return {
        strongNumber,
        strongBase: strongNumber.replace(/[A-Z]$/, ""),
        lemma: tagParts[1] || "",
        transliteration: root ? root.transliteration : "",
        gloss: gloss || (root ? root.gloss : ""),
        lexicalMorphology: "",
    };
}

async function downloadStepBibleFiles(dataDir, { refresh = false } = {}) {
    fs.mkdirSync(dataDir, { recursive: true });
    for (const [key, file] of Object.entries(STEPBIBLE_FILES)) {
        const dest = path.join(dataDir, `${key}.txt`);
        const parts = Array.isArray(file) ? file : [file];
        // A completed download is cached: the manifest written next
        // to it lists the parts it was assembled from, so a second
        // run fetches nothing. A file with no (or a mismatched)
        // manifest — e.g. an old Gen-Deu-only tahot.txt from the
        // single-part downloader — is never trusted as complete: it
        // is rebuilt once, then cached like the rest.
        const manifestPath = `${dest}.parts.json`;
        let cached = false;
        if (!refresh && fs.existsSync(dest) && fs.existsSync(manifestPath)) {
            try {
                cached = JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, "utf8"))) === JSON.stringify(parts);
            } catch {
                cached = false;
            }
        }
        if (cached) {
            console.log(`Already present: ${key}.txt`);
            continue;
        }
        const chunks = [];
        for (const part of parts) {
            const url = `${STEPBIBLE_BASE}/${encodeURI(part)}`;
            console.log(`Downloading ${key}.txt (${part}) ...`);
            const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
            if (!response.ok) throw new Error(`Download failed for ${key}: HTTP ${response.status}`);
            // Strip a leading BOM (the Mat-Jhn part carries one) and
            // make sure the part ends with a newline, so the last word
            // row of one part can never join the header of the next.
            let text = Buffer.from(await response.arrayBuffer()).toString("utf8").replace(/^\uFEFF/, "");
            if (!text.endsWith("\n")) text += "\n";
            chunks.push(text);
        }
        // Write via a temp file so an interrupted download never
        // leaves a partial file in place of a good one.
        fs.writeFileSync(dest + ".tmp", chunks.join(""));
        fs.renameSync(dest + ".tmp", dest);
        fs.writeFileSync(manifestPath, JSON.stringify(parts));
    }
}

async function importOriginalLanguage({ dataDir, scope = PHASE_1_SCOPE, pool = require("../db/db").biblePool } = {}) {
    const counts = { lexicalEntries: 0, morphologyCodes: 0, words: 0, altRefRows: 0, aramaicWords: 0, warnings: [] };
    // Verses where the Hebrew and English versifications put the
    // boundary in different places, so two STEPBible row groups share
    // one English verse number (e.g. Numbers 26:1: the tail of Hebrew
    // 25:19, "after the plague", plus the start of Hebrew 26:1, "the
    // LORD said to Moses"). Both groups are real words of the same
    // English verse, in file order; track them so the report says so.
    const mergedVerses = new Set();
    counts.mergedVerses = mergedVerses;
    const warn = message => {
        counts.warnings.push(message);
        console.warn(`Warning: ${message}`);
    };

    const readData = key => fs.readFileSync(path.join(dataDir, `${key}.txt`), "utf8");

    // Lexicons first: dStrong -> entry.
    const lexicon = new Map();
    for (const [key, language] of [["tbesh", "hebrew"], ["tbesg", "greek"]]) {
        for (const line of readData(key).split(/\r?\n/)) {
            const entry = parseLexiconLine(line);
            if (!entry) continue;
            if (!lexicon.has(entry.strongNumber)) lexicon.set(entry.strongNumber, { ...entry, language });
        }
    }

    // Morphology expansions: code -> expansion, per language.
    const expansions = {
        hebrew: parseMorphologyCodeFile(readData("tehmc")),
        greek: parseMorphologyCodeFile(readData("tegmc")),
    };

    // Source ids (seeded by the migration).
    const sourceResult = await pool.query("SELECT id, code FROM ol_sources");
    const sourceIds = new Map(sourceResult.rows.map(row => [row.code, row.id]));
    for (const code of Object.values(SOURCE_CODES)) {
        if (!sourceIds.has(code)) throw new Error(`ol_sources is missing ${code}; run the migration first.`);
    }

    // Book ids, resolved by Gnosis book name (never book_order).
    const bookResult = await pool.query("SELECT id, name FROM bible_books");
    const bookIds = new Map(bookResult.rows.map(row => [row.name, row.id]));

    // Aramaic words share the Hebrew lexicon (TBESH) and the Hebrew
    // morphology expansions (TEHMC) — both files cover Aramaic — so
    // "aramaic" maps to the Hebrew sources, not to a missing one.
    const lexicalSource = { hebrew: "STEPBible-TBESH", aramaic: "STEPBible-TBESH", greek: "STEPBible-TBESG" };
    const morphologySource = { hebrew: "STEPBible-TEHMC", aramaic: "STEPBible-TEHMC", greek: "STEPBible-TEGMC" };

    // Already-inserted entries and codes are remembered in memory, so
    // the full import does not re-issue the same no-op upsert for
    // every word that shares a Strong's number or morphology code.
    // The counts still only count rows actually inserted (RETURNING
    // id), so a re-run that finds everything already present reports
    // zero new entries and zero new codes.
    const seenLexicalEntries = new Set();
    const seenMorphologyCodes = new Set();

    const ensureLexicalEntry = async (strongNumber, language, word) => {
        if (!strongNumber) return null;
        if (seenLexicalEntries.has(strongNumber)) return strongNumber;
        seenLexicalEntries.add(strongNumber);
        let entry = lexicon.get(strongNumber);
        if (!entry) {
            entry = { ...deriveLexicalEntry(strongNumber, word), language };
            warn(`No lexicon row for ${strongNumber}; derived lemma/gloss from the word row.`);
        }
        const inserted = await pool.query(
            `INSERT INTO ol_lexical_entries
                (strong_number, strong_base, language, lemma, transliteration, gloss, lexical_morphology, source_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (strong_number) DO UPDATE SET
                strong_base=EXCLUDED.strong_base, language=EXCLUDED.language, lemma=EXCLUDED.lemma,
                transliteration=EXCLUDED.transliteration, gloss=EXCLUDED.gloss,
                lexical_morphology=EXCLUDED.lexical_morphology, source_id=EXCLUDED.source_id
             WHERE (ol_lexical_entries.strong_base,ol_lexical_entries.language,ol_lexical_entries.lemma,
                ol_lexical_entries.transliteration,ol_lexical_entries.gloss,ol_lexical_entries.lexical_morphology,ol_lexical_entries.source_id)
                IS DISTINCT FROM (EXCLUDED.strong_base,EXCLUDED.language,EXCLUDED.lemma,
                EXCLUDED.transliteration,EXCLUDED.gloss,EXCLUDED.lexical_morphology,EXCLUDED.source_id)
             RETURNING id`,
            [entry.strongNumber, entry.strongBase, language, entry.lemma || "",
                entry.transliteration || null, entry.gloss || null,
                entry.lexicalMorphology || null, sourceIds.get(lexicalSource[language])]
        );
        if (inserted.rows.length > 0) counts.lexicalEntries += 1;
        return entry.strongNumber;
    };

    const ensureMorphologyCode = async (code, language, expansion) => {
        const key = `${language}:${code}`;
        if (seenMorphologyCodes.has(key)) return;
        seenMorphologyCodes.add(key);
        const inserted = await pool.query(
            `INSERT INTO ol_morphology_codes (code, language, expansion, source_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (language, code) DO UPDATE SET expansion=EXCLUDED.expansion,source_id=EXCLUDED.source_id
             WHERE (ol_morphology_codes.expansion,ol_morphology_codes.source_id)
                IS DISTINCT FROM (EXCLUDED.expansion,EXCLUDED.source_id) RETURNING id`,
            [code, language, expansion, sourceIds.get(morphologySource[language])]
        );
        if (inserted.rows.length > 0) counts.morphologyCodes += 1;
    };

    // Read each source file once and group its parsed words by
    // STEPBible book abbreviation. The full import is 66 passages
    // over two large files; re-reading and re-splitting them per
    // passage would repeat the same parsing 66 times.
    const wordsByBook = new Map();
    // Verses where two STEPBible row groups share one English verse
    // number (a Hebrew/English verse-boundary shift, e.g. Numbers
    // 26:1: the tail of Hebrew 25:19 plus Hebrew 26:1). The second
    // group restarts the source word index, so the two groups would
    // collide on (book, chapter, verse, word_index). Detected here
    // (after the inclusion rules, so only kept rows count) so the
    // passage loop can renumber those verses sequentially in file
    // order; every other verse keeps its source word index.
    const mergedVerseKeys = new Set();
    for (const source of ["tahot", "tagnt"]) {
        const parseLine = source === "tahot" ? parseTahotLine : parseTagntLine;
        const seenKeys = new Map();
        for (const line of readData(source).split(/\r?\n/)) {
            const word = parseLine(line);
            if (!word) continue;
            if (source === "tahot" && !/^[LQ]/.test(word.type)) continue;
            if (source === "tagnt" && !word.inNA28) continue;
            if (!wordsByBook.has(word.book)) wordsByBook.set(word.book, []);
            wordsByBook.get(word.book).push(word);
            const key = `${word.book}|${word.chapter}|${word.verse}|${word.wordIndex}`;
            if (seenKeys.has(key)) mergedVerseKeys.add(`${word.book}|${word.chapter}|${word.verse}`);
            else seenKeys.set(key, true);
        }
    }

    for (const passage of scope) {
        const bookId = bookIds.get(passage.name);
        if (!bookId) throw new Error(`bible_books has no "${passage.name}"; seed the books first.`);
        const chapterSet = new Set(passage.chapters);
        // The stored word indices used per verse. Normally the stored
        // index is the source word index. For a merged verse (see
        // mergedVerseKeys above) the second group restarts the source
        // index, so the stored index is assigned sequentially in file
        // order instead — otherwise the second group's words would
        // overwrite the first group's (ON CONFLICT DO UPDATE) and
        // real text would be silently lost, and the verse's words
        // would read out of order. Words after an excluded (TR-only)
        // word keep their source index — only a merged verse renumbers.
        const verseNextIndex = new Map();
        for (const word of wordsByBook.get(passage.book) || []) {
            if (!chapterSet.has(word.chapter)) continue;
            // Inclusion rules (STEPBible docs): Hebrew — Leningrad (L)
            // main text and Qere (Q); Greek — the NA28 text only.
            if (passage.source === "tahot" && !/^[LQ]/.test(word.type)) continue;
            if (passage.source === "tagnt" && !word.inNA28) continue;
            // Rows whose ref carried a parenthetical alternate numbering
            // are stored under the main (English) verse; count them so
            // the import report states how many were handled this way.
            if (word.altChapter !== null) counts.altRefRows += 1;

            // Word-level language: Aramaic words inside a Hebrew
            // passage are stored as Aramaic (see ARAMAIC_RANGES).
            // This uses the SOURCE word index (the ranges are defined
            // on it); the stored index below may differ for merged
            // verses, and no merged verse is in an Aramaic range.
            const wordLang = wordLanguageForWord(passage, word);
            if (wordLang === "aramaic") counts.aramaicWords += 1;

            const verseKey = `${word.chapter}:${word.verse}`;
            let storedWordIndex = word.wordIndex;
            if (mergedVerseKeys.has(`${passage.book}|${word.chapter}|${word.verse}`)) {
                storedWordIndex = verseNextIndex.get(verseKey) || 1;
                verseNextIndex.set(verseKey, storedWordIndex + 1);
                mergedVerses.add(`${passage.name} ${word.chapter}:${word.verse}`);
            }

            const enriched = [];
            for (const [index, morpheme] of word.morphemes.entries()) {
                const key = morphologyLookupKey(morpheme.morphologyCode, word.languageLetter, index === 0);
                const expansion = expansions[passage.language].get(key);
                if (!expansion) {
                    warn(`No ${passage.language} morphology expansion for ${morpheme.morphologyCode} (key ${key}) at ${word.book}.${word.chapter}.${word.verse}#${word.wordIndex}; keeping the raw code.`);
                    enriched.push({ ...morpheme, expansion: morpheme.morphologyCode });
                    continue;
                }
                await ensureMorphologyCode(key, passage.language, expansion);
                enriched.push({ ...morpheme, expansion });
            }
            const grammarDisplay = grammarDisplayForMorphemes(enriched);
            const rootStrong = await ensureLexicalEntry(word.rootStrong, wordLang, { ...word, language: wordLang });
            for (const morpheme of enriched) {
                if (morpheme.strongNumber && morpheme.strongNumber !== word.rootStrong) {
                    await ensureLexicalEntry(morpheme.strongNumber, wordLang, { ...word, language: wordLang });
                }
            }
            const morphemesJson = enriched.map(morpheme => ({
                text: morpheme.text,
                transliteration: morpheme.transliteration,
                gloss: morpheme.gloss,
                strongNumber: morpheme.strongNumber,
                morphologyCode: morpheme.morphologyCode,
                morphologyExpanded: morpheme.expansion,
                isRoot: morpheme.isRoot,
            }));
            await pool.query(
                `INSERT INTO ol_word_occurrences
                    (source_id, book_id, chapter_number, verse_number, word_index,
                     language, word_text, transliteration, gloss, strong_number,
                     morphology_code, grammar_display, morphemes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 ON CONFLICT (source_id, book_id, chapter_number, verse_number, word_index)
                 DO UPDATE SET language = EXCLUDED.language,
                     word_text = EXCLUDED.word_text,
                     transliteration = EXCLUDED.transliteration,
                     gloss = EXCLUDED.gloss,
                     strong_number = EXCLUDED.strong_number,
                     morphology_code = EXCLUDED.morphology_code,
                     grammar_display = EXCLUDED.grammar_display,
                     morphemes = EXCLUDED.morphemes`,
                [sourceIds.get(SOURCE_CODES[passage.source]), bookId, word.chapter, word.verse,
                    storedWordIndex, wordLang, word.wordText, word.transliteration || null,
                    word.gloss || null, rootStrong,
                    word.morphemes.map(morpheme => morpheme.morphologyCode).join("/"),
                    grammarDisplay, JSON.stringify(morphemesJson)]
            );
            counts.words += 1;
        }
        console.log(`${passage.name} ${passage.chapters.join(", ")} imported.`);
    }
    return counts;
}

async function main() {
    const { biblePool: pool } = require("../db/db");
    const args = process.argv.slice(2);
    const dataDirIndex = args.indexOf("--data-dir");
    const dataDir = dataDirIndex === -1
        ? path.join(__dirname, "original-language-data")
        : path.resolve(args[dataDirIndex + 1]);
    try {
        if (args.includes("--download")) await downloadStepBibleFiles(dataDir);
        const full = args.includes("--full");
        if (full) console.log("Full 66-book import.");
        const counts = await importOriginalLanguage({ dataDir, scope: full ? FULL_SCOPE : PHASE_1_SCOPE, pool });
        console.log(`Done: ${counts.words} word occurrences, ${counts.lexicalEntries} lexical entries written, ` +
            `${counts.morphologyCodes} morphology codes written, ${counts.altRefRows} with alternate verse numbers, ` +
            `${counts.aramaicWords} Aramaic words, ${counts.warnings.length} warnings.` +
            (counts.mergedVerses.size > 0
                ? ` ${counts.mergedVerses.size} verses span a Hebrew/English verse-boundary shift and were renumbered sequentially: ${[...counts.mergedVerses].join("; ")}.`
                : ""));
    } catch (error) {
        console.error("Original-language import failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

if (require.main === module) main();

module.exports = {
    importOriginalLanguage, downloadStepBibleFiles, parseTahotLine, parseTagntLine, parseLexiconLine,
    parseMorphologyCodeFile, parseMorphologyExpansion, grammarDisplayForMorphemes,
    morphologyLookupKey, deriveLexicalEntry, splitTopLevel, wordLanguageForWord,
    PHASE_1_SCOPE, FULL_SCOPE, STEPBIBLE_FILES, ARAMAIC_RANGES,
};
