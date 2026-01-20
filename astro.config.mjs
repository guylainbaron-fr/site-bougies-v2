import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // OBLIGATOIRE : Change le mode de sortie pour autoriser le code serveur
  output: 'server',

  build: {
    inlineStylesheets: 'always'
  },

  // L'adaptateur pour que Vercel comprenne ton code
  adapter: vercel()
});