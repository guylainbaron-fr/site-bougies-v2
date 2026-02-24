import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server', // On active le mode serveur
  adapter: vercel(),
  integrations: [tailwind()],
});