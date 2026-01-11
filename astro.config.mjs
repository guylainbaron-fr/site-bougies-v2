import { defineConfig } from 'astro/config';
// ... tes autres imports

export default defineConfig({
  // ... ton adapter Vercel, etc.
  build: {
    inlineStylesheets: 'always'
  }
});