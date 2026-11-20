import { StrictMode, useContext, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import AuthContext, { AuthProvider } from './AuthContext';
import { getProfile, loginUser, registerUser, refreshSession, logoutSession } from '../services/authService';

vi.mock('../services/authService', () => ({
    getProfile: vi.fn(), loginUser: vi.fn(), registerUser: vi.fn(),
    refreshSession: vi.fn(), logoutSession: vi.fn().mockResolvedValue(undefined),
}));

const oldUser = { id: 1, email: 'old@example.invalid' };
const newUser = { id: 2, email: 'new@example.invalid' };
const credentials = { email: newUser.email, password: 'synthetic-password' };
let auth;

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function settle(request, value, fail = false) {
    await act(async () => {
        if (fail) request.reject(value);
        else request.resolve(value);
        await request.promise.catch(() => {});
    });
}

function Probe() {
    const value = useContext(AuthContext);
    useEffect(() => { auth = value; }, [value]);
    const { user, token, isAuthLoading, isAuthenticated } = value;
    return <output data-testid="auth-state">{JSON.stringify({ user, token, isAuthLoading, isAuthenticated })}</output>;
}

async function mount(strict = false) {
    const tree = <AuthProvider><Probe /></AuthProvider>;
    const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await act(async () => {});
    return view;
}

function begin(method, data = credentials) {
    let operation;
    act(() => { operation = auth[method](data); });
    return operation;
}

function session(user, token, loading = false) {
    expect(JSON.parse(screen.getByTestId('auth-state').textContent)).toEqual({
        user, token, isAuthLoading: loading, isAuthenticated: Boolean(user),
    });
    expect(localStorage.getItem('gnosisToken')).toBeNull();
    expect(auth.getAccessToken()).toBe(token);
}

afterEach(() => { vi.useRealTimers(); });

const guestRefresh = () => { throw Object.assign(new Error('No cookie session'), { code: 'SESSION_INVALID' }); };

beforeEach(() => {
    for (const mock of [getProfile, loginUser, registerUser]) mock.mockReset();
    refreshSession.mockReset().mockImplementation(guestRefresh);
    logoutSession.mockResolvedValue(undefined);
    auth = undefined;
});

test('guest startup finishes without requesting a profile', async () => {
    await mount();
    session(null, null);
    expect(getProfile).not.toHaveBeenCalled();
});

test('a canceled sign-out reports cancellation and preserves the session', async () => {
    refreshSession.mockResolvedValue({ token: 'old-token' });
    getProfile.mockResolvedValue(oldUser);
    await mount();
    const cancel = event => event.preventDefault();
    window.addEventListener('gnosis:before-sign-out', cancel);
    logoutSession.mockClear();
    try {
        let result;
        act(() => { result = auth.logout(); });
        expect(result).toBe(false);
        session(oldUser, 'old-token');
        expect(logoutSession).not.toHaveBeenCalled();
    } finally { window.removeEventListener('gnosis:before-sign-out', cancel); }
});

test('restores the cookie session and profile without persistent access storage', async () => {
    const restore = deferred();
    refreshSession.mockResolvedValue({ token: 'old-token' });
    getProfile.mockReturnValue(restore.promise);
    await mount();
    session(null, 'old-token', true);
    await settle(restore, oldUser);
    session(oldUser, 'old-token');
});

test('a current restore failure clears the invalid session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = deferred();
    refreshSession.mockResolvedValue({ token: 'old-token' });
    getProfile.mockReturnValue(restore.promise);
    await mount();
    await settle(restore, new Error('synthetic expired token'), true);
    session(null, null);
});

test.each([false, true])('logout ignores a late restore (failure=%s)', async fail => {
    const restore = deferred();
    refreshSession.mockResolvedValue({ token: 'old-token' });
    getProfile.mockReturnValue(restore.promise);
    await mount();
    act(() => auth.logout());
    session(null, null);
    await settle(restore, fail ? new Error('stale restore') : oldUser, fail);
    session(null, null);
});

