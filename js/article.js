const copyButton = document.querySelector('#copy-official');
const copyStatus = document.querySelector('#copy-status');
copyButton?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText('https://gemini.google.com/');
        copyStatus.textContent = '已复制 Gemini 官网网址';
    } catch {
        copyStatus.textContent = '复制未成功，请长按或选中上方网址复制。';
    }
});

const tocLinks = [...document.querySelectorAll('.toc a')];
const entries = tocLinks.map(link => ({ link, target: document.getElementById(link.hash.slice(1)) }))
    .filter(entry => entry.target);
const visibleEntries = new Set();
function markCurrent(entry) {
    tocLinks.forEach(link => link.removeAttribute('aria-current'));
    entry.link.setAttribute('aria-current', 'location');
}
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(changes => {
        changes.forEach(change => {
            if (change.isIntersecting) visibleEntries.add(change.target);
            else visibleEntries.delete(change.target);
        });
        const current = entries.filter(entry => visibleEntries.has(entry.target)).at(-1);
        if (current) markCurrent(current);
    }, { rootMargin: '-155px 0px -45% 0px', threshold: 0 });
    entries.forEach(({ target }) => observer.observe(target));
}
entries.forEach(entry => entry.link.addEventListener('click', () => markCurrent(entry)));
