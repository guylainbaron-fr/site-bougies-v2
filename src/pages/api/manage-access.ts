// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { ip, action } = await request.json();
        if (!ip) return new Response(JSON.stringify({ error: "IP manquante" }), { status: 400 });

        if (action === 'ban') {
            await kv.sadd('banned_ips', ip);
            return new Response(JSON.stringify({ message: `L'IP ${ip} est maintenant bloquée.` }));
        } else {
            await kv.srem('banned_ips', ip);
            return new Response(JSON.stringify({ message: `L'IP ${ip} a été débloquée.` }));
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
    }
}