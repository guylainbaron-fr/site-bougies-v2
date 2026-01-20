import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  // On ne protège que le dossier dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    // 1. Récupération des secrets et de l'IP
    const UPSTASH_URL = import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL;
    const UPSTASH_TOKEN = import.meta.env.KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
    const USER_OK = import.meta.env.DASHBOARD_USER || process.env.DASHBOARD_USER;
    const PASS_OK = import.meta.env.DASHBOARD_PASS || process.env.DASHBOARD_PASS;

    const clientIP = context.clientAddress || "unknown";
    const failKey = `fails_${clientIP}`;

    // 2. Vérifier le blocage (Limite à 20)
    const checkRes = await fetch(`${UPSTASH_URL}/get/${failKey}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const { result } = await checkRes.json();
    const currentFails = result ? parseInt(result) : 0;

    if (currentFails >= 20) {
      return new Response("Trop de tentatives. Accès bloqué pour 10 minutes.", { 
        status: 429,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 3. Vérification des identifiants
    const auth = context.request.headers.get("Authorization");

    if (auth) {
      const base64 = auth.split(" ")[1];
      const decoded = globalThis.atob(base64);
      const [user, pass] = decoded.split(":");

      if (user === USER_OK && pass === PASS_OK) {
        // SUCCÈS : On nettoie le compteur immédiatement
        await fetch(`${UPSTASH_URL}/del/${failKey}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
        });
        return next();
      }
    }

    // 4. ÉCHEC : +1 au compteur et expiration à 600 secondes (10 min)
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      body: JSON.stringify([
        ["INCR", failKey],
        ["EXPIRE", failKey, 3600] // 3600 secondes = 1 heure
      ])
    });

    return new Response("Acces Protege", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Dashboard"',
      },
    });
  }

  return next();
});