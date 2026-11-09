import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import Header from "./Header";
import { AuthProvider } from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import * as authService from "../../services/authService";

vi.mock("../../services/authService", () => ({
    getProfile: vi.fn(),
    loginUser: vi.fn(),
    registerUser: vi.fn(),
    refreshSession: vi.fn(),
    logoutSession: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    authService.refreshSession.mockRejectedValue(Object.assign(new Error('No session'), { code: 'SESSION_INVALID' }));
});

function mountHeader() {
    render(
        <ThemeProvider>
            <AuthProvider>
                <MemoryRouter>
                    <Header showSearch={false} />
                </MemoryRouter>
            </AuthProvider>
        </ThemeProvider>,
    );
}

describe("Header auth loading", () => {
    test("shows neither the signed-in menu nor the signed-out links while the session is being restored", async () => {
        authService.refreshSession.mockResolvedValue({ token: "synthetic-A" });
        // Never resolves: the restore stays pending.
        authService.getProfile.mockImplementation(() => new Promise(() => {}));

        mountHeader();
        await act(async () => {});

        expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
        expect(screen.queryByText("Create account")).not.toBeInTheDocument();
        // The profile menu shows the user's initials; it must not
        // appear before the restore confirms a session.
        expect(screen.queryByText("SA")).not.toBeInTheDocument();
    });

    test("shows the profile menu once the restore confirms a session", async () => {
        authService.refreshSession.mockResolvedValue({ token: "synthetic-A" });
        authService.getProfile.mockResolvedValue({
            id: 1,
            first_name: "Synthetic",
            last_name: "A",
            email: "a@example.invalid",
        });

        mountHeader();

        await waitFor(() =>
            expect(screen.getByText("SA")).toBeInTheDocument(),
        );
        expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    });

    test("shows the signed-out links once the restore finds no session", async () => {
        mountHeader();

        await waitFor(() =>
            expect(screen.getByText("Sign in")).toBeInTheDocument(),
        );
    });
});
