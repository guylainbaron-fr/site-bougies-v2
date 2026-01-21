import type { MiddlewareHandler } from "astro";

export const onRequest: MiddlewareHandler = async (context, next) => {
  // On cible uniquement les routes du dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    const USER_OK = import.meta.env.DASHBOARD_USER;
    const PASS_OK = import.meta.env.DASHBOARD_PASS;

    if (!USER_OK || !PASS_OK) {
      return new Response("Configuration Error: Missing credentials", { status: 500 });
    }

    const auth = context.request.headers.get("Authorization");

    if (auth) {
      try {
        const base64 = auth.split(" ")[1];
        // Utilisation de Buffer (Node.js/Vercel) pour le décodage
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        const [user, pass] = decoded.split(":");

        if (user === USER_OK && pass === PASS_OK) {
          return next();
        }
      } catch (error) {
        console.error("Auth error");
      }
    }

    return new Response("Accès restreint", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Administration"',
        "Cache-Control": "no-store",
      },
    });
  }

  return next();
};