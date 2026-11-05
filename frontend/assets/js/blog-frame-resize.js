(() => {
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[data-myblogs-home]') : null;
    if (!link) return;
    event.preventDefault();
    parent.postMessage({ type: 'myblogs-go-home' }, '*');
  });
})();
