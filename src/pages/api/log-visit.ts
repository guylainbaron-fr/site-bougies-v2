// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || request.headers.get('user-agent') || '';
        
        // Détection Robot
        const isBot = /(googlebot|bingbot|yandexbot|duckduckbot|baiduspider|twitterbot|facebookexternalhit|ia_archiver|robot|bot|spider|headless|chrome-lighthouse)/i.test(ua);

        // Détection Device pour les humains
        let dev = "PC";
        if (isBot) dev = "Bot";
        else if (/android/i.test(ua)) dev = "Android";
        else if (/iPad|iPhone|iPod/i.test(ua)) dev = "iOS";

        const log = {
            date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            device: dev,
            ip: request.headers.get('x-real-ip') || "Anonyme",
            country: data.country || "France",
            flag_code: data.flag || "fr",
            isQR: data.isQR || false
        };

        // RÈGLE : On incrémente le compteur TOTAL uniquement si ce n'est PAS un bot
        if (!isBot) {
            await kv.incr('visites_totales');
        }

        // On ajoute quand même le log dans le journal pour le voir
        await kv.lpush('journal_visites', JSON.stringify(log));
        await kv.ltrim('journal_visites', 0, 99);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e }), { status: 500 });
    }
}