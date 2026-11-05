import { StrictMode } from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LaptopScene from './LaptopScene';
const mount = vi.hoisted(() => vi.fn());
vi.mock('./mountLaptopScene', () => ({ mountLaptopScene: mount }));
let reduced, desktop;
beforeEach(() => {
    mount.mockReset();
    reduced = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    desktop = { ...reduced, matches: true };
    vi.stubGlobal('matchMedia', vi.fn(query => query.includes('reduced') ? reduced : desktop));
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue() });
});
afterEach(() => { cleanup(); delete HTMLImageElement.prototype.decode; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('retains the original image for reduced motion and mobile', async () => {
    reduced.matches = true;
    const first = render(<div><picture /><LaptopScene /></div>);
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    first.unmount(); reduced.matches = false; desktop.matches = false;
    render(<div><picture /><LaptopScene /></div>);
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
});
it('cleans up a Strict Mode scene and restores static fallback on preference change', async () => {
    const scene = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    mount.mockResolvedValue(scene);
    const view = render(<StrictMode><div data-testid="media"><picture /><LaptopScene /></div></StrictMode>);
    await waitFor(() => expect(view.getByTestId('media')).toHaveAttribute('data-laptop-ready', 'true'));
    expect(scene.render).toHaveBeenCalledWith(0);
    reduced.matches = true;
    const listener = reduced.addEventListener.mock.calls.at(-1)[1];
    listener();
    expect(scene.dispose).toHaveBeenCalled();
    expect(view.getByTestId('media')).not.toHaveAttribute('data-laptop-ready');
});
it('disposes a late renderer after unmount instead of activating it', async () => {
    let resolve;
    mount.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<div><picture /><LaptopScene /></div>);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    view.unmount();
    const scene = { dispose: vi.fn() };
    resolve(scene);
    await waitFor(() => expect(scene.dispose).toHaveBeenCalled());
});
it('leaves the static hero visible when WebGL initialization fails', async () => {
    mount.mockRejectedValue(new Error('WebGL unavailable'));
    const view = render(<div data-testid="media"><picture /><LaptopScene /></div>);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    expect(view.getByTestId('media')).not.toHaveAttribute('data-laptop-ready');
});
