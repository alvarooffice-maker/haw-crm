// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages: https://alvarooffice-maker.github.io/haw-crm/
export default defineConfig({
  site: 'https://alvarooffice-maker.github.io',
  base: '/haw-crm',
  output: 'static',
  // recovery.html continua em /haw-crm/recovery.html (links e redirecionamentos existentes)
  build: { format: 'file' },
  // Mantém o HTML como no original (espaços entre elementos inline-block)
  compressHTML: false,
  devToolbar: { enabled: false },
});
