# Gnosis — Technical Design

**Version:** 0.4
**Status:** Active Development
**Date:** September 17, 2026
**Owner:** Yonatan Demissie

---

## 1. Document Status & Implementation Legend

This document describes the current technical architecture of Gnosis and the planned architecture for features that have not yet been implemented.

Feature status is represented using the following labels:

| Status | Meaning |
|---|---|
| IMPLEMENTED | Feature is currently built and functioning |
| PARTIALLY IMPLEMENTED | Core functionality exists, but additional work remains |
| PLANNED | Approved for the MVP but not yet implemented |
| FUTURE | Planned for a post-MVP release |

---

## 2. System Overview

Gnosis is a full-stack Bible study application designed to combine Scripture and classic Bible commentary in a unified study interface.

The core study experience allows users to:

- Read Scripture by book and chapter
- Select individual verses
- Switch between Bible translations
- Read commentary alongside Scripture
- Switch between commentary sources
- Search Bible content
- Navigate directly from search results to Bible passages
- Use the application across desktop, tablet, and mobile layouts
- Switch between light and dark themes

The MVP will additionally support:

- User registration and login
- Personal notes
- Bookmarks
- Commentary search

Future versions may introduce:

- Additional Bible translations
- Additional commentary and theological resources
- AI-assisted Bible research
- Retrieval-Augmented Generation (RAG)
- Semantic search
- Additional personal study tools

---

## 3. Technology Stack

### 3.1 Frontend

**Status: IMPLEMENTED**

- React
- Vite
- JavaScript
- React Router
- Tailwind CSS
- Lucide React icons
- Responsive web design
- React Context for global theme state

### 3.2 Backend

**Status: IMPLEMENTED**

- Node.js
- Express.js
- JavaScript
- REST API
- bcrypt
- JSON Web Tokens (JWT)

### 3.3 Database

**Status: IMPLEMENTED**

- PostgreSQL 14
- Raw SQL through `pg` / node-postgres
- PostgreSQL Full-Text Search

### 3.4 Development Environment

- Visual Studio Code
- Git
- GitHub
- npm
- Local PostgreSQL development database

### 3.5 Architecture

Gnosis uses a PERN architecture:

```text
React / Vite
      ↓
REST API
      ↓
Node.js / Express
      ↓
PostgreSQL
```

The frontend communicates with the Express backend through HTTP requests. The backend contains the application's API, database access, authentication, and search logic.

PostgreSQL stores Scripture, commentary, source metadata, users, and eventually personal study data.

---

## 4. System Architecture

### 4.1 Frontend

**Status: IMPLEMENTED**

The React frontend currently provides:

- Bible reading
- Book navigation
- Chapter navigation
- Verse selection
- Bible translation selection
- Commentary viewing
- Commentary source selection
- Bible search
- Search-result navigation
- Responsive layouts
- Light and dark themes
- Header and profile-menu UI

The frontend is organized into pages, reusable components, services, hooks, and context.

### 4.2 Backend

**Status: IMPLEMENTED / PARTIALLY IMPLEMENTED**

The Node.js/Express backend currently:

- Provides REST APIs
- Retrieves Bible content
- Retrieves commentary content
- Retrieves translation information
- Retrieves commentary-source information
- Performs Bible full-text search
- Performs commentary full-text search
- Registers users
- Authenticates users
- Generates JWTs
- Verifies JWTs through authentication middleware
- Communicates with PostgreSQL using parameterized SQL queries

Still planned:

- Notes API
- Bookmarks API
- Additional request validation
- Production-level security hardening

### 4.3 Database

**Status: IMPLEMENTED**

PostgreSQL currently stores:

- Bible translations
- Bible books
- Bible chapters
- Bible verses
- Commentary sources
- Commentaries
- Commentary entries
- Users

The schema is designed to additionally support:

- Notes
- Bookmarks

---

## 5. Frontend Architecture

### 5.1 Routing

**Status: IMPLEMENTED**

Primary application routes include:

```text
/bible/:book/:chapter
/search
```

The Bible route loads the study interface for the requested book and chapter.

Search results can navigate users directly to a Bible passage and selected verse.

### 5.2 Study Page

**Status: IMPLEMENTED**

`StudyPage.jsx` acts as the primary coordinator for the Bible study experience.

It manages or coordinates:

