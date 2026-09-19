import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getBooks, getBibleChapter, getTranslations } from '../services/bibleService'
import Header from '../components/Header/Header'
import SubHeader from '../components/Navigation/SubHeader'
import ScripturePanel from '../components/Scripture/ScripturePanel'
import CommentaryPanel from '../components/Commentary/CommentaryPanel'


export default function StudyPage() {

  const {book: urlBook, chapter: urlChapter} = useParams();
  const [searchParams] = useSearchParams();

  const urlVerse = searchParams.get("verse");

  const [verses, setVerses] = useState([]);
  const [book, setBook] = useState(urlBook || "Genesis");
  const [chapter, setChapter] = useState(Number(urlChapter) || 1);
  const [books, setBooks] = useState([]);
  const [selectedVerse, setSelectedVerse] = useState(urlVerse ? Number(urlVerse) : null);
  const [layout, setLayout] = useState("side");

  const [translation, setTranslation] = useState("");
  const [translations, setTranslations] = useState([]);

  useEffect(() => {
    setBook(urlBook || "Genesis");
    setChapter(Number(urlChapter) || 1);
    setSelectedVerse(urlVerse ? Number(urlVerse) : null);
  }, [urlBook, urlChapter, urlVerse]);

  useEffect(() => {
        if (!translation) {
          return;
        }
        // Fetch the verses for the current book and chapter.
        getBibleChapter(book, chapter, translation)
            .then(data => {
                setVerses(data);
            })
            .catch(error => {
                console.error(error);
            });
    }, [book, chapter, translation]);

  useEffect(() => {
    // Fetch all available Bible books.
        getBooks()
            .then(data => {
                setBooks(data);
            })
            .catch(error => {
                console.error(error);
            });
    }, []);

  useEffect(() => {
    //fetch all translations
      getTranslations()
        .then(data => {
          setTranslations(data);
          if (data.length > 0) {
            setTranslation(data[0].abbreviation);
          }
        })
        .catch(error => {
          console.error(error);
        });
  }, []);

    

  return (
    <>
        <Header 
          layout={layout}
          setLayout={setLayout}
        />
        <SubHeader 
          verses={verses} 
          chapter={chapter}
          setChapter={setChapter}
          book={book}
          books={books}
          setBook={setBook}
          selectedVerse={selectedVerse}
          setSelectedVerse={setSelectedVerse}
        />
        <main 
          className={
            `mt-[108px]
            grid
            ${layout === "side" ? "grid-cols-[60%_40%]" : "grid-rows-2"}
            h-[calc(100vh-108px)]
            overflow-hidden
            max-[768px]:block
            max-[768px]:h-auto
            max-[768px]:overflow-visible`
        }>
            <ScripturePanel 
              verses={verses}
              book={book}
              chapter={chapter}
              translation={translation}
              translations={translations}
              selectedVerse={selectedVerse}
              setSelectedVerse={setSelectedVerse}
              setTranslation={setTranslation}
            />

            <CommentaryPanel
              book={book}
              chapter={chapter}
              books={books}
              selectedVerse={selectedVerse}
            />
          
        </main>
    </>
  )
}
