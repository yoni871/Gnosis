import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import AuthContext from '../context/AuthContext';
import usePrivateSession from './usePrivateSession';

const defaults = { draft: '' };
const account = { sessionVersion: 1, user: { id: 1, email: 'same@example.invalid' }, token: 'synthetic', isAuthenticated: true, isAuthLoading: false };

function mount(strict = false) {
    let auth = account;
    const renders = [];
    const tickets = [];
    const hook = renderHook(() => {
        const scope = usePrivateSession(defaults);
        renders.push(scope.state.draft);
        const { capture } = scope;
        useLayoutEffect(() => { tickets.push(capture()); }, [capture]);
        return scope;
    }, { reactStrictMode: strict, wrapper: ({ children }) => {
        const tree = <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
        return tree;
    } });
    return { ...hook, renders, tickets, change(next) { auth = next; hook.rerender(); } };
}

test.each([
    ['version', { ...account, sessionVersion: 2 }],
    ['confirmed ID despite identical email/token', { ...account, user: { ...account.user, id: 2 } }],
    ['pending authentication', { ...account, isAuthLoading: true }],
    ['logout', { ...account, sessionVersion: 2, user: null, token: null, isAuthenticated: false }],
])('first render hides private state on %s change and retires old setters/tickets', (_, next) => {
    const hook = mount();
    const old = hook.result.current;
    const ticket = old.capture();
    act(() => old.field('draft')('private'));
    const start = hook.renders.length;
    hook.change(next);
    expect(hook.renders[start]).toBe('');
    act(() => old.field('draft')('late'));
    expect(hook.result.current.state.draft).toBe('');
    expect(hook.result.current.isCurrent(ticket)).toBe(false);
});

test('email changes alone preserve state and stable current-state callback', () => {
    const hook = mount();
    const update = hook.result.current.setCurrent;
    act(() => hook.result.current.field('draft')('keep'));
    hook.change({ ...account, user: { ...account.user, email: 'changed@example.invalid' } });
    expect(hook.result.current.state.draft).toBe('keep');
    expect(hook.result.current.setCurrent).toBe(update);
});

test('Strict Mode retires only its own lifetime and unmount retires the replacement', () => {
    const hook = mount(true);
    expect(hook.tickets).toHaveLength(2);
    expect(hook.result.current.isCurrent(hook.tickets[0])).toBe(false);
    expect(hook.result.current.isCurrent(hook.tickets[1])).toBe(true);
    act(() => hook.result.current.field('draft')('replacement'));
    expect(hook.result.current.state.draft).toBe('replacement');
    const current = hook.result.current;
    hook.unmount();
    expect(current.isCurrent(hook.tickets[1])).toBe(false);
});

test('queued changes recheck ownership when React applies the updater', () => {
    const hook = mount();
    const old = hook.result.current;
    act(() => {
        old.setCurrent({ draft: 'queued' }, old.capture());
        hook.change({ ...account, sessionVersion: 2 });
    });
    expect(hook.result.current.state.draft).toBe('');
});

test('unconfirmed profiles never expose an application token', () => {
    const hook = mount();
    hook.change({ ...account, user: { email: 'same@example.invalid' } });
    expect(hook.result.current.token).toBeNull();
});

test('refresh preserves drafts and pending tickets while a different session clears them', () => {
    const token = (sid, exp) => `header.${btoa(JSON.stringify({ sid, exp }))}.signature`;
    const hook = mount();
    hook.change({ ...account, token: token('session-one', 100) });
    act(() => hook.result.current.field('draft')('keep while renewing'));
    const ticket = hook.result.current.capture();
    hook.change({ ...account, token: token('session-one', 200) });
    expect(hook.result.current.state.draft).toBe('keep while renewing');
    expect(hook.result.current.isCurrent(ticket)).toBe(true);
    hook.change({ ...account, token: token('session-two', 200) });
    expect(hook.result.current.state.draft).toBe('');
    expect(hook.result.current.isCurrent(ticket)).toBe(false);
});
