document.addEventListener('DOMContentLoaded', () => {
    const cards = Array.from(document.querySelectorAll('.catalog-card'));
    const search = document.getElementById('model-search');
    const filters = Array.from(document.querySelectorAll('[data-filter]'));
    const count = document.getElementById('result-count');
    const empty = document.getElementById('empty-results');
    let category = 'all';

    // Model content remains available to readers and crawlers without JavaScript.
    document.querySelector('.catalog-controls').hidden = false;
    const searchable = cards.map(card => card.textContent.toLocaleLowerCase());

    function applyFilters() {
        const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        let visible = 0;
        cards.forEach((card, index) => {
            const matches = (category === 'all' || card.dataset.category === category)
                && words.every(word => searchable[index].includes(word));
            card.hidden = !matches;
            if (matches) visible += 1;
        });
        filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
        count.textContent = `显示 ${visible} / ${cards.length} 个模型`;
        empty.hidden = visible !== 0;
    }

    function resetFilters() {
        search.value = '';
        category = 'all';
        applyFilters();
    }

    search.addEventListener('input', applyFilters);
    filters.forEach(button => button.addEventListener('click', () => {
        category = button.dataset.filter;
        applyFilters();
    }));
    document.getElementById('reset-filters').addEventListener('click', () => {
        resetFilters();
        search.focus();
    });

    // A model deep link must remain reachable after using search or filters.
    function revealLinkedModel() {
        const card = cards.find(item => `#${item.id}` === window.location.hash);
        if (card && card.hidden) {
            resetFilters();
            card.scrollIntoView({ block: 'start' });
        }
    }
    document.querySelectorAll('.task-item').forEach(link => link.addEventListener('click', resetFilters));
    window.addEventListener('hashchange', revealLinkedModel);
    applyFilters();
    revealLinkedModel();
});
