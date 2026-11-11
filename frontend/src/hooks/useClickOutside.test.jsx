import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import useClickOutside from './useClickOutside';
function Boundary({ callback, event }) {
    const ref = useClickOutside(callback, event);
    return <><div ref={ref}>Inside</div><button>Outside</button></>;
}
test('retains the default mouse behavior used by reader controls', () => {
    const callback = vi.fn();
    render(<Boundary callback={callback} />);
    fireEvent.mouseDown(screen.getByText('Inside'));
    expect(callback).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button'));
    expect(callback).toHaveBeenCalledOnce();
});
test('opt-in completed-click handling removes its listener on unmount', () => {
    const callback = vi.fn();
    const { unmount } = render(<Boundary callback={callback} event="click" />);
    fireEvent.click(screen.getByRole('button'));
    expect(callback).toHaveBeenCalledOnce();
    unmount();
    fireEvent.click(document.body);
    expect(callback).toHaveBeenCalledOnce();
});

test('treats a replaced trigger icon as an inside click using its original event path', () => {
    const callback = vi.fn();
    function ReplacingIcon() {
        const ref = useClickOutside(callback, 'click');
        return <div ref={ref}><button onClick={event => event.currentTarget.replaceChildren()}>
            Replace icon<svg><path d="M0 0h10" /></svg>
        </button></div>;
    }
    render(<ReplacingIcon />);
    fireEvent.click(screen.getByRole('button').querySelector('path'));
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(document.body);
    expect(callback).toHaveBeenCalledOnce();
});
