import { useEffect, useState } from 'react';
import { getCommentaries, getChapterCommentaries } from '../../services/commentaryService';
import CommentatorSelector from './CommentatorSelector';
import CommentaryEntry from './CommentaryEntry';


export default function CommentaryPanel({ book, chapter, books }) {
  const [commentary, setCommentary] = useState([]);
  const [isCommentaryOpen, setIsCommentaryOpen] = useState(false);
  const [selectedCommentator, setSelectedCommentator] = useState(3);
  const [commentators, setCommentators] = useState([]);

  //find the database record for the current selected book
  const currentBook = books.find((item) => book === item.name);

  //fetch commentary whenever the book, chapter, or commentary changes
  useEffect(() => {

    // Don't fetch until we know which book we're viewing.
    if (!currentBook) {
      return;
    }

    // Fetch commentary for the selected commentator.
    getChapterCommentaries(
      currentBook.id,
      chapter,
      selectedCommentator
    )
      .then(data => {
          setCommentary(data);
      })
      .catch(error => {
        console.error(error);
      });

  }, [book, chapter, books, selectedCommentator]);

  // Gets all available commentators from the backend.
  useEffect(() => {

    getCommentaries()
      .then(data => {
      setCommentators(data);
    })
      .catch(error => {
          console.error(error);
      });

  }, []);

  return (
    <aside className="
      relative
      h-full
      overflow-hidden
      flex
      flex-col
      border-l
      border-[var(--border)]
      max-[768px]:border-l-0
      max-[768px]:border-t
      max-[768px]:py-[30px]
      bg-[rgba(250,247,239,0.35)]
      px-[clamp(20px,2.5vw,36px)]
      py-[16px]
    ">

        <div className="
          mb-[10px]
          text-[10px]
          font-semibold
          tracking-[3px]
          text-[var(--muted)]
        ">
          COMMENTARY
        </div>

        <CommentatorSelector 
          commentators={commentators}
          selectedCommentator={selectedCommentator}
          setSelectedCommentator={setSelectedCommentator}
          isCommentaryOpen={isCommentaryOpen}
          setIsCommentaryOpen={setIsCommentaryOpen}
        />

        <div className="
          mt-[22px]
          mb-[15px]
          inline-flex
          items-center
          gap-[7px]
          rounded-full
          bg-[#EDE2D0]
          px-[11px]
          py-[7px]
          text-[11px]
        ">
            <strong className="text-[var(--burgundy)]">
              {book} {chapter}
            </strong>
            <span className="text-[var(--muted)] italic">
              {commentary.length > 0 ? commentary[0].entry_title : ""}
            </span>
          </div>

      <div className="
        min-h-0
        flex-1
        overflow-y-auto
      ">

        <p className="
          m-0
          mb-[28px]
          border-b
          border-[var(--border)]
          pb-[24px]
          font-serif
          text-[13px]
          italic
          leading-[1.75]
          text-[var(--muted)]
        ">
          {commentary.length > 0 ? commentary[0].description : ""} 
        </p>

        {commentary.map((item, index) => (
          <CommentaryEntry 
            key={index}
            item={item}
            book={book}
          />
        ))}

      </div>

    </aside>
  )
}
