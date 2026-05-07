import type { APIRoute } from 'astro';
import { kv } from '../../lib/kv';

export const prerender = false;

export const GET: APIRoute = async () => {
    try {
        const results = await kv.mget<string[]>('duel_vote:majestueux', 'duel_vote:curieux');
        const majVotes = parseInt(results[0] || "0", 10) || 0;
        const curVotes = parseInt(results[1] || "0", 10) || 0;
        const total = majVotes + curVotes;

        const perMaj = total > 0 ? Math.round((majVotes / total) * 100) : 0;
        const perCur = total > 0 ? Math.round((curVotes / total) * 100) : 0;

        return new Response(JSON.stringify({ perMaj, perCur }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Impossible de charger les scores" }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const { choice } = await request.json();

        // Validation simple du choix
        if (choice !== 'majestueux' && choice !== 'curieux') {
            return new Response(JSON.stringify({ error: "Choix invalide" }), { status: 400 });
        }

        // 1. Incrémenter le vote pour le choix spécifique
        const key = `duel_vote:${choice}`;
        await kv.incr(key);

        // 2. Récupérer les totaux actuels (on traite en string pour la robustesse)
        const results = await kv.mget<string[]>('duel_vote:majestueux', 'duel_vote:curieux');
        
        const majVotes = parseInt(results[0] || "0", 10) || 0;
        const curVotes = parseInt(results[1] || "0", 10) || 0;
        const total = majVotes + curVotes;

        // 3. Calculer les pourcentages
        const perMaj = total > 0 ? Math.round((majVotes / total) * 100) : 0;
        const perCur = total > 0 ? Math.round((curVotes / total) * 100) : 0;

        return new Response(JSON.stringify({ 
            perMaj, 
            perCur 
        }), { status: 200 });
    } catch (error) {
        console.error("Erreur API Vote:", error);
        return new Response(JSON.stringify({ error: "Erreur lors du traitement du vote" }), { status: 500 });
    }
};