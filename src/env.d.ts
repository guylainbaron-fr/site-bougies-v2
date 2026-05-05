// env.d.ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly KV_REST_API_URL: string;
  readonly KV_REST_API_TOKEN: string;
  readonly DASHBOARD_USER: string;
  readonly DASHBOARD_PASS: string;
  readonly GHOST_MODE_IP: string;
  readonly ADMIN_TOKEN: string;
  readonly SITE: string;
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}