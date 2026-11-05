(() => {
  const reportHeight = () => {
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
      document.documentElement.offsetHeight,
      document.body?.offsetHeight || 0
    );
    parent.postMessage({ type: 'myblogs-reader-height', height }, '*');
  };

  window.addEventListener('load', reportHeight);
  if ('ResizeObserver' in window) new ResizeObserver(reportHeight).observe(document.documentElement);
  if (document.fonts?.ready) document.fonts.ready.then(reportHeight);
  setTimeout(reportHeight, 250);
  setTimeout(reportHeight, 1200);
})();
