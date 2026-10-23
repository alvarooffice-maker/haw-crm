// Registra o service worker do PWA (public/sw.js), relativo à página como no original
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[HAW] SW falhou:', e));
}
