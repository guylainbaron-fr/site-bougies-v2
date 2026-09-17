// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://jf-aniuta.vercel.app',
  output: 'server',
  adapter: vercel(),
  integrations: [
    tailwind(),
    sitemap({
      customPages: [
        'https://jf-aniuta.vercel.app/boutique?cat=Sculptures',
        'https://jf-aniuta.vercel.app/boutique?cat=Tableaux',
        'https://jf-aniuta.vercel.app/boutique?cat=Accessoires',
        'https://jf-aniuta.vercel.app/boutique?cat=Tous',
      ],
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/panier') &&
        !page.includes('/success') &&
        !page.includes('/cancel') &&
        !page.includes('/merci') &&
        !page.includes('/au-revoir'),
    }),
  ],
});