test.each([false, true])('a late restore cannot replace or clear a newer login (failure=%s)', async fail => {
    const restore = deferred();
    const profile = deferred();
    refreshSession.mockResolvedValue({ token: 'old-token' });
    getProfile.mockImplementation(token => token === 'old-token' ? restore.promise : profile.promise);
    loginUser.mockResolvedValue({ token: 'new-token' });
    await mount();
    const operation = begin('login');
    await act(async () => {});
    session(null, 'new-token', true);
    await settle(profile, newUser);
    expect(await operation).toEqual(newUser);
    await settle(restore, fail ? new Error('stale restore') : oldUser, fail);
    session(newUser, 'new-token');
});

test.each(['login', 'profile'])('logout invalidates login during its %s request', async stage => {
    const request = deferred();
    if (stage === 'login') loginUser.mockReturnValue(request.promise);
    else {
        loginUser.mockResolvedValue({ token: 'new-token' });
        getProfile.mockReturnValue(request.promise);
    }
    await mount();
    const operation = begin('login');
    await act(async () => {});
    act(() => auth.logout());
    await settle(request, stage === 'login' ? { token: 'new-token' } : newUser);
    expect(await operation).toBeNull();
    session(null, null);
    if (stage === 'login') expect(getProfile).not.toHaveBeenCalled();
});

test.each([false, true])('overlapping logins ignore the older token result and loading cleanup (failure=%s)', async fail => {
    const older = deferred();
    const newer = deferred();
    const profile = deferred();
    loginUser.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    getProfile.mockReturnValue(profile.promise);
    await mount();
    const a = begin('login', { ...credentials, email: oldUser.email });
    const b = begin('login');
    await settle(older, fail ? new Error('stale login') : { token: 'old-token' }, fail);
    expect(await a).toBeNull();
    session(null, null, true);
    expect(getProfile).not.toHaveBeenCalled();
    await settle(newer, { token: 'new-token' });
    session(null, 'new-token', true);
    await settle(profile, newUser);
    expect(await b).toEqual(newUser);
    session(newUser, 'new-token');
});

test.each([false, true])('a stale login profile cannot replace or clear the newer session (failure=%s)', async fail => {
    const oldProfile = deferred();
    const newProfile = deferred();
    loginUser.mockResolvedValueOnce({ token: 'old-token' }).mockResolvedValueOnce({ token: 'new-token' });
    getProfile.mockImplementation(token => token === 'old-token' ? oldProfile.promise : newProfile.promise);
    await mount();
    const a = begin('login', { ...credentials, email: oldUser.email });
    await act(async () => {});
    const b = begin('login');
    await act(async () => {});
    await settle(newProfile, newUser);
    expect(await b).toEqual(newUser);
    await settle(oldProfile, fail ? new Error('stale profile') : oldUser, fail);
    expect(await a).toBeNull();
    session(newUser, 'new-token');
});

test('current login failure rejects, clears storage and ends loading', async () => {
    const profile = deferred();
    loginUser.mockResolvedValue({ token: 'new-token' });
    getProfile.mockReturnValue(profile.promise);
    await mount();
    const operation = begin('login').catch(error => error);
    await act(async () => {});
    const error = new Error('current profile failure');
    await settle(profile, error, true);
    expect(await operation).toBe(error);
    session(null, null);
});

test('registration returns the registered email without starting a session', async () => {
    const registration = deferred();
    registerUser.mockReturnValue(registration.promise);
    await mount();
    const data = { ...credentials, firstName: 'Synthetic', lastName: 'User' };
    const operation = begin('register', data);
    await settle(registration, { id: 2, email: data.email });
    expect(registerUser).toHaveBeenCalledWith(data);
    expect(loginUser).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
    expect(await operation).toEqual({ email: data.email });
    session(null, null);
});

test('a registration is independent of a concurrent login', async () => {
    const registration = deferred();
    registerUser.mockReturnValue(registration.promise);
    loginUser.mockResolvedValue({ token: 'new-token' });
    getProfile.mockResolvedValue(newUser);
    await mount();
    const registrationOperation = begin('register');
    const loginOperation = begin('login');
    await act(async () => { await loginOperation; });
    session(newUser, 'new-token');
    await settle(registration, { id: 1, email: 'register@example.invalid' });
    expect(await registrationOperation).toEqual({ email: 'register@example.invalid' });
    expect(loginUser).toHaveBeenCalledTimes(1);
    session(newUser, 'new-token');
});

