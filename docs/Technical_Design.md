# Bible Commentary App — Technical Design

**Version:** 0.3
**Status:** Draft
**Date:** August 26, 2026
**Owner:** Yonatan Demissie

---

## 1. Technology Stack

### 1.1 Frontend

* React
* JavaScript
* Responsive web design

### 1.2 Backend

* Node.js
* Express.js
* REST API

### 1.3 Database

* PostgreSQL

### 1.4 Development Environment

* Visual Studio Code (VS Code)
* Git
* GitHub

### 1.5 Architecture

The application will use a PERN stack architecture:

**React → Express/Node.js → PostgreSQL**

---

## 2. System Architecture

### 2.1 Frontend

The React frontend will provide the user interface for:

* Bible reading
* Commentary viewing
* Commentary selection
* Commentary comparison
* Search
* Research features

### 2.2 Backend

The Node.js/Express backend will:

* Provide REST APIs
* Retrieve Bible and commentary data
* Communicate with PostgreSQL
* Handle authentication
* Validate requests
* Integrate external APIs and services

### 2.3 Database

PostgreSQL will store and manage:

* Bible content
* Commentary content
* Source information
* User accounts
* Personal study data

---

## 3. API Design

The backend will provide a REST API that allows the React frontend to communicate with the Node.js/Express server and PostgreSQL database.

### 3.1 Bible Endpoints

| Method | Endpoint                          | Purpose                          |
| ------ | --------------------------------- | -------------------------------- |
| GET    | `/api/translations`               | Get available Bible translations |
| GET    | `/api/books`                      | Get all Bible books              |
| GET    | `/api/books/:bookId/chapters`     | Get chapters for a book          |
| GET    | `/api/chapters/:chapterId/verses` | Get verses for a chapter         |

### 3.2 Commentary Endpoints

| Method | Endpoint                                  | Purpose                            |
| ------ | ----------------------------------------- | ---------------------------------- |
| GET    | `/api/commentaries`                       | Get available commentaries         |
| GET    | `/api/commentaries/:commentaryId`         | Get information about a commentary |
| GET    | `/api/commentaries/:commentaryId/entries` | Get commentary entries             |
| GET    | `/api/chapters/:chapterId/commentaries`   | Get commentary for a chapter       |

### 3.3 Search Endpoints

| Method | Endpoint                 | Purpose                   |
| ------ | ------------------------ | ------------------------- |
| GET    | `/api/search/bible`      | Search Bible content      |
| GET    | `/api/search/commentary` | Search commentary content |

### 3.4 Authentication Endpoints

| Method | Endpoint             | Purpose                                  |
| ------ | -------------------- | ---------------------------------------- |
| POST   | `/api/auth/register` | Create a user account                    |
| POST   | `/api/auth/login`    | Authenticate a user                      |
| GET    | `/api/auth/me`       | Get the authenticated user's information |

### 3.5 Notes & Bookmark Endpoints

| Method | Endpoint                     | Purpose                  |
| ------ | ---------------------------- | ------------------------ |
| GET    | `/api/notes`                 | Get the user's notes     |
| POST   | `/api/notes`                 | Create a note            |
| PUT    | `/api/notes/:noteId`         | Update a note            |
| DELETE | `/api/notes/:noteId`         | Delete a note            |
| GET    | `/api/bookmarks`             | Get the user's bookmarks |
| POST   | `/api/bookmarks`             | Create a bookmark        |
| DELETE | `/api/bookmarks/:bookmarkId` | Delete a bookmark        |

### 3.6 API Design Principles

* Use standard HTTP methods and status codes
* Return data in JSON format
* Validate incoming requests on the backend
* Use parameterized queries to protect against SQL injection
* Require JWT authentication for protected user endpoints
* Return clear error messages when requests fail
* Keep API endpoints organized by resource

### 3.7 Example Request

When a user selects Romans Chapter 8:

```text
React
  ↓
GET /api/books/45/chapters
  ↓
Express
  ↓
PostgreSQL
  ↓
Chapter data
  ↓
React
```

The frontend can then request the verses and corresponding commentary for the selected chapter.

---

## 4. Database Design

