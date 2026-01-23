import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || '';
        
        // 1. Détection device simplifiée
        let dev = "PC";
        if (/android/i.test(ua)) dev = "Android";
        else if (/iPad|iPhone|iPod/i.test(ua)) dev = "iOS";

        // 2. Préparation du log
        const now = new Date();
        const log = {
            date: now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            device: dev,
            ip: request.headers.get('x-real-ip') || "Anonyme",
            country: data.country || "France",
            flag_code: data.flag || "fr",
            isQR: data.isQR || false
        };

        // 3. Enregistrement (Humain confirmé par le JS)
        await kv.incr('visites_totales');
        await kv.lpush('journal_visites', JSON.stringify(log));
        await kv.ltrim('journal_visites', 0, 99);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}