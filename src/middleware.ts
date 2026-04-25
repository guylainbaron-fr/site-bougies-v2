import type { MiddlewareHandler } from "astro";
import { kv } from "./lib/kv";

// Comparaison sécurisée contre les attaques temporelles
function safeCompare(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Helper pour injecter les headers de sécurité globaux (Anti-Clickjacking, CSP, HSTS)
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  // Empêche le site d'être chargé dans une iframe (Anti-Clickjacking)
  headers.set('X-Frame-Options', 'DENY');
  // Force le navigateur à ne pas deviner le type de contenu
  headers.set('X-Content-Type-Options', 'nosniff');
  // Politique de referrer stricte
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS (Force HTTPS pendant 1 an)
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // CSP renforcée : Ajout de cdnjs.cloudflare.com pour FontAwesome et sécurisation accrue
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://*.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' https://*.vercel-storage.com; object-src 'none'; frame-ancestors 'none';");
  
  // Indique aux caches que la réponse dépend de l'authentification
  headers.set('Vary', 'Authorization');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  // On cible uniquement les routes du dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    // Récupération de l'IP
    const rawIP = context.request.headers.get('x-real-ip') || context.request.headers.get('x-forwarded-for') || "Anonyme";
    const userIP = rawIP.split(',')[0].trim();
    const GHOST_IP = import.meta.env.GHOST_MODE_IP;
    const lockKey = `brute_force_lock:${userIP}`;

    // --- PROTECTION CSRF ---
    if (context.request.method !== "GET" && context.request.method !== "HEAD") {
      const origin = context.request.headers.get("origin");
      try {
        if (!origin || new URL(origin).hostname !== context.url.hostname) {
          return withSecurityHeaders(new Response("Requête interdite : Origine non autorisée.", { status: 403 }));
        }
      } catch (e) {
        return withSecurityHeaders(new Response("Requête interdite : En-tête malformé.", { status: 403 }));
      }
    }

    try {
      // 0. Whitelist pour le mode fantôme (Bureau)
      if (GHOST_IP && userIP === GHOST_IP) {
        return withSecurityHeaders(await next());
      }

      const USER_OK = import.meta.env.DASHBOARD_USER;
      const PASS_OK = import.meta.env.DASHBOARD_PASS;

      // 1. Vérification si l'IP est temporairement bloquée
      const isLocked = await kv.get(lockKey);
      if (isLocked) {
        return withSecurityHeaders(new Response("Trop de tentatives. Réessayez dans 15 minutes.", { status: 429 }));
      }

      if (!USER_OK || !PASS_OK) {
        return withSecurityHeaders(new Response("Configuration Error", { status: 500 }));
      }

      const auth = context.request.headers.get("Authorization");

      if (auth) {
        const parts = auth.split(" ");
        try {
          if (parts.length !== 2) throw new Error("Format d'authentification invalide");
          
          // Décodage sécurisé : atob peut échouer si parts[1] n'est pas du base64 valide
          const decoded = atob(parts[1] || "");
          const authParts = decoded.split(":");
          if (authParts.length !== 2) throw new Error("Format de credentials invalide");

          const [user, pass] = authParts;
          if (safeCompare(user, USER_OK) && safeCompare(pass, PASS_OK)) {
            // Succès : on nettoie les tentatives de l'IP
            await kv.del(`failed_attempts:${userIP}`);
            return withSecurityHeaders(await next());
          } else {
            // ÉCHEC : On incrémente le compteur
            const attempts = (await kv.incr(`failed_attempts:${userIP}`)) as number;
            
            // Au bout de 5 erreurs, blocage 15 min (900 sec)
            if (attempts >= 5) {
              await kv.set(lockKey, "true", { ex: 900 }); 
              await kv.del(`failed_attempts:${userIP}`);
            }
          }
        } catch (decodeError) {
          console.warn("Middleware: Failed to decode Basic Auth credentials", decodeError);
          // Traiter comme un échec d'authentification pour éviter de révéler des informations
        }
      }
    } catch (error) {
      // En cas de problème avec la base de données (ex: mauvais token)
      console.error("KV Error in Middleware:", error);
      return withSecurityHeaders(new Response("Database Connection Error", { status: 500 }));
    }

    // Demande de Basic Auth
    return withSecurityHeaders(new Response("Accès restreint", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Administration"',
        "Cache-Control": "no-store",
      },
    }));
  }

  return withSecurityHeaders(await next());
};