The database will use a relational structure to connect Bible translations, passages, commentaries, and users.

### 4.1 Entities

| Entity             | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| Users              | Stores user account information                                                |
| Bible Translations | Stores supported Bible translations, such as BSB                               |
| Bible Books        | Stores the 66 Bible books independently of translations                        |
| Bible Chapters     | Stores chapters belonging to books                                             |
| Bible Verses       | Stores translation-specific verse text                                         |
| Commentaries       | Stores commentary sources, such as Matthew Henry, John Wesley, and Adam Clarke |
| Commentary Entries | Stores commentary content and the Bible passage it covers                      |
| Sources            | Stores author, publisher, and licensing information                            |
| Notes              | Stores user notes linked to Bible passages                                     |
| Bookmarks          | Stores user-saved Bible passages                                               |

### 4.2 Relationships

| From               | To                 | Type        |
| ------------------ | ------------------ | ----------- |
| Bible Translations | Bible Verses       | One-to-many |
| Bible Books        | Bible Chapters     | One-to-many |
| Bible Chapters     | Bible Verses       | One-to-many |
| Commentaries       | Commentary Entries | One-to-many |
| Bible Passages     | Commentary Entries | One-to-many |
| Sources            | Commentaries       | One-to-many |
| Users              | Notes              | One-to-many |
| Users              | Bookmarks          | One-to-many |
| Bible Verses       | Notes              | One-to-many |
| Bible Verses       | Bookmarks          | One-to-many |

### 4.3 Commentary Passage Structure

Commentary entries may cover a single verse, a range of verses, or an entire chapter.

Each commentary entry will store:

* Book
* Starting chapter and verse
* Ending chapter and verse
* Commentary content

**Example:** Romans 8:28–30 → Matthew Henry Commentary Entry

This allows the application to match commentary with the relevant Bible passage.

### 4.4 Translation Structure

Bible books will be independent of individual translations. For example, Romans → Chapter 8 → Verse 28 can have different text for:

* BSB
* ESV
* NIV
* Other future translations

This structure allows additional translations to be added without redesigning the database.

### 4.5 Data Structure

The core relationships are:

**Translation → Book → Chapter → Verse**

**Commentary → Commentary Entry → Bible Passage**

The application will use these relationships to automatically retrieve the appropriate commentary when a user selects a Bible chapter or passage.

### 4.6 Database Schema

The following sections define the database tables and their relationships for the Bible Commentary App. Each table includes its columns, primary keys, foreign keys, and relevant constraints.

#### 4.6.1 Bible Translations

Stores information about each Bible translation supported by the application.

| Column       | Data Type    | Key         | Description                           |
| ------------ | ------------ | ----------- | ------------------------------------- |
| id           | SERIAL       | Primary Key | Unique identifier for the translation |
| name         | VARCHAR(100) | —           | Full name of the translation          |
| abbreviation | VARCHAR(20)  | —           | Short identifier, such as BSB         |

**Initial Record**

| id | name                  | abbreviation |
| -- | --------------------- | ------------ |
| 1  | Berean Standard Bible | BSB          |

---

#### 4.6.2 Bible Books

Stores the 66 books of the Bible. Books are independent of translations so multiple translations can use the same book structure.

| Column       | Data Type   | Key         | Description                              |
| ------------ | ----------- | ----------- | ---------------------------------------- |
| id           | SERIAL      | Primary Key | Unique identifier for the book           |
| name         | VARCHAR(50) | —           | Full name of the book                    |
| abbreviation | VARCHAR(10) | —           | Short name of the book                   |
| testament    | VARCHAR(2)  | —           | Old Testament (OT) or New Testament (NT) |
| book_order   | INTEGER     | —           | Order of the book in the Bible           |

**Example Records**

| id | name       | abbreviation | testament | book_order |
| -- | ---------- | ------------ | --------- | ---------: |
| 1  | Genesis    | Gen          | OT        |          1 |
| 2  | Exodus     | Exod         | OT        |          2 |
| 40 | Matthew    | Matt         | NT        |         40 |
| 45 | Romans     | Rom          | NT        |         45 |
| 66 | Revelation | Rev          | NT        |         66 |

