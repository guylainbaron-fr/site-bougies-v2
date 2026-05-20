import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
    try {
        // 1. Récupérer TOUT le journal actuel
        const journalRaw = await kv.lrange('journal_visites', 0, -1);
        
        if (!journalRaw || journalRaw.length === 0) {
            return new Response(JSON.stringify({ message: "Le journal est déjà vide" }), { status: 200 });
        }

        const journalCorrige: any[] = [];

        // 2. Parser, corriger ou filtrer les logs un par un
        for (const item of journalRaw) {
            const log = typeof item === 'string' ? JSON.parse(item) : item;

            // --- FILTRE AMAZON : Si c'est l'IP d'Amazon, on l'éjecte (on ne l'ajoute pas au tableau) ---
            if (log.ip && log.ip.startsWith('35.')) {
                continue; 
            }

            // --- CORRECTION GOOGLE : Si c'est Google, on labellise proprement ---
            if (log.ip && log.ip.startsWith('66.249.')) {
                log.device = "Googlebot";
                log.source = "Google";
            }

            journalCorrige.push(log);
        }

        // 3. Supprimer l'ancien journal pollué
        await kv.del('journal_visites');

        // 4. Réinsérer les logs propres dans le bon ordre
        // On inverse car LPUSH empile par le haut (le dernier inséré devient le premier affiché)
        for (const log of journalCorrige.reverse()) {
            await kv.lpush('journal_visites', JSON.stringify(log));
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `Base nettoyée ! Les serveurs Amazon ont été supprimés et Googlebot a été corrigé.` 
        }), { status: 200 });

    } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: "Erreur lors du nettoyage" }), { status: 500 });
    }
};