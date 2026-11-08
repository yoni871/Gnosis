import { memo, useEffect, useMemo, useRef } from "react";

// Emphasizes a number at the beginning of a commentary paragraph.
function formatParagraphText(paragraph) {
  const numberedParagraph = paragraph.match(/^(\d+\.)\s*(.*)$/);

  if (!numberedParagraph) {
    return paragraph;
  }

  const [, paragraphNumber, paragraphText] = numberedParagraph;

  return (
    <>
      <strong className="font-semibold text-[var(--color-brand)]">
        {paragraphNumber}
      </strong>{" "}
      {paragraphText}
    </>
  );
}

// Formats commentary content into separate paragraphs.
function formatCommentary(content) {

  const cleanedContent = content
  // Remove escaped periods from the imported Markdown.
  .replace(/\\\./g, ".")
  // Remove a next-chapter heading accidentally stored at the end of JFB entries.
  .replace(/\n\s*CHAPTER\s+\d+\s*$/i, "")
  .trim();

  // Split wherever a blank line appears.
  const paragraphs = cleanedContent.split(/\r?\n\s*\r?\n/);

  return paragraphs.map((paragraph, paragraphIndex) => {
    const cleanParagraph = paragraph.trim();

    if (!cleanParagraph) {
      return null;
    }

    return (
      <p
        key={paragraphIndex}
        className="mb-[18px] last:mb-0"
      >
        <span>
            {formatParagraphText(cleanParagraph)}
        </span>
      </p>
    );
  });
}

// Formats single verses, same-chapter ranges, and cross-chapter ranges.
function formatPassageRange(item, book) {
  const startReference = `${book} ${item.start_chapter}:${item.start_verse}`;

  const isSingleVerse =
    item.start_chapter === item.end_chapter &&
    item.start_verse === item.end_verse;

  if (isSingleVerse) {
    return startReference;
  }

  if (item.start_chapter === item.end_chapter) {
    return `${startReference}-${item.end_verse}`;
  }

  return `${startReference}-${item.end_chapter}:${item.end_verse}`;
}

// Memoised: the entry's text is re-formatted (two regex passes, a
// split, a <p> per paragraph) only when its content changes — not on
// every verse click, which re-renders the panel but changes
// isSelected for at most one entry. The parent passes the same item
// object for unchanged entries, so memo skips those renders entirely.
function CommentaryEntry({ item, book, isSelected, showTitle }) {

  const entryRef = useRef(null);

  const formattedContent = useMemo(
    () => formatCommentary(item.content),
    [item.content]
  );

  useEffect(() => {
  if (isSelected) {
    // Respect the reduced-motion preference, as the landing page
    // and About navigation already do. Optional chaining matches
    // their pattern and keeps this safe where matchMedia is
    // unavailable (jsdom).
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth";
    entryRef.current?.scrollIntoView({
      behavior,
      block: "center"
    });
  }
}, [isSelected]);

  return (
    <section
      ref={entryRef}
      className={`
        border-t
        border-[var(--border)]
        py-[24px]
        transition-colors
        duration-200
        ${
          isSelected
            ? "border-l-[3px] border-l-[var(--color-brand)] pl-[14px] pr-[10px] bg-[rgba(176,141,87,0.18)] px-[14px] py-[12px]"
            : ""
        }
      `}
    >

      {/* Only render the heading when a new JFB section begins. */}
      {showTitle && (
        <h3 className="
          m-0
          mb-[9px]
          font-serif
          text-[17px]
          font-semibold
          leading-[1.4]
          text-[var(--color-brand)]
        ">
          {item.entry_title}
        </h3>
)}

      <span className="
        mb-[17px]
        block
        text-[11px]
        font-semibold
        tracking-[0.5px]
        text-[var(--text-muted)]
      ">
        {formatPassageRange(item, book)}
      </span>

      <div className="
        m-0
        font-serif
        text-[15px]
        leading-[1.9]
        text-[var(--text-primary)]
      ">
        {formattedContent}
      </div>

    </section>
  )
}

export default memo(CommentaryEntry);