---

#### 4.6.3 Bible Chapters

Stores each chapter and connects it to a Bible book.

| Column         | Data Type | Key         | Description                       |
| -------------- | --------- | ----------- | --------------------------------- |
| id             | SERIAL    | Primary Key | Unique identifier for the chapter |
| book_id        | INTEGER   | Foreign Key | References the Bible Books table  |
| chapter_number | INTEGER   | —           | Chapter number within the book    |

**Example Records**

|  id | book_id | chapter_number |
| --: | ------: | -------------: |
|   1 |       1 |              1 |
|   2 |       1 |              2 |
|   3 |       1 |              3 |
| 999 |      45 |              8 |

**Relationship:** One Bible Book → Many Bible Chapters

*Example: Romans (book_id = 45) → Chapter 1, Chapter 2, … Chapter 16*

---

#### 4.6.4 Bible Verses

Stores the actual Bible text. Each verse belongs to a chapter and a specific translation.

| Column         | Data Type | Key         | Description                             |
| -------------- | --------- | ----------- | --------------------------------------- |
| id             | SERIAL    | Primary Key | Unique identifier for the verse         |
| chapter_id     | INTEGER   | Foreign Key | References the Bible Chapters table     |
| translation_id | INTEGER   | Foreign Key | References the Bible Translations table |
| verse_number   | INTEGER   | —           | Verse number within the chapter         |
| text           | TEXT      | —           | The actual Bible verse                  |

**Example Records**

|   id | chapter_id | translation_id | verse_number | text                |
| ---: | ---------: | -------------: | -----------: | ------------------- |
| 1001 |        999 |              1 |           28 | Bible verse text... |
| 1002 |        999 |              1 |           29 | Bible verse text... |
| 1003 |        999 |              1 |           30 | Bible verse text... |

**Relationships:**

* One Bible Chapter → Many Bible Verses
* One Bible Translation → Many Bible Verses

---

#### 4.6.5 Commentaries

Stores information about each commentary collection available in the application.

| Column      | Data Type    | Key         | Description                          |
| ----------- | ------------ | ----------- | ------------------------------------ |
| id          | SERIAL       | Primary Key | Unique identifier for the commentary |
| source_id   | INTEGER      | Foreign Key | References the Sources table         |
| title       | VARCHAR(200) | —           | Name of the commentary               |
| description | TEXT         | —           | Brief description of the commentary  |

**Example Records**

| id | source_id | title                           | description                      |
| -: | --------: | ------------------------------- | -------------------------------- |
|  1 |         1 | Matthew Henry's Commentary      | Commentary by Matthew Henry      |
|  2 |         2 | John Wesley's Explanatory Notes | Explanatory notes by John Wesley |
|  3 |         3 | Adam Clarke's Commentary        | Commentary by Adam Clarke        |

**Relationship:** One Source → Many Commentaries

*The `source_id` connects each commentary to information about its author, publisher, and licensing.*

---

#### 4.6.6 Commentary Entries

Stores the actual commentary text and connects it to the Bible passage it discusses.

| Column        | Data Type | Key         | Description                                |
| ------------- | --------- | ----------- | ------------------------------------------ |
| id            | SERIAL    | Primary Key | Unique identifier for the commentary entry |
| commentary_id | INTEGER   | Foreign Key | References the Commentaries table          |
| book_id       | INTEGER   | Foreign Key | References the Bible Books table           |
| start_chapter | INTEGER   | —           | First chapter covered by the entry         |
| start_verse   | INTEGER   | —           | First verse covered by the entry           |
| end_chapter   | INTEGER   | —           | Last chapter covered by the entry          |
| end_verse     | INTEGER   | —           | Last verse covered by the entry            |
| content       | TEXT      | —           | The actual commentary text                 |

**Example Record**

| id | commentary_id | book_id | start_chapter | start_verse | end_chapter | end_verse | content            |
| -: | ------------: | ------: | ------------: | ----------: | ----------: | --------: | ------------------ |
|  1 |             1 |      45 |             8 |          28 |           8 |        30 | Commentary text... |

