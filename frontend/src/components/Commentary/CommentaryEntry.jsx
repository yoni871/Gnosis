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
        {formatParagraphText(cleanParagraph)}
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

export default function CommentaryEntry({ item, book }) {

  return (
    <section className="
      border-t
      border-[var(--border)]
      py-[24px]
    ">

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
        {formatCommentary(item.content)}
      </div>

    </section>
  )
}