// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || request.headers.get('user-agent') || '';
        
        // 1. Détection IP et Pays via Vercel (Headers automatiques)
        const ip = request.headers.get('x-real-ip') || "Anonyme";
        
        // On récupère le code pays (FR, US, etc.). Si Vercel ne trouve pas, on met "inconnu"
        const countryCodeRaw = request.headers.get('x-vercel-ip-country');
        const countryCode = countryCodeRaw ? countryCodeRaw.toLowerCase() : "un"; // "un" pour unknown

        // 2. Détection Robot
        const isBot = /(googlebot|bingbot|yandexbot|duckduckbot|baiduspider|twitterbot|facebookexternalhit|ia_archiver|robot|bot|spider|headless|chrome-lighthouse)/i.test(ua);

        // 3. Détection Device
        let dev = "PC";
        if (isBot) dev = "Bot";
        else if (/android/i.test(ua)) dev = "Android";
        else if (/iPad|iPhone|iPod/i.test(ua)) dev = "iOS";

        // 4. Préparation du log
        const log = {
            date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            device: dev,
            ip: ip,
            // Si c'est "FR" on écrit FRANCE, sinon on laisse le code pays (ex: US, GB)
            // Ton dashboard s'occupera de l'afficher proprement
            country: countryCode === "fr" ? "FRANCE" : countryCode.toUpperCase(),
            flag_code: countryCode, 
            isQR: data.isQR || false
        };

        // RÈGLE : Incrémenter les statistiques uniquement si ce n'est PAS un bot
        if (!isBot) {
            await kv.incr('visites_totales');
        }

        // Sauvegarde dans le journal (les 100 derniers)
        await kv.lpush('journal_visites', JSON.stringify(log));
        await kv.ltrim('journal_visites', 0, 99);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        console.error("Erreur API Log:", e);
        return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
    }
}