*This example represents Matthew Henry's commentary on Romans 8:28–30.*

**Relationships:**

* One Commentary → Many Commentary Entries
* One Bible Book → Many Commentary Entries

*The chapter and verse range allows a commentary entry to cover a single verse, multiple verses, or an entire chapter.*

---

#### 4.6.7 Users

Stores account information for users who create accounts in the application.

| Column        | Data Type    | Key         | Description                                |
| ------------- | ------------ | ----------- | ------------------------------------------ |
| id            | SERIAL       | Primary Key | Unique identifier for the user             |
| email         | VARCHAR(255) | Unique      | User's email address                       |
| password_hash | VARCHAR(255) | —           | Hashed user password                       |
| created_at    | TIMESTAMP    | —           | Date and time the account was created      |
| updated_at    | TIMESTAMP    | —           | Date and time the account was last updated |

**Example Record**

| id | email                                       | password_hash   | created_at | updated_at |
| -: | ------------------------------------------- | --------------- | ---------- | ---------- |
|  1 | [user@example.com](mailto:user@example.com) | Hashed password | 2026-08-26 | 2026-08-26 |

**Relationships:**

* One User → Many Notes
* One User → Many Bookmarks

*Passwords will never be stored as plain text. Passwords will be hashed using bcrypt before being stored in the database.*

---

#### 4.6.8 Notes

Stores personal notes that users create while studying the Bible.

| Column     | Data Type | Key         | Description                             |
| ---------- | --------- | ----------- | --------------------------------------- |
| id         | SERIAL    | Primary Key | Unique identifier for the note          |
| user_id    | INTEGER   | Foreign Key | References the Users table              |
| verse_id   | INTEGER   | Foreign Key | References the Bible Verses table       |
| content    | TEXT      | —           | The user's note                         |
| created_at | TIMESTAMP | —           | Date and time the note was created      |
| updated_at | TIMESTAMP | —           | Date and time the note was last updated |

**Example Record**

| id | user_id | verse_id | content                                  | created_at | updated_at |
| -: | ------: | -------: | ---------------------------------------- | ---------- | ---------- |
|  1 |       1 |     1001 | Important connection to Paul's argument. | 2026-08-26 | 2026-08-26 |

**Relationships:**

* One User → Many Notes
* One Bible Verse → Many Notes

*Notes are private and can only be accessed by the user who created them.*

---

#### 4.6.9 Bookmarks

Stores Bible verses that users save for later reference.

| Column     | Data Type | Key         | Description                            |
| ---------- | --------- | ----------- | -------------------------------------- |
| id         | SERIAL    | Primary Key | Unique identifier for the bookmark     |
| user_id    | INTEGER   | Foreign Key | References the Users table             |
| verse_id   | INTEGER   | Foreign Key | References the Bible Verses table      |
| created_at | TIMESTAMP | —           | Date and time the bookmark was created |

**Example Record**

| id | user_id | verse_id | created_at |
| -: | ------: | -------: | ---------- |
|  1 |       1 |     1001 | 2026-08-26 |

**Relationships:**

* One User → Many Bookmarks
* One Bible Verse → Many Bookmarks

*A user can bookmark a verse and access it later from their saved study material.*

---

#### 4.6.10 Sources

Stores information about the authors, publishers, and licensing of Bible commentaries and other theological resources.

| Column      | Data Type    | Key         | Description                                    |
| ----------- | ------------ | ----------- | ---------------------------------------------- |
| id          | SERIAL       | Primary Key | Unique identifier for the source               |
| name        | VARCHAR(200) | —           | Name of the author, publisher, or organization |
| type        | VARCHAR(50)  | —           | Type of source, such as author or publisher    |
| description | TEXT         | —           | Additional information about the source        |
| license     | VARCHAR(200) | —           | Copyright or licensing information             |
| created_at  | TIMESTAMP    | —           | Date and time the source was added             |

**Example Records**

| id | name          | type   | description                                 | license       | created_at |
| -: | ------------- | ------ | ------------------------------------------- | ------------- | ---------- |
|  1 | Matthew Henry | Author | English biblical commentator                | Public Domain | 2026-08-26 |
|  2 | John Wesley   | Author | English theologian and biblical commentator | Public Domain | 2026-08-26 |
|  3 | Adam Clarke   | Author | Methodist theologian and biblical scholar   | Public Domain | 2026-08-26 |

