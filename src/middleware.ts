import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  // On ne protège que le dossier dashboard
  if (context.url.pathname.startsWith("/dashboard-48")) {
    
    // 1. Récupération des secrets (Priorité à process.env sur Vercel)
    const UPSTASH_URL = process.env.KV_REST_API_URL || import.meta.env.KV_REST_API_URL;
    const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN || import.meta.env.KV_REST_API_TOKEN;
    const USER_OK = process.env.DASHBOARD_USER || import.meta.env.DASHBOARD_USER;
    const PASS_OK = process.env.DASHBOARD_PASS || import.meta.env.DASHBOARD_PASS;

    // SECURITÉ : Si les variables manquent, on affiche une erreur claire au lieu d'une 500
    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
      return new Response("Configuration Upstash manquante dans Vercel", { status: 500 });
    }

    const clientIP = context.clientAddress || "unknown";
    const failKey = `fails_${clientIP}`;

    try {
      // 2. Vérifier le blocage
      const checkRes = await fetch(`${UPSTASH_URL}/get/${failKey}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const data = await checkRes.json();
      const currentFails = data.result ? parseInt(data.result) : 0;

      if (currentFails >= 20) {
        return new Response("Trop de tentatives. Accès bloqué.", { status: 429 });
      }

      // 3. Vérification des identifiants
      const auth = context.request.headers.get("Authorization");

      if (auth) {
        const base64 = auth.split(" ")[1];
        const decoded = Buffer.from(base64, 'base64').toString(); // Plus robuste sur Vercel
        const [user, pass] = decoded.split(":");

        if (user === USER_OK && pass === PASS_OK) {
          await fetch(`${UPSTASH_URL}/del/${failKey}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
          });
          return next();
        }
      }

      // 4. ÉCHEC : Logique de pénalité
      await fetch(`${UPSTASH_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        body: JSON.stringify([
          ["INCR", failKey],
          ["EXPIRE", failKey, 3600]
        ])
      });

      return new Response("Acces Protege", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Dashboard"' },
      });

    } catch (e) {
      console.error("Erreur Middleware:", e);
      return new Response("Erreur de connexion a la base de donnees", { status: 500 });
    }
  }

  return next();
});