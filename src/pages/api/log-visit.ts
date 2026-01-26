// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || request.headers.get('user-agent') || '';
        
        // 1. DÉTECTION IP ET PAYS (Via Vercel Headers)
        const ip = request.headers.get('x-real-ip') || "Anonyme";
        const countryCodeRaw = request.headers.get('x-vercel-ip-country');
        const countryCode = countryCodeRaw ? countryCodeRaw.toLowerCase() : "un";

        // 2. LA REGEX MUSCLÉE (Identité du visiteur)
        // On cible les bots de crawl, les outils SEO et les scripts automatiques
        const isBot = /(googlebot|bingbot|yandexbot|duckduckbot|baiduspider|twitterbot|facebookexternalhit|ia_archiver|robot|bot|spider|headless|chrome-lighthouse|lighthouse|inspect|ahrefsbot|semrushbot|dotbot|python|axios|curl|wget|go-http-client|java|php|postman|runtime|insomnia|nimbostratus)/i.test(ua);

        // 3. DÉTERMINATION DE L'APPAREIL
        let dev = "PC";
        if (isBot) {
            dev = "Bot";
        } else if (/android/i.test(ua)) {
            dev = "Android";
        } else if (/iPad|iPhone|iPod/i.test(ua)) {
            dev = "iOS";
        }

        // 4. PRÉPARATION DU LOG POUR LE JOURNAL
        const log = {
            date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            device: dev,
            ip: ip,
            // Formatage propre pour ton Dashboard
            country: countryCode === "fr" ? "FRANCE" : countryCode.toUpperCase(),
            flag_code: countryCode, 
            isQR: data.isQR || false
        };

        // --- RÈGLE D'OR POUR TES STATS ---
        // On n'incrémente 'visites_totales' que si ce n'est PAS un bot
        if (!isBot) {
            await kv.incr('visites_totales');
        }

        // On sauvegarde quand même l'entrée dans le journal (les 100 derniers)
        // Cela te permet de voir les bots passer dans l'onglet "Bots" de ton dashboard
        await kv.lpush('journal_visites', JSON.stringify(log));
        await kv.ltrim('journal_visites', 0, 99);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        console.error("Erreur API Log:", e);
        return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
    }
}