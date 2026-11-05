(() => {
  let lastReported = 0;
  const reportHeight = () => {
    // Measure the document content, never the iframe viewport. Watching the
    // iframe root with ResizeObserver makes the viewport resize itself forever.
    const footer = document.querySelector('body > .platform-footer');
    const body = document.body;
    const height = Math.ceil(footer
      ? footer.getBoundingClientRect().bottom + window.scrollY + 2
      : Math.max(document.documentElement.scrollHeight, body?.scrollHeight || 0));
    if (!Number.isFinite(height) || height < 300 || height === lastReported) return;
    lastReported = height;
    parent.postMessage({ type: 'myblogs-reader-height', height }, '*');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reportHeight, { once: true });
  else reportHeight();
  window.addEventListener('load', reportHeight, { once: true });
  window.addEventListener('resize', reportHeight);
  document.addEventListener('load', event => {
    if (event.target instanceof HTMLImageElement) reportHeight();
  }, true);
  if (document.fonts?.ready) document.fonts.ready.then(reportHeight);
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 1200);
})();
