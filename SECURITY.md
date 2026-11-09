# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in Gnosis, please report it privately —
**do not open a public GitHub issue**, and do not post details publicly
until a fix is available (see "Coordinated disclosure" below).

Contact: **[SECURITY-CONTACT — TO BE CONFIRMED BY YONATAN]**

> This contact is a placeholder. The maintainer will replace it with the real
> private reporting address before this policy is treated as final.

## What happens next

> **Proposed, not yet decided:** the response times below are a proposal for
> the maintainer to confirm. They are not a commitment until confirmed.

- We aim to acknowledge your report within **3 business days**.
- We aim to send an initial assessment (whether the issue is confirmed, and
  roughly how severe it is) within **7 calendar days**.
- We will keep you updated while a fix is prepared, and let you know when
  it is released.

## Scope

**In scope:**

- The Gnosis web app and API (the code in this repository and the deployed
  app at studygnosis.com).
- Vulnerabilities in authentication, sessions, user data handling, and
  access control.

**Out of scope:**

- Third-party services (hosting, email, database, or translation providers)
  — report those to the provider.
- Physical attacks, social engineering, and phishing of individual users.
- Denial-of-service attacks.
- Issues that are already known or have already been reported.
- Automated scanner output with no demonstrated impact on Gnosis.

## Safe harbor

We will not take legal action against, or take account action against, anyone
who researches Gnosis in good faith under this policy. Good-faith research
means you:

- do **not** access, modify, or delete other users' data;
- do **not** degrade the service for other users;
- do **not** exfiltrate more data than is needed to demonstrate the issue;
- report what you find privately and promptly, and give us a reasonable
  time to fix it before any public disclosure.

## What to include in a report

- A description of the vulnerability and its impact.
- Steps to reproduce it.
- The affected URLs, pages, or API endpoints, and the app version if known.
- Any suggested fix, if you have one.
- Whether you would like public credit for the report (and under what name).

## Coordinated disclosure

Please do not disclose a vulnerability publicly before a fix is available
and an agreed disclosure window has passed. We will agree a disclosure
date with you once the fix is ready. If you would like credit, we will
credit you by your chosen name in the fix announcement or release notes.

## Context

A security audit of this project (2026-11-09) found the authentication core
sound, but the project is not yet open to public user registration. This
policy exists so that anyone who finds a problem reports it privately
instead of exploiting it or posting it publicly.
