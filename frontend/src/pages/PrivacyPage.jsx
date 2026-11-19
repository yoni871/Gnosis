import { Link } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import LandingFooter from "../components/LandingFooter";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";
import "./LandingPage.css";
import "./PrivacyPage.css";

// Public, indexable policy page. Every claim here must stay true to
// what the application actually does: no encryption-at-rest claims
// beyond what the hosting providers supply, no compliance
// certifications, no data practices that do not exist. If a practice
// changes, update this page in the same change.
export default function PrivacyPage() {
    return (
        <div className="public-page privacy-page">
            <Seo title="Privacy Policy | Gnosis"
                description="What Gnosis stores about your account and study, why, how long it is kept, and how to delete it."
                canonical={pageUrl("/privacy")} />
            <LandingHeader hero solid />
            <main id="landing-main" tabIndex={-1} className="privacy-layout">
                <h1>Privacy Policy</h1>
                <p className="privacy-updated">Last updated: November 19, 2026.</p>
                <p>
                    Gnosis is a Bible study application. This policy explains what data Gnosis
                    collects, why, how long it is kept, and how you can delete it.
                </p>

                <section aria-labelledby="privacy-collect-heading">
                    <h2 id="privacy-collect-heading">What we collect</h2>
                    <ul>
                        <li>
                            <strong>Account information.</strong> Your first and last name, your
                            email address, and a one-way hash of your password. Your password
                            itself is never stored, and it cannot be recovered from the hash.
                        </li>
                        <li>
                            <strong>Your study data.</strong> The notes, bookmarks, highlights,
                            and reading position you create while signed in.
                        </li>
                        <li>
                            <strong>Sessions.</strong> When you sign in, Gnosis keeps a session
                            record and a secure, HttpOnly refresh cookie so you can stay signed in
                            for up to 7 days. The short-lived access token stays in application memory.
                        </li>
                        <li>
                            <strong>Account security.</strong> If you enable two-factor authentication,
                            Gnosis stores an encrypted authenticator secret and hashed recovery codes.
                            We also store security event types and times linked to an account, and a
                            one-way device key derived from sign-in network and browser information
                            to identify new-device sign-ins.
                        </li>
                        <li>
                            <strong>Rate limiting.</strong> Authentication attempts are recorded
                            using keyed hashes derived from network or account identifiers, rather
                            than storing the raw IP address or email address in that table.
                        </li>
                        <li>
                            <strong>Browser preferences.</strong> Your browser stores your theme and
                            adjustable study-panel width locally.
                        </li>
                        <li>
                            <strong>Licensed content cache.</strong> When you open a chapter in a
                            licensed translation (ESV, NIV, NLT, NKJV, or NASB 2020), the chapter
                            text is cached on the server for up to 30 days so repeat visits do
                            not count against the publisher&apos;s quota. The cache is per
                            chapter, not per account.
                        </li>
                    </ul>
                </section>

                <section aria-labelledby="privacy-not-collect-heading">
                    <h2 id="privacy-not-collect-heading">What we do not collect</h2>
                    <p>
                        The application code does not include an analytics or advertising SDK.
                        We do not use your study data for advertising. Hosting and other service
                        providers may process technical request data needed to deliver the service;
                        their operational logs and retention are not controlled by this codebase.
                    </p>
                </section>

                <section aria-labelledby="privacy-third-parties-heading">
                    <h2 id="privacy-third-parties-heading">Who else handles your data</h2>
                    <ul>
                        <li><strong>Hosting:</strong> Vercel serves the site and the API.</li>
                        <li><strong>Database:</strong> Neon stores the data listed above.</li>
                        <li>
                            <strong>Email:</strong> Resend sends verification, password-reset,
                            and account-security notification emails, including new-device alerts.
                        </li>
                        <li>
                            <strong>Password screening:</strong> on registration and password reset,
                            the server sends the first five characters of a SHA-1 password digest
                            to Have I Been Pwned&apos;s range API. The full password and full digest
                            are not sent to that service.
                        </li>
                        <li>
                            <strong>Licensed Bible content:</strong> chapter requests go to the
                            ESV API, API.Bible, or the NLT API when you open a licensed
                            translation. Those requests carry no account information.
                        </li>
                    </ul>
                </section>

                <section aria-labelledby="privacy-retention-heading">
                    <h2 id="privacy-retention-heading">How long we keep data</h2>
                    <ul>
                        <li>Sessions expire after 7 days. Email-verification links expire after 24 hours, password-reset links after 1 hour, and MFA login challenges after 10 minutes. Expiry does not by itself establish when their database rows are removed.</li>
                        <li>Your notes, bookmarks, highlights, and reading position are kept until you delete them or delete your account.</li>
                        <li>Rate-limit attempts are counted within windows of up to 60 minutes and are subject to a database sweep. Licensed chapter cache entries are refreshed or cleared after up to 30 days.</li>
                        <li>The repository does not verify the retention periods for security events, device records, provider logs, or backups.</li>
                    </ul>
                </section>

                <section aria-labelledby="privacy-deletion-heading">
                    <h2 id="privacy-deletion-heading">Deleting your account</h2>
                    <p>
                        In <Link to="/settings">Settings</Link>, under Delete account, you can
                        delete your account yourself. It asks for your current password, then
                        deletes your account and its linked study data and sessions from the
                        application database. This cannot be undone through the app.
                    </p>
                    <p>
                        Copies may remain temporarily in provider backups or operational logs.
                        Their exact retention and deletion timing cannot be verified from the
                        application code.
                    </p>
                    <p>
                        The account-deletion transaction does not delete the separate security
                        event and known-device tables. Those records may retain a historical
                        account identifier or one-way device key after account deletion; the
                        repository does not establish a retention period for them.
                    </p>
                </section>

                <section aria-labelledby="privacy-contact-heading">
                    <h2 id="privacy-contact-heading">Contact</h2>
                    <p>
                        Questions about this policy or your data: open an issue at{" "}
                        <a href="https://github.com/yoni871/Gnosis">github.com/yoni871/Gnosis</a>.
                        If you cannot sign in, use that same channel to ask for help deleting
                        your account.
                    </p>
                </section>

                <section aria-labelledby="privacy-changes-heading">
                    <h2 id="privacy-changes-heading">Changes to this policy</h2>
                    <p>If this policy changes, the updated version will be posted here.</p>
                </section>
            </main>
            <LandingFooter />
        </div>
    );
}
