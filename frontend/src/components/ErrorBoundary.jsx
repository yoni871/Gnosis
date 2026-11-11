import { Component } from "react";

// Last-resort catch for rendering errors anywhere below it: without
// this, a single unexpected throw (for example an API payload with
// the wrong shape) unmounts the whole app and leaves a blank page.
// The boundary shows a friendly message with a reload instead.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error(error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
                    <h1 className="text-xl font-semibold text-[var(--text-primary)]">
                        Something went wrong while loading this page.
                    </h1>
                    <p className="max-w-md text-[var(--text-muted)]">
                        Please reload the page and try again.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-2 rounded-md border border-[var(--color-brand)] px-4 py-2 text-[var(--color-brand)]"
                    >
                        Reload page
                    </button>
                </main>
            );
        }

        return this.props.children;
    }
}
