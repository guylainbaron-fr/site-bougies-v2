import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  // Ajoute cette option pour aider Astro à trouver les variables
  vite: {
    define: {
      'process.env': process.env,
    },
  },
});