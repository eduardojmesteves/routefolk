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
// Standalone PWAs have no address bar, so a ?debug=viewport query param
// can only ever be typed from a regular Safari tab — which necessarily
// runs with navigator.standalone=false, the one context that can't
// reproduce this bug. Persist the flag in localStorage (shared with the
// installed PWA, same origin) so turning it on once from Safari makes it
// keep showing up on the next home-screen-icon launch too. Tap the panel
// to turn it back off. Remove this whole block once the bug is confirmed
// fixed on-device.
try {
  if (location.search.includes('debug=viewport')) localStorage.setItem('rf.debugViewport', '1');
} catch {}
let debugViewportOn = false;
try { debugViewportOn = localStorage.getItem('rf.debugViewport') === '1'; } catch {}
if (debugViewportOn) {
  (function debugViewportPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:rgba(0,0,0,.88);color:#0f0;font:10px/1.4 monospace;padding:6px 8px;white-space:pre;pointer-events:auto;';
    panel.addEventListener('click', () => {
      try { localStorage.removeItem('rf.debugViewport'); } catch {}
      panel.remove();
      safeAreaProbe.remove();
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
    setInterval(update, 500);
    window.addEventListener('resize', update);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
  })();
}
