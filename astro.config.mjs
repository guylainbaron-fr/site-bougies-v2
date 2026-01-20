import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel"; // Import standard

export default defineConfig({
  integrations: [tailwind()],
  output: 'server',
  adapter: vercel({
    edgeMiddleware: true, // Ceci active le mode Edge sur Vercel
  }),
});