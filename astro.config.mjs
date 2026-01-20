import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless'; // On précise /serverless

export default defineConfig({
  // OBLIGATOIRE : Change le mode de sortie pour autoriser le code serveur
  output: 'server',

  build: {
    inlineStylesheets: 'always'
  },

  // L'adaptateur configuré explicitement
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  })
});