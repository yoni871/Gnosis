// A blur can precede a tap's click. Keep sibling disclosure triggers in place
// until their click completes; outside-click handling then closes the old menu.
export function shouldCloseDisclosureOnBlur(event) {
    const next = event.relatedTarget;
    const boundary = event.currentTarget;
    if (!(next instanceof Element) || boundary.contains(next)) return false;
    const siblingTrigger = next.closest('button[aria-expanded][aria-controls]');
    const header = boundary.closest('.landing-header');
    return !(siblingTrigger && header?.contains(siblingTrigger));
}