**Relationships:**

* One Source → Many Commentaries
* One Source → Many Theological Resources

*This table allows the application to clearly identify where content comes from and store relevant licensing information.*

### 4.7 Entity Relationship Overview

```text
Users
 ├── Notes
 └── Bookmarks

Bible Translations
 └── Bible Verses
       ↑
Bible Books
 └── Bible Chapters
       └── Bible Verses

Commentaries
 └── Commentary Entries
       └── Bible Books

Sources
 └── Commentaries
```

---

## 5. Content Integration

The application will integrate Bible and commentary content from legally authorized sources.

### 5.1 Licensing Considerations

Most modern Bible translations (e.g., NIV, ESV, NLT) are copyrighted and require licensing agreements or API terms of use. Public-domain translations (e.g., KJV, ASV, WEB, Douay-Rheims) carry no licensing restriction and are the lowest-risk starting point for MVP development.

Commentary sources have similar constraints — many classic commentaries (e.g., Matthew Henry, Jamieson-Fausset-Brown) are public domain, while modern commentaries are typically copyrighted.

### 5.2 MVP Bible Translation

| Attribute   | Detail                                     |
| ----------- | ------------------------------------------ |
| Translation | Berean Standard Bible (BSB)                |
| License     | Public domain                              |
| Usage       | Free for commercial use                    |
| Integration | Store Bible text in PostgreSQL             |
| Future      | Additional translations can be added later |

### 5.3 MVP Content Sources

* **Bible:** Berean Standard Bible (BSB)
* **Commentary:** Matthew Henry's Commentary
* **Commentary:** John Wesley's Explanatory Notes
* **Commentary:** Adam Clarke's Commentary

The application will store and serve this content through the PostgreSQL database. Additional translations and commentary sources may be added after the MVP.

### 5.4 Content Acquisition

* Bible and commentary content will be obtained from legally authorized downloadable datasets
* Content will be imported and stored in PostgreSQL
* Bible verses and commentary entries will be structured around standardized book, chapter, and verse references
* The backend will serve the stored content through the application's REST API
* The application will not depend on external APIs for the core reading experience
* Content sources and licensing information will be documented before import

---

## 6. Authentication & Security

### 6.1 Authentication

The application will use self-managed authentication.

| Component          | Choice                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| Password Hashing   | bcrypt                                                                              |
| Authentication     | JWT                                                                                 |
| Session Management | JWT-based authentication                                                            |
| Protected Routes   | JWT authentication required for user-specific resources such as notes and bookmarks |

### 6.2 Security Requirements

The system will:

* Never store passwords in plain text
* Hash passwords using bcrypt before storing them
* Validate and sanitize incoming requests
* Protect authenticated API endpoints
* Use parameterized SQL queries to prevent SQL injection
* Store sensitive configuration and API credentials in environment variables
* Restrict users to their own personal study data
* Use HTTPS in production
* Return appropriate HTTP status codes for authentication and authorization failures

### 6.3 Authorization

The backend will verify the authenticated user's identity before allowing access to protected resources.

```text
User → JWT → Express Middleware → Verify User → Database
```

A user can only access, modify, or delete their own notes and bookmarks.

---

## 7. Search

The application will use PostgreSQL Full-Text Search for the MVP.

### 7.1 Search Features

Users will be able to:

* Search Bible verses by keyword
* Search commentary content
* Filter results by resource type
* View the source associated with each result
* Select a search result and navigate directly to the relevant passage

### 7.2 Search Technology

PostgreSQL's `tsvector` and `tsquery` functionality will be used to search indexed Bible and commentary text. This approach keeps the MVP architecture simple and avoids adding a separate search service.

### 7.3 Future Improvements

If the content library becomes significantly larger, a dedicated search engine may be considered for:

* More advanced filtering
* Faster searches across large datasets
* Relevance ranking
* Fuzzy search
* Advanced search features

---

## 8. AI & RAG