- Current book
- Current chapter
- Selected verse
- Bible verses
- Translation selection
- Scripture panel
- Commentary panel
- Navigation controls

The study page is responsible for keeping Scripture navigation and commentary display synchronized with the selected Bible location.

### 5.3 Scripture Components

**Status: IMPLEMENTED**

The Scripture interface includes:

```text
ScripturePanel
BookSelector
ChapterSelector
VerseSelector
SubHeader
```

Responsibilities include:

- Displaying Scripture
- Selecting books
- Selecting chapters
- Selecting verses
- Navigating between chapters
- Switching translations
- Highlighting the selected verse

### 5.4 Commentary Components

**Status: IMPLEMENTED / PARTIALLY IMPLEMENTED**

The commentary interface includes:

```text
CommentaryPanel
CommentaryEntry
CommentatorSelector
```

Currently implemented:

- Load commentary for the selected Bible chapter
- Display commentary passage ranges
- Display commentary section titles
- Format commentary paragraphs
- Switch commentary sources
- Support commentary entries spanning verse ranges
- Responsive commentary display

Remaining UX work:

- Determine which commentary entry covers the selected Bible verse
- Visually emphasize the relevant commentary entry
- Automatically bring the relevant entry into view when appropriate

### 5.5 Search Interface

**Status: PARTIALLY IMPLEMENTED**

`SearchResultsPage.jsx` currently supports Bible search.

Implemented:

- Read search query from URL
- Request Bible search results
- Display matching verses
- Navigate from a result to its Bible passage
- Select/highlight the matching verse
- Handle no-result searches

Remaining:

- Commentary-search interface
- Resource-type selection/filtering
- Commentary-result navigation

### 5.6 Header and Navigation

**Status: IMPLEMENTED**

The application header includes:

- Gnosis branding
- Search
- Theme controls
- Responsive navigation
- Mobile menu
- Profile menu

Reusable navigation components use a shared click-outside hook to close menus when users interact elsewhere.

### 5.7 Theme System

**Status: IMPLEMENTED**

Theme state is managed through:

```text
ThemeContext
```

The application supports:

- Light theme
- Dark theme
- CSS custom properties for shared theme values

Major interface colors use variables such as:

```css
--bg-page
--bg-header
--bg-panel
--bg-surface
--border
--color-brand
--color-accent
--text-primary
--text-muted
```

This allows components to adapt automatically when the active theme changes.

### 5.8 Responsive Design

**Status: IMPLEMENTED / ONGOING**

The application supports desktop, tablet, and mobile layouts.

Responsive behavior has been implemented for:

- Header
- Navigation
- Scripture panel
- Commentary panel
- Search
- Dropdown selectors
- Study-page layout

Responsive behavior is manually tested during development and will receive additional QA before deployment.

---

## 6. Backend Architecture

### 6.1 Layered Structure

The backend separates responsibilities across:

```text
Routes
   ↓
Controllers
   ↓
Services
   ↓
Database
```

Additional backend areas include:

```text
middleware/
importer/
scripts/
data/
db/
```

### 6.2 Routes

Routes define HTTP endpoints and connect requests to the appropriate controller logic.

Major route groups currently include:

- Bible
- Commentary
- Search
- Authentication

### 6.3 Controllers

Controllers process HTTP requests and responses.

Responsibilities include:

- Reading route/query parameters
- Calling service functions
- Returning JSON
- Returning appropriate HTTP status codes
- Handling errors

### 6.4 Services

Services contain database queries and data-access logic.

Gnosis currently uses raw parameterized SQL through `pg` rather than an ORM.

Example:

```text
Controller
   ↓
Bible Service
   ↓
pool.query(...)
   ↓
PostgreSQL
```

### 6.5 Middleware

Authentication middleware verifies JWTs before protected resources can be accessed.

This middleware will also protect future notes and bookmark endpoints.

---

## 7. REST API Design

### 7.1 Bible Endpoints

**Status: IMPLEMENTED**

