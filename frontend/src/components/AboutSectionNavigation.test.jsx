import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import AboutSectionNavigation from "./AboutSectionNavigation";
const sections = [{ id:"first",label:"First" },{ id:"second",label:"Second" }];
function setup(reduce = false) {
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
    render(<><AboutSectionNavigation sections={sections} /><section id="first" tabIndex={-1}>First content</section><section id="second" tabIndex={-1}>Second content</section></>);
    const scroll = vi.fn(); document.getElementById("second").scrollIntoView = scroll;
    return scroll;
}
afterEach(() => history.replaceState(null,"","/about"));
test.each([false,true])("section links preserve URL, move focus and honor reduced motion=%s", reduce => {
    const scroll = setup(reduce);
    fireEvent.click(within(screen.getByRole("navigation",{name:"On this page"})).getByRole("link",{name:"Second"}));
    expect(location.hash).toBe("#second"); expect(document.getElementById("second")).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ behavior:reduce?"instant":"smooth",block:"start" });
});
test("mobile disclosure supports Escape and returns focus", () => {
    setup(); const button = screen.getByRole("button"); fireEvent.click(button);
    const link = within(screen.getByRole("navigation",{name:"Page sections"})).getByRole("link",{name:"Second"});
    link.focus(); fireEvent.keyDown(link,{key:"Escape"});
    expect(button).toHaveFocus(); expect(button).toHaveAttribute("aria-expanded","false");
    expect(screen.queryByRole("navigation",{name:"Page sections"})).toBeNull();
});
test("passive scroll tracking follows the visible section", () => {
    let callback; vi.stubGlobal("requestAnimationFrame", vi.fn(fn => { callback=fn; return 10; }));
    const cancel = vi.fn(); vi.stubGlobal("cancelAnimationFrame",cancel);
    setup();
    document.getElementById("first").getBoundingClientRect = () => ({ top:-400 });
    document.getElementById("second").getBoundingClientRect = () => ({ top:20 });
    act(() => { callback(); });
    expect(within(screen.getByRole("navigation",{name:"On this page"})).getByRole("link",{name:"Second"})).toHaveAttribute("aria-current","location");
});
