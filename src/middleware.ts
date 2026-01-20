import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    // Récupération des secrets
    const UPSTASH_URL = process.env.KV_REST_API_URL;
    const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;
    const USER_OK = process.env.DASHBOARD_USER;
    const PASS_OK = process.env.DASHBOARD_PASS;

    // Si les secrets ne sont pas là, on stoppe proprement
    if (!UPSTASH_URL || !UPSTASH_TOKEN || !USER_OK || !PASS_OK) {
      return new Response("Erreur de configuration : Variables manquantes sur Vercel.", { status: 500 });
    }

    const auth = context.request.headers.get("Authorization");

    if (auth) {
      // Décodage manuel compatible Edge & Serverless
      const base64 = auth.split(" ")[1];
      const decoded = atob(base64);
      const [user, pass] = decoded.split(":");

      if (user === USER_OK && pass === PASS_OK) {
        return next();
      }
    }

    return new Response("Acces Protege", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Dashboard"' },
    });
  }

  return next();
});