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
