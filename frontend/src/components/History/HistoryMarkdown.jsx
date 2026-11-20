// The only component allowed to render History Markdown.
//
// Wraps react-markdown + remark-gfm (lazy-loaded with the History routes
// only). It renders to React elements, never to a raw HTML string — the
// codebase's zero-dangerouslySetInnerHTML record survives — and runs
// WITHOUT rehype-raw, so any HTML in a Markdown file renders as inert
// text at worst. The build validator rejects HTML tags in content as a
// second, independent layer.
//
// Links are restricted to http(s), site-internal, and anchor targets, and
// no images render in the MVP.
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function isSafeHref(href) {
    return typeof href === "string" && /^(https?:\/\/|\/|#)/.test(href);
}

export default function HistoryMarkdown({ markdown }) {
    if (!markdown) return null;
    return (
        <div className="history-markdown">
            <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a({ href, children }) {
                        if (!isSafeHref(href)) return <>{children}</>;
                        const external = href.startsWith("http");
                        const footnote = href.startsWith("#source-");
                        return (
                            <a
                                href={href}
                                className={footnote ? "history-footnote-link" : undefined}
                                {...(external
                                    ? { target: "_blank", rel: "noreferrer" }
                                    : {})}
                            >
                                {children}
                            </a>
                        );
                    },
                    img() {
                        return null;
                    },
                }}
            >
                {markdown}
            </Markdown>
        </div>
    );
}