test.each([false, true])('logout during registration neither cancels it nor logs in (failure=%s)', async fail => {
    const registration = deferred();
    registerUser.mockReturnValue(registration.promise);
    await mount();
    const operation = begin('register');
    operation.catch(() => {});
    act(() => auth.logout());
    await settle(registration, fail ? new Error('registration failure') : { id: 2, email: credentials.email }, fail);
    if (fail) await expect(operation).rejects.toThrow('registration failure');
    else expect(await operation).toEqual({ email: credentials.email });
    session(null, null);
    expect(loginUser).not.toHaveBeenCalled();
});

test.each(['restore', 'login', 'registration'])('unmount invalidates pending %s without changing a remounted session', async stage => {
    const request = deferred();
    if (stage === 'restore') {
        refreshSession.mockResolvedValue({ token: 'old-token' });
        getProfile.mockReturnValueOnce(request.promise);
    } else if (stage === 'login') loginUser.mockReturnValue(request.promise);
    else registerUser.mockReturnValue(request.promise);
    const old = await mount();
    const operation = stage === 'restore' ? null : begin(stage === 'login' ? 'login' : 'register');
    old.unmount();
    refreshSession.mockResolvedValue({ token: 'new-token' });
    refreshSession.mockResolvedValue({ token: 'new-token' });
    getProfile.mockResolvedValue(newUser);
    await mount();
    await act(async () => {});
    await settle(request, stage === 'restore' ? oldUser : stage === 'login' ? { token: 'old-token' } : { id: 3, email: 'register@example.invalid' });
    if (stage === 'login') expect(await operation).toBeNull();
    if (stage === 'registration') expect(await operation).toEqual({ email: 'register@example.invalid' });
    session(newUser, 'new-token');
    if (stage === 'registration') expect(loginUser).not.toHaveBeenCalled();
});

test.each([false, true])('Strict Mode ignores stale startup renewal (failure=%s)', async fail => {
    const first = deferred(), second = deferred();
    refreshSession.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    getProfile.mockResolvedValue(newUser);
    await mount(true);
    expect(refreshSession).toHaveBeenCalledTimes(2);
    await settle(first, fail ? new Error('first restore expired') : { token: 'stale-token' }, fail);
    session(null, null, true);
    await settle(second, { token: 'new-token' });
    session(newUser, 'new-token');
    expect(getProfile).toHaveBeenCalledTimes(1);
});

test('publishes a read-only session version for restore, login and logout, and registration does not bump it', async () => {
    await mount();
    const startup = auth.sessionVersion;
    expect(startup).toBeGreaterThan(0);
    expect(auth.setSessionVersion).toBeUndefined();
    const tokenRequest = deferred();
    loginUser.mockReturnValue(tokenRequest.promise);
    getProfile.mockResolvedValue(newUser);
    const login = begin('login');
    const loginVersion = auth.sessionVersion;
    expect(loginVersion).toBeGreaterThan(startup);
    await settle(tokenRequest, { token: 'synthetic' });
    await login;
    expect(auth.sessionVersion).toBe(loginVersion);
    const registration = deferred();
    registerUser.mockReturnValue(registration.promise);
    const register = begin('register');
    expect(auth.sessionVersion).toBe(loginVersion);
    await settle(registration, { id: 9, email: credentials.email });
    expect(await register).toEqual({ email: credentials.email });
    expect(auth.sessionVersion).toBe(loginVersion);
    act(() => auth.logout());
    expect(auth.sessionVersion).toBeGreaterThan(loginVersion);
});