Core Bible API capabilities include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/books` | Get all Bible books |
| GET | `/books/:bookId/chapters` | Get chapters for a book |
| GET | `/chapters/:chapterId/verses` | Get verses for a chapter |
| GET | `/translations` | Get available Bible translations |

The backend also supports retrieving Scripture by book, chapter, and translation for the study interface.

Chapter results are explicitly ordered by `chapter_number`.

Verse results are explicitly ordered by `verse_number`.

### 7.2 Commentary Endpoints

**Status: IMPLEMENTED**

Core commentary capabilities include:

| Method | Purpose |
|---|---|
| GET | Get available commentaries |
| GET | Get commentary entries for a book |
| GET | Get commentary entries covering a chapter |
| GET | Retrieve commentary associated with a verse |

Commentary retrieval uses passage ranges rather than requiring one commentary row per Bible verse.

### 7.3 Search Endpoints

**Status: IMPLEMENTED ON BACKEND**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/search/bible` | Search Bible content |
| GET | `/search/commentary` | Search commentary content |

Bible search is connected to the frontend.

Commentary search is implemented on the backend but still requires complete frontend integration.

### 7.4 Authentication Endpoints

**Status: BACKEND IMPLEMENTED**

Authentication currently supports:

| Method | Purpose |
|---|---|
| POST | Register a user |
| POST | Authenticate/login a user |
| GET | Retrieve authenticated profile information |

Backend authentication uses bcrypt and JWT.

Frontend authentication integration remains incomplete.

### 7.5 Notes Endpoints

**Status: PLANNED**

Planned endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/notes` | Get authenticated user's notes |
| POST | `/notes` | Create a note |
| PUT | `/notes/:noteId` | Update a note |
| DELETE | `/notes/:noteId` | Delete a note |

### 7.6 Bookmark Endpoints

**Status: PLANNED**

Planned endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/bookmarks` | Get authenticated user's bookmarks |
| POST | `/bookmarks` | Create a bookmark |
| DELETE | `/bookmarks/:bookmarkId` | Delete a bookmark |

### 7.7 API Design Principles

The backend should:

- Use standard HTTP methods
- Return JSON
- Use appropriate HTTP status codes
- Use parameterized SQL
- Validate incoming data
- Require JWT authentication for private resources
- Return useful error responses
- Keep endpoints organized by resource
- Keep database logic separated from presentation logic

---

## 8. Database Design

### 8.1 Current Core Tables

The current database includes:

```text
bible_translations
bible_books
bible_chapters
bible_verses
sources
commentaries
commentary_entries
users
```

Notes and bookmarks are part of the MVP architecture but their complete application functionality has not yet been implemented.

### 8.2 Bible Translations

Stores metadata for supported Bible translations.

Core fields:

```text
id
name
abbreviation
```

Current translations:

- Berean Standard Bible (BSB)
- World English Bible (WEB)
- King James Version (KJV)
- American Standard Version (ASV)

### 8.3 Bible Books

Stores the canonical 66 Bible books independently of translations.

Core fields include:

```text
id
name
abbreviation
testament
book_order
```

Book ordering is represented independently from database IDs.

In the current development database, database IDs should not be assumed to equal canonical Bible book order.

### 8.4 Bible Chapters

Stores chapters belonging to Bible books.

Core fields:

```text
id
book_id
chapter_number
```

Relationship:

```text
Bible Book → Many Bible Chapters
```

The database enforces uniqueness for a chapter within a book:

```sql
UNIQUE (book_id, chapter_number)
```

### 8.5 Bible Verses

Stores translation-specific Bible text.

Core fields:

```text
id
chapter_id
translation_id
verse_number
text
```

Relationships:

```text
Bible Chapter → Many Bible Verses
Bible Translation → Many Bible Verses
```

The database prevents duplicate verses within the same translation and chapter:

```sql
UNIQUE (chapter_id, translation_id, verse_number)
```

### 8.6 Sources

Stores source and licensing metadata.

Core fields include:

```text
id
name
type
description
license
created_at
```

Current commentary sources include:

- Matthew Henry
- Robert Jamieson, A. R. Fausset, and David Brown

The source system allows commentary content to retain attribution and licensing information.

### 8.7 Commentaries

Stores metadata about commentary collections.

Core fields include:

```text
id
source_id
title
description
```

Current commentary collections include:

- Matthew Henry's Complete Commentary
- Commentary Critical and Explanatory on the Whole Bible (JFB)

Relationship:

```text
Source → Many Commentaries
```

### 8.8 Commentary Entries

Stores normalized commentary text and the Bible passage covered by each entry.

Core fields:

```text
id
commentary_id
book_id
start_chapter
start_verse
end_chapter
end_verse
title
content
```

