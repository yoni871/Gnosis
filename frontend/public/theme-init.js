// Apply the saved theme before styles or application content can paint.
try {
    document.documentElement.dataset.theme =
        localStorage.getItem('gnosis-theme') === 'dark' ? 'dark' : 'light';
} catch {
    document.documentElement.dataset.theme = 'light';
}
