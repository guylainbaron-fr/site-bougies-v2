// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// Récupération dynamique de l'URL du site depuis les variables d'environnement (Node.js)
const SITE_URL = process.env.SITE || 'https://jf-aniuta.vercel.app';

export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: vercel(),
  integrations: [
    sitemap({
      customPages: [
        `${SITE_URL}/boutique?cat=Sculptures`,
        `${SITE_URL}/boutique?cat=Tableaux`,
        `${SITE_URL}/boutique?cat=Accessoires`,
        `${SITE_URL}/boutique?cat=Tous`,
      ],
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/panier') &&
        !page.includes('/success') &&
        !page.includes('/cancel') &&
        !page.includes('/merci') &&
        !page.includes('/au-revoir') &&
        !page.includes('/dashboard-48'),
    }),
  ],
});