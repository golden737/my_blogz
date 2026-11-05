(() => {
  const params = new URLSearchParams(location.search);
  const addUnifiedChrome = () => {
    const title = params.get('title');
    if (!title || document.querySelector('.myblogs-unified-header')) return;
    document.querySelectorAll('.platform-bar,.blog-banner,.platform-footer,body>footer').forEach(node => node.remove());

    const header = document.createElement('header');
    header.className = 'blog-banner myblogs-unified-header';
    const back = document.createElement('a');
    back.className = 'blog-back';
    back.href = params.get('home') || './';
    back.setAttribute('aria-label', 'Volver a My Blogs');
    back.textContent = '←';
    const name = document.createElement('span');
    name.textContent = title;
    const search = document.createElement('span');
    search.className = 'search-mark';
    search.setAttribute('aria-hidden', 'true');
    search.textContent = '⌕';
    header.append(back, name, search);
    document.body.prepend(header);

    const footer = document.createElement('footer');
    footer.className = 'platform-footer myblogs-unified-footer';
    const label = document.createElement('span');
    label.textContent = `${title} · ${params.get('author') || 'Autor del blog'}`;
    const home = document.createElement('a');
    home.href = params.get('home') || './';
    home.textContent = 'Volver a My Blogs ↑';
    footer.append(label, home);
    document.body.append(footer);
  };

  const reportHeight = () => {
    addUnifiedChrome();
    const footer = document.querySelector('.myblogs-unified-footer');
    const contentBottom = footer
      ? footer.getBoundingClientRect().bottom + window.scrollY
      : Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight);
    const height = Math.ceil(Math.max(320, contentBottom + 2));
    parent.postMessage({ type: 'myblogs-reader-height', height }, '*');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reportHeight, { once: true });
  else reportHeight();
  window.addEventListener('load', reportHeight);
  window.addEventListener('resize', reportHeight);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.documentElement);
    observer.observe(document.body);
  }
  document.addEventListener('load', event => {
    if (event.target instanceof HTMLImageElement) reportHeight();
  }, true);
  if (document.fonts?.ready) document.fonts.ready.then(reportHeight);
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 1200);
})();
