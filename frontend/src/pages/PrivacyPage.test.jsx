import { expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import PrivacyPage from "./PrivacyPage";

function renderPrivacy() {
    return render(
        <MemoryRouter initialEntries={["/privacy"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <PrivacyPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

test("privacy policy states what is stored, retention, and deletion", () => {
    renderPrivacy();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy Policy");
    for (const name of [
        "What we collect",
        "What we do not collect",
        "Who else handles your data",
        "How long we keep data",
        "Deleting your account",
        "Contact",
        "Changes to this policy",
    ]) {
        expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText(/one-way hash of your password/)).toBeInTheDocument();
    expect(screen.getByText(/does not include an analytics or advertising SDK/)).toBeInTheDocument();
    expect(screen.getByText(/exact retention and deletion timing cannot be verified/)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone through the app/)).toBeInTheDocument();
    expect(screen.getByText(/Have I Been Pwned/)).toBeInTheDocument();
    expect(screen.getByText(/encrypted authenticator secret/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "github.com/yoni871/Gnosis" })).toHaveAttribute(
        "href",
        "https://github.com/yoni871/Gnosis",
    );
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});

test("privacy page sets indexable metadata with its own canonical", () => {
    renderPrivacy();
    expect(document.title).toBe("Privacy Policy | Gnosis");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://studygnosis.com/privacy",
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
});

test("privacy page makes no compliance or encryption claims", () => {
    renderPrivacy();
    const main = screen.getByRole("main");
    expect(within(main).queryByText(/SOC 2|GDPR|CCPA|DPA|certified|encrypted at rest/i)).toBeNull();
});