Relationships:

```text
Commentary → Many Commentary Entries
Bible Book → Many Commentary Entries
```

There is no separate `Bible Passages` table.

Passage relationships are represented using:

```text
book_id
start_chapter
start_verse
end_chapter
end_verse
```

This allows an entry to cover:

- One verse
- Multiple verses
- A chapter
- A range spanning chapters

Example:

```text
Romans 8:28–30
```

A selected Bible verse can therefore be matched against commentary entries by determining whether its chapter and verse fall inside an entry's stored passage range.

### 8.9 Users

Stores registered-user information.

Authentication data includes:

```text
id
email
password_hash
created_at
updated_at
```

Passwords are never stored as plain text.

### 8.10 Notes

**Status: PLANNED**

Notes will belong to authenticated users and Bible passages.

Expected information includes:

```text
id
user_id
verse_id
content
created_at
updated_at
```

Users must only be able to access their own notes.

### 8.11 Bookmarks

**Status: PLANNED**

Bookmarks will allow authenticated users to save Bible passages.

Expected information includes:

```text
id
user_id
verse_id
created_at
```

Users must only be able to access their own bookmarks.

### 8.12 Entity Relationship Overview

```text
Bible Translations
        │
        └──── Bible Verses
                    │
Bible Books         │
    │               │
    └── Bible Chapters
            │
            └──── Bible Verses


Sources
   │
   └── Commentaries
           │
           └── Commentary Entries
                    │
                    └── Bible Books


Users
   │
   ├── Notes        [planned]
   └── Bookmarks    [planned]
```

---

## 9. Bible Content Architecture

### 9.1 Status

**Status: IMPLEMENTED**

The current development database contains four Bible translations:

- BSB
- WEB
- KJV
- ASV

Bible books and chapters are shared structural entities.

Bible verse text is translation-specific.

This prevents duplicate book/chapter structures for every translation.

### 9.2 Translation Model

Conceptually:

```text
Bible Book
   ↓
Bible Chapter
   ↓
Bible Verse ← Bible Translation
```

For example:

```text
Romans
  ↓
Chapter 8
  ↓
Verse 28
  ├── BSB text
  ├── WEB text
  ├── KJV text
  └── ASV text
```

### 9.3 Bible Import

Bible translations are imported from structured spreadsheet datasets.

The importer:

- Identifies the translation
- Prevents unintended duplicate imports
- Maps books to database records
- Maps chapters to shared chapter records
- Inserts translation-specific verses
- Reports import progress and errors

Additional translations can use the same architecture without redesigning the Bible schema.

---

## 10. Commentary Architecture

### 10.1 Status

**Status: IMPLEMENTED / UX IMPROVEMENTS IN PROGRESS**

Two complete commentary collections are currently integrated:

1. Matthew Henry's Complete Commentary
2. Jamieson-Fausset-Brown Commentary

Both cover all 66 Bible books.

### 10.2 Normalized Commentary Format

Commentary datasets are normalized into per-book JSON.

General structure:

```json
{
  "book": "Genesis",
  "commentary": "Commentary Name",
  "author": "Author Name",
  "entries": [
    {
      "start_chapter": 1,
      "start_verse": 1,
      "end_chapter": 1,
      "end_verse": 2,
      "title": "Section title",
      "content": "Commentary content"
    }
  ]
}
```

This gives different commentary datasets a shared structure before they enter PostgreSQL.

### 10.3 Universal Commentary Importer

**Status: IMPLEMENTED**

Gnosis includes a reusable commentary importer:

```text
backend/src/importer/importCommentary.js
```

The importer accepts:

```text
dataset folder
commentary ID
```

It:

- Reads normalized commentary JSON
- Ignores non-commentary files where appropriate
- Maps Bible book names to database IDs
- Inserts passage ranges
- Inserts titles and content
- Avoids duplicate commentary entries
- Reports import progress

This architecture allows future public-domain commentary datasets to be added without creating a completely separate importer for every source.

### 10.4 Commentary Retrieval

When a user opens a chapter, the backend retrieves entries whose ranges overlap that chapter.

Conceptually:

```text
entry.start_chapter <= requested chapter
AND
entry.end_chapter >= requested chapter
```

Entries are ordered by passage location.

### 10.5 Verse-to-Commentary Matching