AI functionality is planned for a future version and is not required for the initial MVP.

The planned architecture will use Retrieval-Augmented Generation (RAG) to retrieve relevant Bible and theological resources before generating responses.

**Future components may include:**

* AI model
* Embeddings
* Vector database/search
* Source retrieval
* Citation generation

---

## 9. Hosting & Deployment

Hosting and deployment will be determined closer to the MVP launch.

### 9.1 Development Environment

Development will initially run locally using:

* React frontend
* Node.js/Express backend
* PostgreSQL database

### 9.2 Production Deployment

The production hosting provider and deployment configuration will be selected during the MVP launch phase.

**The production environment will require:**

* Frontend hosting
* Backend hosting
* PostgreSQL hosting
* Environment variable management
* HTTPS
* Database backups
* Application monitoring

### 9.3 Status

| Item                | Status |
| ------------------- | ------ |
| Hosting Provider    | TBD    |
| Deployment Strategy | TBD    |

### 9.4 Testing

The application will use automated and manual testing to verify core functionality.

**Backend**

* Jest
* Supertest

**Frontend**

* Vitest
* React Testing Library

**Manual Testing**

* Core MVP features will be manually tested across supported screen sizes and browsers

---

## 10. Development Structure

### 10.1 Project Structure

```text
Bible Commentary App/
│
├── frontend/
│   └── React application
│
├── backend/
│   └── Node.js/Express application
│
├── docs/
│   ├── PRD
│   ├── Development Roadmap
│   └── Technical Design
│
├── .gitignore
├── README.md
└── package.json
```

### 10.2 Frontend Structure

The React application will be responsible for:

* User interface
* Bible reader
* Commentary display
* Commentary selection
* Search interface
* User interactions

### 10.3 Backend Structure

The Node.js/Express application will be responsible for:

* REST API
* Business logic
* Authentication
* Database communication
* Search
* Request validation

### 10.4 Database

PostgreSQL will contain the application's persistent data, including Bible content, commentary content, and user study data.

---

## 11. Technical Decisions

| Decision             | Choice                                             | Status  |
| -------------------- | -------------------------------------------------- | ------- |
| Frontend             | React                                              | Decided |
| Backend              | Node.js + Express                                  | Decided |
| Database             | PostgreSQL                                         | Decided |
| Architecture         | PERN                                               | Decided |
| Language             | JavaScript                                         | Decided |
| IDE                  | VS Code                                            | Decided |
| API Style            | REST                                               | Decided |
| Database Query Layer | Raw `pg` (node-postgres)                           | Decided |
| Authentication       | bcrypt + JWT                                       | Decided |
| Search               | PostgreSQL Full-Text Search (`tsvector`/`tsquery`) | Decided |
| Bible Translation    | Berean Standard Bible (BSB)                        | Decided |
| Commentary Sources   | Matthew Henry, John Wesley, Adam Clarke            | Decided |
| Content Acquisition  | Downloadable datasets                              | Decided |
| Frontend Testing     | Vitest + React Testing Library                     | Decided |
| Backend Testing      | Jest + Supertest                                   | Decided |
| Hosting              | TBD                                                | Open    |
| AI Model             | TBD                                                | Future  |
| Vector Database      | TBD                                                | Future  |

---

## 12. Open Technical Questions

* Where will the application be hosted?
* How will the application handle content updates?
* What deployment and monitoring tools will be used?
* What additional Bible translations will be added after the MVP?
* What additional commentary and theological resources will be added?
* What AI model and infrastructure will be used for the future AI research assistant?
* Will a vector database be needed for the future RAG system?

---

## 13. Change Log

| Version | Date         | Change                                                                                      | Author           |
| ------- | ------------ | ------------------------------------------------------------------------------------------- | ---------------- |
| 0.1     | Aug 26, 2026 | Initial technical design created                                                            | Yonatan Demissie |
| 0.2     | Aug 26, 2026 | Expanded database design, content integration, authentication, and API planning             | Yonatan Demissie |
| 0.3     | Aug 26, 2026 | Finalized database structure, API design, authentication, search, and development decisions | Yonatan Demissie |
