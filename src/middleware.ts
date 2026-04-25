import type { MiddlewareHandler } from "astro";
import { kv } from "./lib/kv";

export const onRequest: MiddlewareHandler = async (context, next) => {
  // On cible uniquement les routes du dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    const USER_OK = import.meta.env.DASHBOARD_USER;
    const PASS_OK = import.meta.env.DASHBOARD_PASS;
    
    // Récupération de l'IP (x-real-ip est plus direct sur Vercel)
    const userIP = context.request.headers.get('x-real-ip') || context.request.headers.get('x-forwarded-for') || "Anonyme";
    const GHOST_IP = import.meta.env.GHOST_MODE_IP;
    const lockKey = `brute_force_lock:${userIP}`;

    // --- PROTECTION CSRF ---
    if (context.request.method !== "GET" && context.request.method !== "HEAD") {
      const origin = context.request.headers.get("origin");
      try {
        if (!origin || new URL(origin).host !== context.url.host) {
          return new Response("Requête interdite : Origine non autorisée.", { status: 403 });
        }
      } catch (e) {
        return new Response("Requête interdite : En-tête malformé.", { status: 403 });
      }
    }

    try {
      // 0. Whitelist pour le mode fantôme (Bureau)
      if (GHOST_IP && userIP === GHOST_IP) {
        return next();
      }

      // 1. Vérification si l'IP est temporairement bloquée
      const isLocked = await kv.get(lockKey);
      if (isLocked) {
        return new Response("Trop de tentatives. Réessayez dans 15 minutes.", { status: 429 });
      }

      if (!USER_OK || !PASS_OK) {
        return new Response("Configuration Error: Missing credentials in .env", { status: 500 });
      }

      const auth = context.request.headers.get("Authorization");

      if (auth) {
        const base64 = auth.split(" ")[1];
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        const [user, pass] = decoded.split(":");

        if (user === USER_OK && pass === PASS_OK) {
          // Succès : on nettoie les tentatives de l'IP
          await kv.del(`failed_attempts:${userIP}`);
          return next();
        } else {
          // ÉCHEC : On incrémente le compteur
          const attempts = (await kv.incr(`failed_attempts:${userIP}`)) as number;
          
          // Au bout de 5 erreurs, blocage 15 min (900 sec)
          if (attempts >= 5) {
            await kv.set(lockKey, "true", { ex: 900 }); 
            await kv.del(`failed_attempts:${userIP}`);
          }
        }
      }
    } catch (error) {
      // En cas de problème avec la base de données (ex: mauvais token)
      console.error("KV Error in Middleware:", error);
      // On laisse passer ou on bloque selon ta préférence, ici on bloque par sécurité
      return new Response("Database Connection Error", { status: 500 });
    }

    // Demande de Basic Auth
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