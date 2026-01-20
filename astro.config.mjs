import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless'; // On garde l'adaptateur pour les fonctions si besoin

export default defineConfig({
  output: 'static', // ON REPASSE EN STATIQUE
  adapter: vercel(),
});