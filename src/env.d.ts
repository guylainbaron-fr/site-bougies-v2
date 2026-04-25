// env.d.ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly KV_REST_API_URL: string;
  readonly KV_REST_API_TOKEN: string;
  readonly DASHBOARD_USER: string;
  readonly DASHBOARD_PASS: string;
  readonly GHOST_MODE_IP: string;
  // Ajoute ici tes futures variables Stripe si tu veux l'autocomplétion
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}