test('session version is published when the restore starts, not when it settles', async () => {
    // Regression test for the react-hooks/set-state-in-effect fix: the
    // version used to be copied into state with a synchronous
    // setSessionVersion(ticket) inside the restore effect. It now
    // mirrors the guard epoch through useSyncExternalStore, so it is
    // already > 0 as soon as the restore begins — even while the
    // refresh request is still in flight. A fix that deferred
    // publication until the restore settles would fail this test.
    const restore = deferred();
    refreshSession.mockReturnValue(restore.promise);
    getProfile.mockResolvedValue(newUser);
    await mount();
    expect(auth.sessionVersion).toBeGreaterThan(0);
    expect(auth.isAuthLoading).toBe(true);
    await settle(restore, { token: 'late-token' });
    session(newUser, 'late-token');
});

function sessionToken(exp, sid = 'session-one') {
    return `header.${btoa(JSON.stringify({ exp, sid }))}.signature`;
}
test('startup obtains a fresh access token before restoring the profile', async () => {
    const oldToken = sessionToken(1);
    const newToken = sessionToken(Math.floor(Date.now() / 1000) + 900);
    refreshSession.mockResolvedValue({ token: oldToken });
    refreshSession.mockResolvedValue({ token: newToken });
    getProfile.mockResolvedValue(newUser);
    await mount();
    await act(async () => {});
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(getProfile).toHaveBeenCalledWith(newToken);
    session(newUser, newToken);
});
test('logout during refresh cannot restore the previous account', async () => {
    refreshSession.mockResolvedValue({ token: sessionToken(1) });
    const renewal = deferred();
    refreshSession.mockReturnValue(renewal.promise);
    await mount();
    act(() => auth.logout());
    await settle(renewal, { token: sessionToken(9999999999) });
    session(null, null);
    expect(getProfile).not.toHaveBeenCalled();
    expect(logoutSession).toHaveBeenCalled();
});
test('renewal updates credentials without changing the session version', async () => {
    const oldToken = sessionToken(9999999999);
    const newToken = sessionToken(9999999998);
    refreshSession.mockResolvedValue({ token: oldToken });
    getProfile.mockResolvedValue(newUser);
    refreshSession.mockResolvedValue({ token: newToken });
    await mount();
    await act(async () => {});
    const version = auth.sessionVersion;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    session(newUser, newToken);
    expect(auth.sessionVersion).toBe(version);
});

test('a temporary renewal failure preserves the session and retries without changing ownership', async () => {
    vi.useFakeTimers();
    const oldToken = sessionToken(9999999999);
    const newToken = sessionToken(9999999998);
    refreshSession.mockResolvedValue({ token: oldToken });
    getProfile.mockResolvedValue(newUser);
    refreshSession.mockResolvedValueOnce({ token: oldToken }).mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce({ token: newToken });
    await mount();
    await act(async () => {});
    const version = auth.sessionVersion;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    session(newUser, oldToken);
    expect(logoutSession).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    session(newUser, newToken);
    expect(auth.sessionVersion).toBe(version);
});
test('a rejected session ends authentication immediately on renewal', async () => {
    const token = sessionToken(9999999999);
    refreshSession.mockResolvedValue({ token: token });
    getProfile.mockResolvedValue(newUser);
    refreshSession.mockResolvedValueOnce({ token }).mockRejectedValue(Object.assign(new Error('Session revoked'), { code: 'SESSION_INVALID' }));
    await mount();
    await act(async () => {});
    await act(async () => { window.dispatchEvent(new Event('online')); });
    session(null, null);
    expect(logoutSession).toHaveBeenCalledWith(token, false);
});

test('legacy persistent access credentials are removed and never used to authenticate', async () => {
    localStorage.setItem('gnosisToken', 'legacy-credential');
    refreshSession.mockResolvedValue({ token: 'cookie-session-token' });
    getProfile.mockResolvedValue(newUser);
    await mount();
    session(newUser, 'cookie-session-token');
    expect(getProfile).toHaveBeenCalledExactlyOnceWith('cookie-session-token');
    expect(sessionStorage.getItem('gnosisToken')).toBeNull();
});

test('disabled browser storage does not prevent cookie session restoration', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage disabled'); });
    refreshSession.mockResolvedValue({ token: 'memory-token' });
    getProfile.mockResolvedValue(newUser);
    await mount();
    session(newUser, 'memory-token');
});
