/* Mount the about-page banner.
   This lives in its own asset rather than inline in _includes/brain-banner.html
   because _layouts/compress.html strips every newline from the rendered HTML,
   which turns any // line comment into a comment that swallows the rest of the
   script. Static assets under assets/ are served verbatim, so they are safe. */
(function () {
  var el = document.getElementById('brain-banner');
  if (!el || !window.NeuroBanner) return;

  // On white, activation reads as ink; on the dark theme's #474747 it has to
  // invert and read as light, so the two ramps run in opposite directions.
  var LIGHT = { node: '#b3babf', edge: '#78838b', hot: '#2a94a8',
                bright: '#16b3c6', core: '#0b3d49', bold: '#4fb3c8' };
  var DARK  = { node: '#6e7780', edge: '#9aa3ab', hot: '#4cc4d6',
                bright: '#8ef0ff', core: '#f0ffff', bold: '#3fa8bd' };

  function dark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  function palette() { return { colors: dark() ? DARK : LIGHT, edgeAlpha: dark() ? 0.24 : 0.18 }; }

  var banner = NeuroBanner.mount(el, palette());

  // follow the site's light/dark toggle
  if (window.MutationObserver) {
    new MutationObserver(function () { banner.setConfig(palette()); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
})();
