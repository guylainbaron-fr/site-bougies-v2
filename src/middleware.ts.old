import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  // On cible uniquement les routes du dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    // Récupération sécurisée (compatible Node.js et Edge)
    const USER_OK = process.env.DASHBOARD_USER || import.meta.env.DASHBOARD_USER;
    const PASS_OK = process.env.DASHBOARD_PASS || import.meta.env.DASHBOARD_PASS;

    // En production, si les variables manquent, on logge l'erreur en interne 
    // mais on affiche un message neutre à l'utilisateur.
    if (!USER_OK || !PASS_OK) {
      console.error("CRITICAL: Dashboard credentials are not set in environment variables.");
      return new Response("Service Unavailable", { status: 503 });
    }

    const auth = context.request.headers.get("Authorization");

    if (auth) {
      try {
        const base64 = auth.split(" ")[1];
        // atob est disponible nativement dans les runtimes Vercel (Edge & Node 16+)
        const decoded = atob(base64);
        const [user, pass] = decoded.split(":");

        if (user === USER_OK && pass === PASS_OK) {
          return next();
        }
      } catch (error) {
        // En cas d'erreur de décodage, on laisse tomber et on redemande l'auth
        console.error("Auth decoding failed:", error);
      }
    }

    // Si pas d'auth ou mauvaise auth : demande d'identification
    return new Response("Accès restreint", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Administration"',
        "Cache-Control": "no-store", // Crucial pour éviter que le navigateur cache l'accès
      },
    });
  }

  // Pour toutes les autres pages, on continue normalement
  return next();
});