import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import SettingsPage from "./SettingsPage";

const user = { id: 7, first_name: "Test", last_name: "Reader", email: "reader@example.invalid" };

function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function Location() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
}

function renderSettings(auth, fetchMock) {
    vi.stubGlobal("fetch", fetchMock);
    render(
        <MemoryRouter initialEntries={["/settings"]}>
            <ThemeProvider>
                <AuthContext.Provider value={auth}>
                    <Location />
                    <Routes>
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/" element={<h1>Landing</h1>} />
                        <Route path="/login" element={<h1>Login</h1>} />
                    </Routes>
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

function signedIn(logout = vi.fn()) {
    return { user, token: "test-token", isAuthLoading: false, logout };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

test("settings shows the account and the irreversible deletion warning", () => {
    renderSettings(signedIn(), vi.fn());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
    expect(screen.getByText("Test Reader · reader@example.invalid")).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByLabelText("Confirm with your current password")).toBeInTheDocument();
});

test("delete stays disabled until a password is entered", async () => {
    renderSettings(signedIn(), vi.fn());
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Confirm with your current password"), "synthetic-password");
    expect(button).toBeEnabled();
});

test("a wrong password shows the error and stays on settings", async () => {
    const logout = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(response(
        { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" }, 401,
    ));
    renderSettings(signedIn(logout), fetchMock);
    await userEvent.type(screen.getByLabelText("Confirm with your current password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByTestId("location")).toHaveTextContent("/settings");
    expect(logout).not.toHaveBeenCalled();
});

test("a correct password deletes, logs out, and returns to the landing page", async () => {
    const logout = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(response({ deleted: true }));
    renderSettings(signedIn(logout), fetchMock);
    await userEvent.type(screen.getByLabelText("Confirm with your current password"), "synthetic-password");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/account$/);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: "synthetic-password" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { level: 1, name: "Landing" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
});

test("signed-out visitors are pointed at sign-in, with no delete form", () => {
    renderSettings({ user: null, token: null, isAuthLoading: false, logout: vi.fn() }, vi.fn());
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Confirm with your current password")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete my account" })).toBeNull();
});

// Two-factor authentication lives here under Security (it used to be
// the standalone /mfa page). The MFA section's own tests moved with
// it; they render the whole Settings page so the section is proven
// to appear in place, not just in isolation.
const mfaCodes = [
    "ABCD-EFGH-IJKL", "MNOP-QRST-UVWX", "YZAB-CDEF-GHIJ", "KLMN-OPQR-STUV",
    "WXYZ-1234-5678", "9ABC-DEFG-HIJK", "LMNO-PQRS-TUVW", "XYZA-BCDE-FGHI",
    "JKLM-NOPQ-RSTU", "VWXY-ZABC-DEFG",
];

function mfaFetchMock({ enrolled = false } = {}) {
    return vi.fn((url, options = {}) => {
        const path = String(url);
        if (path.endsWith("/auth/mfa/status")) {
            return Promise.resolve(response({ enrolled }));
        }
        if (path.endsWith("/auth/mfa/enroll") && options.method === "POST") {
            return Promise.resolve(response({
                otpauthUrl: "otpauth://totp/Gnosis:reader%40example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Gnosis",
                secret: "JBSWY3DPEHPK3PXP",
            }));
        }
        if (path.endsWith("/auth/mfa/enroll/confirm")) {
            return Promise.resolve(response({ enrolled: true, recoveryCodes: mfaCodes }));
        }
        if (path.endsWith("/auth/mfa/recovery-codes/regenerate")) {
            return Promise.resolve(response({ recoveryCodes: mfaCodes.map((code) => `NEW-${code}`) }));
        }
        if (path.endsWith("/auth/mfa/disable")) {
            return Promise.resolve(response({ enrolled: false }));
        }
        throw new Error(`Unexpected request: ${path}`);
    });
}

function signedInWithMfa(auth = signedIn()) {
    return { ...auth, getAccessToken: () => "test-token", isAuthenticated: true };
}

test("security section: enrollment shows the secret once, then the recovery codes once", async () => {
    renderSettings(signedInWithMfa(), mfaFetchMock({ enrolled: false }));
    const user = userEvent.setup();

    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
    await screen.findByText("Two-factor authentication is off");
    await user.click(screen.getByRole("button", { name: /set up two-factor authentication/i }));

    await screen.findByText("Add Gnosis to your authenticator app");
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByText(/No QR code is shown yet/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Code from your authenticator app"), "123456");
    await user.click(screen.getByRole("button", { name: /confirm and turn on/i }));

    await screen.findByText(/Save your recovery codes below/);
    expect(screen.getByText("ABCD-EFGH-IJKL")).toBeInTheDocument();
    expect(screen.getByText("Two-factor authentication is on")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /i've saved my recovery codes/i }));
    expect(screen.queryByText("ABCD-EFGH-IJKL")).not.toBeInTheDocument();
});

test("security section: enrolled state offers regenerate and disable", async () => {
    renderSettings(signedInWithMfa(), mfaFetchMock({ enrolled: true }));
    const user = userEvent.setup();

    await screen.findByText("Two-factor authentication is on");
    expect(screen.getByRole("button", { name: /issue new recovery codes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn off two-factor authentication/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Password", { selector: "#mfa-regen-password" }), "synthetic-password");
    await user.type(screen.getByLabelText("Code from your authenticator app", { selector: "#mfa-regen-code" }), "123456");
    await user.click(screen.getByRole("button", { name: /issue new recovery codes/i }));

    await screen.findByText(/New recovery codes issued/);
    expect(screen.getByText("NEW-ABCD-EFGH-IJKL")).toBeInTheDocument();
});

test("signed-out visitors see no two-factor controls", () => {
    renderSettings({ user: null, token: null, isAuthLoading: false, logout: vi.fn() }, vi.fn());
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/Two-factor authentication/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Security" })).toBeNull();
});
