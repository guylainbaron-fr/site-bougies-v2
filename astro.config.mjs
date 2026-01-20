import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel/edge"; // BIEN UTILISER /edge ici

export default defineConfig({
  integrations: [tailwind()],
  output: 'server',
  adapter: vercel()
});