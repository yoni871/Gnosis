

// Formats Matthew Henry's commentary into separate paragraphs.
function formatCommentary(content) {

  // Remove escaped periods from the imported Markdown.
  const cleanedContent = content.replace(/\\\./g, ".");

  // Split the commentary wherever there is a blank line.
  const paragraphs = cleanedContent.split("\n\n");
  return paragraphs.map((paragraph, paragraphIndex) => {
    // Remove unnecessary whitespace around the paragraph.
    const cleanParagraph = paragraph.trim();
    // Skip completely empty paragraphs.
    if (!cleanParagraph) {
      return null;
    }

    return (
      <div
        key={paragraphIndex}
        className="mb-[18px]"
      >
        {cleanParagraph}
      </div>
    );
  });
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
            text-[var(--burgundy)]
        ">
          {item.entry_title}
        </h3>

        <span className="
            mb-[17px]
            block
            text-[11px]
            font-semibold
            tracking-[0.5px]
            text-[var(--muted)]
        ">
            {book} {item.start_chapter}:{item.start_verse}
            {item.end_chapter !== item.start_chapter
            ? `-${item.end_chapter}:${item.end_verse}`
            : `-${item.end_verse}`}
        </span>

        <div className="
            m-0
            font-serif
            text-[15px]
            leading-[1.9]
            text-[var(--text)]
        ">
              {formatCommentary(item.content)}
        </div>

    </section>
  )
}
