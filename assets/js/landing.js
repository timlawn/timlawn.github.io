(function () {
  var root = document.documentElement;
  var canvas = document.getElementById('neuromod-brain');

  if (canvas && window.NeuroModBrain) {
    var theme = function () { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; };
    var brain = NeuroModBrain.mount(canvas, { theme: theme(), speed: 1.15 });
    new MutationObserver(function () { brain.setTheme(theme()); })
      .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // Fade the About text in as it scrolls into view.
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('.landing__content > *').forEach(function (el) {
    el.classList.add('reveal');
    observer.observe(el);
  });
})();
