import type { MiddlewareHandler } from "astro";
import { kv } from "@vercel/kv";

export const onRequest: MiddlewareHandler = async (context, next) => {
  // On cible uniquement les routes du dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    const USER_OK = import.meta.env.DASHBOARD_USER;
    const PASS_OK = import.meta.env.DASHBOARD_PASS;
    
    const userIP = context.request.headers.get('x-real-ip') || "Anonyme";
    const lockKey = `brute_force_lock:${userIP}`;

    // 1. Vérification si l'IP est temporairement bloquée
    const isLocked = await kv.get(lockKey);
    if (isLocked) {
      return new Response("Trop de tentatives. Réessayez dans 15 minutes.", { status: 429 });
    }

    if (!USER_OK || !PASS_OK) {
      return new Response("Configuration Error: Missing credentials", { status: 500 });
    }

    const auth = context.request.headers.get("Authorization");

    if (auth) {
      try {
        const base64 = auth.split(" ")[1];
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        const [user, pass] = decoded.split(":");

        if (user === USER_OK && pass === PASS_OK) {
          // Succès : on peut supprimer les échecs précédents si on veut être sympa
          await kv.del(`failed_attempts:${userIP}`);
          return next();
        } else {
          // ÉCHEC : On compte l'erreur
          const attempts = await kv.incr(`failed_attempts:${userIP}`);
          
          // Au bout de 5 erreurs, on bloque l'IP pour 15 minutes (900 secondes)
          if (attempts >= 5) {
            await kv.set(lockKey, "true", { ex: 900 }); 
            await kv.del(`failed_attempts:${userIP}`);
          }
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