try {
  const palette = localStorage.getItem('rf.palette') || 'midnight';
  document.documentElement.dataset.palette = palette;
  if (!localStorage.getItem('rf.palette')) localStorage.setItem('rf.palette', palette);
} catch {}

// 100dvh has been unreliable in iOS standalone-PWA mode on some devices/
// versions — it can resolve taller than the actual visible viewport,
// which silently breaks anything sized/pinned against it (the mobile
// shell's flex column, the bottom nav pill, the "+ New trip" FAB). This
// sets a JS-verified pixel value from the real viewport instead; CSS
// falls back to 100dvh via var(--app-vh, 100dvh) until this runs, and
// again if it somehow doesn't (older/unsupported browser).
(function setAppVh() {
  const setVh = () => {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', `${h}px`);
  };
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', setVh);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setVh);
})();

// Temporary on-device diagnostic for the iOS standalone-PWA bottom-nav gap.
// Two gating strategies already failed: a ?debug=viewport query param is
// untypeable from standalone (no address bar), and localStorage turned out
// NOT to bridge Safari -> installed PWA -- iOS gives a Home Screen web app
// its own isolated storage container, separate from Safari, even for the
// same origin. There's no reliable way left to toggle this remotely, so it
// just always renders for now (tap it to hide for the rest of this page
// load). Remove this whole block once the bug is confirmed fixed on-device.
(function debugViewportPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:rgba(0,0,0,.88);color:#0f0;font:10px/1.4 monospace;padding:6px 8px;white-space:pre;pointer-events:auto;';
    panel.addEventListener('click', () => {
      panel.remove();
      safeAreaProbe.remove();
      clearInterval(timer);
    });
    const safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText = 'position:fixed;bottom:0;left:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;';
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(panel);
      document.body.appendChild(safeAreaProbe);
    });
    const update = () => {
      const nav = document.querySelector('.rf-clean-bottom');
      const navRect = nav ? nav.getBoundingClientRect() : null;
      const vv = window.visualViewport;
      const lines = [
        `standalone(iOS)=${window.navigator.standalone}`,
        `display-mode:standalone=${window.matchMedia('(display-mode: standalone)').matches}`,
        `innerHeight=${window.innerHeight} clientHeight=${document.documentElement.clientHeight} screenH=${screen.height}`,
        `visualViewport h=${vv ? vv.height : 'n/a'} offsetTop=${vv ? vv.offsetTop : 'n/a'}`,
        `--app-vh=${getComputedStyle(document.documentElement).getPropertyValue('--app-vh')}`,
        `env(safe-area-inset-bottom)=${getComputedStyle(safeAreaProbe).paddingBottom}`,
        navRect
          ? `nav bottom=${navRect.bottom.toFixed(1)} vs innerHeight=${window.innerHeight} -> gap=${(window.innerHeight - navRect.bottom).toFixed(1)}px`
          : 'nav: .rf-clean-bottom not found yet',
        '(tap to hide)',
      ];
      panel.textContent = lines.join('\n');
    };
    update();
    const timer = setInterval(update, 500);
    window.addEventListener('resize', update);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
})();
