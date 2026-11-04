import { StrictMode, useContext, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import AuthContext, { AuthProvider } from './AuthContext';
import { getProfile, loginUser, registerUser } from '../services/authService';

vi.mock('../services/authService', () => ({
    getProfile: vi.fn(), loginUser: vi.fn(), registerUser: vi.fn(),
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

function mount(strict = false) {
    const tree = <AuthProvider><Probe /></AuthProvider>;
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
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
    expect(localStorage.getItem('gnosisToken')).toBe(token);
}

beforeEach(() => {
    for (const mock of [getProfile, loginUser, registerUser]) mock.mockReset();
    auth = undefined;
});

test('guest startup finishes without requesting a profile', () => {
    mount();
    session(null, null);
    expect(getProfile).not.toHaveBeenCalled();
});

test('restores a stored token and profile', async () => {
    const restore = deferred();
    localStorage.setItem('gnosisToken', 'old-token');
    getProfile.mockReturnValue(restore.promise);
    mount();
    session(null, 'old-token', true);
    await settle(restore, oldUser);
    session(oldUser, 'old-token');
});

test('a current restore failure clears the invalid session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = deferred();
    localStorage.setItem('gnosisToken', 'old-token');
    getProfile.mockReturnValue(restore.promise);
    mount();
    await settle(restore, new Error('synthetic expired token'), true);
    session(null, null);
});

test.each([false, true])('logout ignores a late restore (failure=%s)', async fail => {
    const restore = deferred();
    localStorage.setItem('gnosisToken', 'old-token');
    getProfile.mockReturnValue(restore.promise);
    mount();
    act(() => auth.logout());
    session(null, null);
    await settle(restore, fail ? new Error('stale restore') : oldUser, fail);
    session(null, null);
});

test.each([false, true])('a late restore cannot replace or clear a newer login (failure=%s)', async fail => {
    const restore = deferred();
    const profile = deferred();
    localStorage.setItem('gnosisToken', 'old-token');
    getProfile.mockImplementation(token => token === 'old-token' ? restore.promise : profile.promise);
    loginUser.mockResolvedValue({ token: 'new-token' });
    mount();
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
    mount();
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
    mount();
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
    mount();
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
    mount();
    const operation = begin('login').catch(error => error);
    await act(async () => {});
    const error = new Error('current profile failure');
    await settle(profile, error, true);
    expect(await operation).toBe(error);
    session(null, null);
});

test('registration and its automatic login share one generation through completion', async () => {
    const registration = deferred(), login = deferred(), profile = deferred();
    registerUser.mockReturnValue(registration.promise);
    loginUser.mockReturnValue(login.promise);
    getProfile.mockReturnValue(profile.promise);
    mount();
    const data = { ...credentials, firstName: 'Synthetic', lastName: 'User' };
    const operation = begin('register', data);
    session(null, null, true);
    await settle(registration, { id: 2 });
    expect(registerUser).toHaveBeenCalledWith(data);
    expect(loginUser).toHaveBeenCalledWith(credentials);
    session(null, null, true);
    await settle(login, { token: 'new-token' });
    session(null, 'new-token', true);
    await settle(profile, newUser);
    expect(await operation).toEqual(newUser);
    session(newUser, 'new-token');
});

test.each([false, true])('a superseded registration cannot start login or affect the newer session (failure=%s)', async fail => {
    const registration = deferred();
    registerUser.mockReturnValue(registration.promise);
    loginUser.mockResolvedValue({ token: 'new-token' });
    getProfile.mockResolvedValue(newUser);
    mount();
    const registrationOperation = begin('register');
    const loginOperation = begin('login');
    await act(async () => { await loginOperation; });
    await settle(registration, fail ? new Error('stale registration') : { id: 1 }, fail);
    expect(await registrationOperation).toBeNull();
    expect(loginUser).toHaveBeenCalledTimes(1);
    session(newUser, 'new-token');
});

test.each(['registration', 'login', 'profile'])('logout invalidates registration during its %s stage', async stage => {
    const request = deferred();
    registerUser.mockReturnValue(stage === 'registration' ? request.promise : Promise.resolve({ id: 2 }));
    loginUser.mockReturnValue(stage === 'login' ? request.promise : Promise.resolve({ token: 'new-token' }));
    getProfile.mockReturnValue(request.promise);
    mount();
    const operation = begin('register');
    await act(async () => {});
    act(() => auth.logout());
    await settle(request, stage === 'login' ? { token: 'new-token' } : newUser);
    expect(await operation).toBeNull();
    session(null, null);
    if (stage === 'registration') expect(loginUser).not.toHaveBeenCalled();
});

test.each(['restore', 'login', 'registration'])('unmount invalidates pending %s without changing a remounted session', async stage => {
    const request = deferred();
    if (stage === 'restore') {
        localStorage.setItem('gnosisToken', 'old-token');
        getProfile.mockReturnValueOnce(request.promise);
    } else if (stage === 'login') loginUser.mockReturnValue(request.promise);
    else registerUser.mockReturnValue(request.promise);
    const old = mount();
    const operation = stage === 'restore' ? null : begin(stage === 'login' ? 'login' : 'register');
    old.unmount();
    localStorage.setItem('gnosisToken', 'new-token');
    getProfile.mockResolvedValue(newUser);
    mount();
    await act(async () => {});
    await settle(request, stage === 'restore' ? oldUser : { token: 'old-token' });
    if (operation) expect(await operation).toBeNull();
    session(newUser, 'new-token');
    if (stage === 'registration') expect(loginUser).not.toHaveBeenCalled();
});

test.each([false, true])('Strict Mode ignores the first restore after effect cleanup (failure=%s)', async fail => {
    const first = deferred(), second = deferred();
    localStorage.setItem('gnosisToken', 'old-token');
    getProfile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mount(true);
    expect(getProfile).toHaveBeenCalledTimes(2);
    await settle(first, fail ? new Error('first restore expired') : oldUser, fail);
    session(null, 'old-token', true);
    await settle(second, newUser);
    session(newUser, 'old-token');
});

test('publishes a read-only session version for restore, login, registration and logout', async () => {
    mount();
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
    loginUser.mockResolvedValue({ token: 'synthetic-next' });
    const register = begin('register');
    const registerVersion = auth.sessionVersion;
    expect(registerVersion).toBeGreaterThan(loginVersion);
    await settle(registration, {});
    await register;
    expect(auth.sessionVersion).toBe(registerVersion);
    act(() => auth.logout());
    expect(auth.sessionVersion).toBeGreaterThan(registerVersion);
});
