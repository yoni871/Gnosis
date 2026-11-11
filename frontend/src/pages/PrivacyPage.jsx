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
                <p className="privacy-updated">Last updated: November 9, 2026.</p>
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
                            record so you stay signed in for up to 7 days.
                        </li>
                        <li>
                            <strong>Security records.</strong> Sign-in rate limiting is recorded
                            as one-way hashes, never your raw IP address or email address, and
                            kept for at most 60 minutes.
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
                        Gnosis runs no analytics, no advertising, and no third-party trackers.
                        We do not sell or share your personal data.
                    </p>
                </section>

                <section aria-labelledby="privacy-third-parties-heading">
                    <h2 id="privacy-third-parties-heading">Who else handles your data</h2>
                    <ul>
                        <li><strong>Hosting:</strong> Vercel serves the site and the API.</li>
                        <li><strong>Database:</strong> Neon stores the data listed above.</li>
                        <li>
                            <strong>Email:</strong> Resend sends verification and password-reset
                            emails, and nothing else.
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
                        <li>Sessions: 7 days. Email-verification tokens: 24 hours. Password-reset tokens: 1 hour. Expired tokens and sessions are purged regularly.</li>
                        <li>Your notes, bookmarks, highlights, and reading position are kept until you delete them or delete your account.</li>
                        <li>Rate-limit records: at most 60 minutes. Licensed chapter cache: at most 30 days.</li>
                    </ul>
                </section>

                <section aria-labelledby="privacy-deletion-heading">
                    <h2 id="privacy-deletion-heading">Deleting your account</h2>
                    <p>
                        In <Link to="/settings">Settings</Link>, under Delete account, you can
                        delete your account yourself. It asks for your current password, then
                        permanently and immediately deletes your account, your study data, and
                        your sessions. This cannot be undone.
                    </p>
                    <p>
                        Deleted data may remain in the hosting provider&apos;s point-in-time
                        backups for up to 6 hours, after which it is gone.
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