**Status: BACKEND CAPABILITY EXISTS / FRONTEND UX IN PROGRESS**

Because commentary entries contain passage ranges, Gnosis can determine which commentary entry covers a selected verse.

Planned frontend behavior:

```text
User selects Bible verse
        ↓
Determine commentary entry covering verse
        ↓
Bring relevant entry into view
        ↓
Visually emphasize relevant commentary section
```

The rest of the chapter commentary should remain available so users retain surrounding context.

---

## 11. Search Architecture

### 11.1 Technology

**Status: IMPLEMENTED**

Gnosis uses PostgreSQL Full-Text Search for MVP search functionality.

This avoids introducing a separate search engine during the MVP.

### 11.2 Bible Search

**Status: IMPLEMENTED END-TO-END**

Users can:

- Search Bible text
- View matching verses
- Select a result
- Navigate directly to its book and chapter
- Highlight/select the matching verse

### 11.3 Commentary Search

**Status: BACKEND IMPLEMENTED / FRONTEND PENDING**

The backend can search commentary content.

Remaining work includes:

- Commentary search UI
- Result presentation
- Source information
- Passage information
- Navigation from commentary search results to StudyPage

### 11.4 Future Search Improvements

Potential future improvements include:

- Relevance tuning
- Fuzzy search
- Advanced filters
- Search by source
- Search by translation
- Semantic search
- Dedicated search infrastructure if dataset scale requires it

Semantic/vector search is not required for the MVP.

---

## 12. Authentication & Authorization

### 12.1 Backend Authentication

**Status: IMPLEMENTED**

Authentication uses:

| Component | Technology |
|---|---|
| Password hashing | bcrypt |
| Authentication | JWT |
| Protected requests | JWT middleware |
| Database | PostgreSQL users table |

Backend functionality includes:

- Registration
- Login
- Password hashing
- JWT generation
- JWT verification
- Protected profile access

### 12.2 Frontend Authentication

**Status: PLANNED / PARTIALLY PREPARED**

The frontend contains profile-related UI but complete authentication state and workflows have not yet been integrated.

Remaining work includes:

- Registration UI
- Login UI
- Authentication service
- Authentication context/state
- Token persistence
- Authenticated profile state
- Logout
- Authentication error handling
- Protected personal-study features

### 12.3 Authorization

Notes and bookmarks will require authentication.

The backend must enforce ownership:

```text
User
 ↓
JWT
 ↓
Authentication Middleware
 ↓
Verified User ID
 ↓
Protected Database Query
```

A user must never be able to retrieve, update, or delete another user's personal study data.

---

## 13. Personal Study Features

### 13.1 Notes

**Status: PLANNED**

Users will be able to:

- Attach notes to Bible passages
- View saved notes
- Edit notes
- Delete notes
- Return from a note to its Bible passage

### 13.2 Bookmarks

**Status: PLANNED**

Users will be able to:

- Bookmark Bible passages
- View saved bookmarks
- Remove bookmarks
- Return from bookmarks to the relevant passage

### 13.3 Account Requirement

Notes and bookmarks require an authenticated account because they contain user-specific persistent data.

---

## 14. Content Integration & Licensing

### 14.1 Content Strategy

Gnosis stores core Bible and commentary content locally in PostgreSQL rather than depending on external APIs for the primary reading experience.

Benefits include:

- Predictable availability
- Faster local retrieval
- Unified passage structure
- Full-text search
- Commentary-to-passage matching
- Reduced dependency on third-party APIs

### 14.2 Current Bible Content

Current development content:

- Berean Standard Bible
- World English Bible
- King James Version
- American Standard Version

Licensing and distribution rights must be reviewed and documented for every translation before public production distribution.

Modern copyrighted translations such as NIV, ESV, and NLT must not be imported into the production database without appropriate authorization or licensing.

### 14.3 Current Commentary Content

Current commentary sources:

- Matthew Henry's Complete Commentary
- Commentary Critical and Explanatory on the Whole Bible (Jamieson-Fausset-Brown)

These classic commentary datasets are being used as public-domain content sources.

### 14.4 Content Acquisition Principles

Content added to Gnosis should:

- Come from legally usable sources
- Have documented attribution
- Have documented licensing status
- Be converted into normalized application formats
- Be validated before database import
- Preserve source identity

---

## 15. Security

