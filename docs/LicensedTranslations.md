# Licensed translations (ESV, NIV, NLT, NKJV, NASB)

Gnosis ships four stored translations (BSB, WEB, KJV, ASV) as full text in
`bible_verses`. The five licensed translations work differently: their
publishers forbid storing the full text, so each chapter is fetched live
from the publisher's own API and only a bounded, expiring cache is kept.
This document is the operator guide: where the text comes from, what the
licences allow, how to add the keys, and how to remove a translation.

## The five, and where each comes from

| Translation | Provider | Key env var | Free tier |
| --- | --- | --- | --- |
| ESV | Crossway ESV API (`api.esv.org`) | `ESV_API_KEY` | 5,000 queries/day, non-commercial |
| NIV | API.Bible (`scripture.api.bible`) | `API_BIBLE_KEY` + `API_BIBLE_NIV_ID` | Starter: 3 licensed Bibles, 5,000 calls/month, non-commercial |
| NKJV | API.Bible | `API_BIBLE_KEY` + `API_BIBLE_NKJV_ID` | Same Starter plan |
| NASB 2020 | API.Bible | `API_BIBLE_KEY` (+ `API_BIBLE_NASB_ID`, default `a761ca71e0b3ddcf-01`) | Same Starter plan |
| NLT | Tyndale NLT API (`api.nlt.to`) | `NLT_API_KEY` | 5,000 requests/day, non-commercial |

API.Bible's free Starter plan allows exactly 3 licensed Bibles, which is
why NLT goes through Tyndale's own API instead of taking a fourth
Starter pick. ESV is not on API.Bible at all — Crossway runs its own API.

## Getting the keys (all free, non-commercial)

1. **ESV** — sign up at <https://api.esv.org/> and create an API
   application. The key appears on the account page. Crossway asks you
   to agree to its statement of faith as part of sign-up.
2. **API.Bible** — sign up at <https://scripture.api.bible>, pick the
   free Starter plan, and choose NIV, NKJV and NASB 2020 as the 3
   licensed Bibles. Accounts are approved by hand, so this can take a
   day. The dashboard shows each Bible's ID: copy the NIV and NKJV IDs
   into `API_BIBLE_NIV_ID` / `API_BIBLE_NKJV_ID`. NASB 2020's ID is the
   default above and only needs overriding if it changes.
3. **NLT** — sign up at <https://api.nlt.to/> (the sign-up page). The
   key arrives by email.

Put the keys in Vercel as environment variables on the **gnosis-api**
project, Preview first (and Production only when the feature is
promoted). Keys are never committed and never appear in logs. Until the
keys are set, the licensed translations are simply not listed — the site
behaves exactly as it did with four translations.

## How a chapter is served

`GET /bible/:book/:chapter/:translation` routes by the translation row's
`source`: `database` reads `bible_verses` as before; anything else goes
through `backend/src/services/licensed/licensedTranslations.js`:

1. **Server cache** (`licensed_chapter_cache`, one row per
   translation/book/chapter actually opened). A row is fresh for **30
   days** — the longest API.Bible's terms allow — then it is refetched.
   ESV rows are additionally capped at **500 verses stored in total**
   (oldest chapters evicted first), per Crossway's terms.
2. **Quota guard** (`licensed_api_usage`). API.Bible stops at 4,500 calls
   in the month, ESV and NLT at 4,500 a day — 500 short of the real
   limits, so a burst cannot spend the last calls. Past the budget the
   endpoint answers 503 and the reader falls back to BSB.
3. **Per-visitor limit** (`licensed_ip_limits`). One visitor may trigger
   at most 30 *uncached* licensed fetches an hour. Cached chapters are
   free and unlimited, so only calls that would reach a publisher count.
   Visitor addresses are HMAC-hashed with `RATE_LIMIT_KEY_SECRET`;
   raw IPs are never stored.
4. **In-flight coalescing.** Simultaneous requests for the same uncached
   chapter share one provider call.
5. **Provider fetch** (one call per chapter, never per verse, never
   prefetched, never all translations at once). API.Bible requests carry
   `fums-version=3` and each display is reported to FUMS with the
   `fumsToken` from the response (best-effort, never blocking).
6. **Browser memory.** The frontend keeps the last 20 chapters in
   memory for the visit (never persisted), so moving between chapters
   does not re-fetch.

Search stays on the four stored translations: searching licensed text
through the APIs would burn quota and the licences' verse limits make
full-text search impractical. The study endpoint (commentary view) also
keeps using the stored text.

## Attribution

Every licensed passage shows its publisher notice under the text
(`notice` on the translation row, rendered by `ScripturePanel`), with
the link the licence asks for (`notice_url`): esv.org for ESV,
lockman.org for NASB, api.bible for NIV/NKJV (Starter-plan citation).
NLT carries no link requirement.

## Removing a translation (the kill-switch)

One SQL statement, no code change, no redeploy:

```sql
UPDATE bible_translations SET enabled = false WHERE abbreviation = 'ESV';
```

The chapter endpoint stops serving it and `/translations` stops listing
it. To remove it entirely, also delete its row and its cache rows:

```sql
DELETE FROM licensed_chapter_cache WHERE translation_id = 5;
DELETE FROM bible_translations WHERE abbreviation = 'ESV';
```

## Going commercial

The free terms end if Gnosis ever charges, runs ads, or takes
sponsorships. Then each translation needs a paid licence: ESV from
Crossway directly; NLT through API.Bible Pro (or Tyndale); NIV **not**
through API.Bible — commercial NIV needs permission from Biblica
directly. Until a paid licence is in place, flip the translation off
with the kill-switch above.

## Operator steps at deploy time

The migration creates the tables but, like the earlier auth migrations,
carries no grants. The app role needs:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON licensed_chapter_cache TO gnosis_app;
GRANT SELECT, INSERT, UPDATE ON licensed_api_usage TO gnosis_app;
GRANT SELECT, INSERT, UPDATE ON licensed_ip_limits TO gnosis_app;
```

(Use `gnosis_preview_app` on the preview branch.) The restricted role
already has `SELECT` on `bible_translations`.

## Terms, read 2026-11-06

Re-read these before changing a cap, a TTL, or a notice:

- ESV: <https://api.esv.org/> (500 verses/query, 5,000/day, 500 verses
  stored, attribution + esv.org link).
- API.Bible terms: <https://api.bible/terms-and-conditions>, FAQ:
  <https://api.bible/faq>, FUMS guide:
  <https://docs.api.bible/guides/fair-use/> (30-day cache refresh,
  FUMS reporting, Starter citation link).
- NLT: <https://api.nlt.to/> (500 verses/request, 5,000/day with a key,
  non-commercial) and Tyndale permissions:
  <https://tyndale.com/permissions>.
- NIV (Biblica): <https://www.biblica.com/permissions/>.
