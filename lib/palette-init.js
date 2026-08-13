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