### 15.1 Current Security Foundation

**Status: PARTIALLY IMPLEMENTED**

Current security measures include:

- bcrypt password hashing
- JWT authentication
- Authentication middleware
- Parameterized PostgreSQL queries
- Environment-variable configuration
- `.env` excluded from Git
- Sensitive configuration not committed to repository history

### 15.2 Production Security Requirements

Before production launch, Gnosis must additionally verify:

- Request validation
- Input sanitization where appropriate
- Secure authentication configuration
- JWT expiration strategy
- Proper authorization checks
- Production CORS configuration
- HTTPS
- Secure environment-variable management
- Error-response hygiene
- Dependency security
- Rate limiting where appropriate
- Database backups

---

## 16. Testing Strategy

### 16.1 Current Status

**Status: MANUAL TESTING IMPLEMENTED / AUTOMATED TESTING PLANNED**

Core functionality is currently verified manually during development.

A baseline smoke test has verified:

- Bible book navigation
- Chapter navigation
- Verse selection
- Previous/next chapter navigation
- BSB
- WEB
- KJV
- ASV
- Matthew Henry commentary
- JFB commentary
- Commentary switching
- Bible search
- Search-result navigation
- Selected search-result verse behavior
- Responsive layout
- Light mode
- Dark mode

### 16.2 Backend Automated Testing

**Status: PLANNED**

Planned tools:

- Jest
- Supertest

Important backend tests should cover:

- Bible endpoints
- Commentary endpoints
- Search endpoints
- Authentication
- Authorization
- Notes
- Bookmarks
- Invalid requests
- Error handling

### 16.3 Frontend Automated Testing

**Status: PLANNED**

Planned tools:

- Vitest
- React Testing Library

Important frontend tests should cover:

- Navigation
- Translation switching
- Verse selection
- Commentary switching
- Search
- Authentication
- Notes
- Bookmarks

### 16.4 Manual QA

Before MVP deployment, Gnosis should be manually tested across:

- Desktop
- Tablet
- Mobile
- Supported browsers
- Light mode
- Dark mode

---

## 17. Deployment Architecture

### 17.1 Current Status

**Status: PLANNED**

Gnosis currently runs locally during development.

Production infrastructure has not yet been selected.

### 17.2 Production Requirements

Production deployment will require:

```text
Frontend Hosting
       ↓
Backend Hosting
       ↓
PostgreSQL Hosting
```

Additional requirements:

- HTTPS
- Environment-variable management
- Database backups
- Logging
- Monitoring
- Production CORS configuration
- Deployment workflow

### 17.3 Deployment Decisions Still Open

| Item | Status |
|---|---|
| Frontend host | TBD |
| Backend host | TBD |
| PostgreSQL host | TBD |
| CI/CD strategy | TBD |
| Monitoring | TBD |
| Backup strategy | TBD |

Deployment decisions will be finalized during the MVP release phase.

---

## 18. Future AI & RAG Architecture

### 18.1 Status

**Status: FUTURE — NOT PART OF MVP**

AI functionality will not be added until the core Bible study application is stable.

### 18.2 Long-Term Goal

A future Gnosis research assistant may use Retrieval-Augmented Generation.

Conceptually:

```text
User Question
      ↓
Passage / Resource Retrieval
      ↓
Relevant Bible + Commentary Sources
      ↓
AI Model
      ↓
Grounded Response + Citations
```

### 18.3 Potential Components

Future architecture may include:

- AI model
- Embedding generation
- Vector search
- Vector database
- Source retrieval
- Citation generation
- Semantic Bible/commentary search

### 18.4 Design Principle

AI should augment the existing source-based study experience rather than replace Scripture or commentary retrieval.

The existing normalized Bible and commentary architecture should serve as the content foundation for future retrieval systems.

---

## 19. Project Structure

Current high-level repository structure:

```text
Bible_Commentary_App/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── data/
│   │   ├── db/
│   │   ├── importer/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   └── server.js
│   │
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── Commentary/
│   │   │   ├── Header/
│   │   │   ├── Navigation/
│   │   │   └── Scripture/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   └── package.json
│
├── database/
│   └── schema.sql
│
├── docs/
│   ├── Technical_Design.md
│   └── Development Roadmap
│
├── matthew-henry-json/
│
├── jfb-json/
│
└── .gitignore
```

