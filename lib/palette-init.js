try {
  const palette = localStorage.getItem('rf.palette') || 'midnight';
  document.documentElement.dataset.palette = palette;
  if (!localStorage.getItem('rf.palette')) localStorage.setItem('rf.palette', palette);
} catch {}