`.env` is used locally but is excluded from Git.

---

## 20. Technical Decisions

| Decision | Choice | Status |
|---|---|---|
| Frontend | React + Vite | Decided / Implemented |
| Frontend Language | JavaScript | Decided / Implemented |
| Styling | Tailwind CSS + CSS variables | Decided / Implemented |
| Routing | React Router | Decided / Implemented |
| Backend | Node.js + Express | Decided / Implemented |
| Database | PostgreSQL | Decided / Implemented |
| Architecture | PERN | Decided / Implemented |
| API Style | REST | Decided / Implemented |
| Database Query Layer | Raw `pg` | Decided / Implemented |
| Authentication | bcrypt + JWT | Backend Implemented |
| Search | PostgreSQL Full-Text Search | Implemented |
| Bible Content | BSB, WEB, KJV, ASV | Implemented |
| Commentary Content | Matthew Henry + JFB | Implemented |
| Commentary Storage | Passage-range entries | Implemented |
| Commentary Import | Normalized JSON + reusable importer | Implemented |
| Theme | Light + Dark | Implemented |
| Responsive UI | Desktop + Tablet + Mobile | Implemented / Ongoing QA |
| Frontend Testing | Vitest + React Testing Library | Planned |
| Backend Testing | Jest + Supertest | Planned |
| Notes | PostgreSQL + authenticated REST API | Planned |
| Bookmarks | PostgreSQL + authenticated REST API | Planned |
| Hosting | TBD | Open |
| AI Model | TBD | Future |
| Vector Search | TBD | Future |

---

## 21. Current Implementation Status

| Area | Status |
|---|---|
| Project foundation | IMPLEMENTED |
| PostgreSQL schema | IMPLEMENTED |
| Bible API | IMPLEMENTED |
| Bible reader | IMPLEMENTED |
| Four Bible translations | IMPLEMENTED |
| Matthew Henry commentary | IMPLEMENTED |
| JFB commentary | IMPLEMENTED |
| Universal commentary importer | IMPLEMENTED |
| Commentary switching | IMPLEMENTED |
| Bible search backend | IMPLEMENTED |
| Bible search frontend | IMPLEMENTED |
| Commentary search backend | IMPLEMENTED |
| Commentary search frontend | PARTIALLY IMPLEMENTED / PENDING |
| Backend authentication | IMPLEMENTED |
| Frontend authentication | PENDING |
| Notes | PLANNED |
| Bookmarks | PLANNED |
| Automated testing | PLANNED |
| Production deployment | PLANNED |
| AI / RAG | FUTURE |

---

## 22. Open Technical Questions

The following decisions remain open:

- Which services will host the frontend, backend, and PostgreSQL database?
- What CI/CD workflow will be used?
- What production monitoring and logging tools will be used?
- What database backup strategy will be used?
- How will production content updates and migrations be managed?
- Which additional public-domain Bible translations should be added?
- Which additional commentary resources should be added?
- Which copyrighted Bible translations should be pursued through licensing?
- How should commentary search results integrate with the StudyPage UX?
- What JWT storage and expiration strategy should be used in the production frontend?
- What AI provider/model should eventually support the research assistant?
- Will PostgreSQL vector capabilities be sufficient for future RAG, or will a dedicated vector database be needed?

---

## 23. Near-Term Technical Priorities

The immediate MVP technical sequence is:

1. Finish commentary UX and selected-verse/commentary integration
2. Complete commentary-search frontend
3. Integrate frontend authentication
4. Implement notes
5. Implement bookmarks
6. Add automated tests
7. Perform security hardening
8. Complete responsive/browser QA
9. Deploy the MVP

Additional content expansion and AI functionality should not block the initial MVP.

---

## 24. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1 | Aug 26, 2026 | Initial technical design created | Yonatan Demissie |
| 0.2 | Aug 26, 2026 | Expanded database design, content integration, authentication, and API planning | Yonatan Demissie |
| 0.3 | Aug 26, 2026 | Finalized initial database structure, API design, authentication, search, and development decisions | Yonatan Demissie |
| 0.4 | Sep 17, 2026 | Updated technical design to reflect implemented Gnosis architecture, four Bible translations, Matthew Henry and JFB commentary integration, reusable commentary importing, search, backend authentication, responsive UI, themes, current MVP status, and remaining technical work | Yonatan Demissie |