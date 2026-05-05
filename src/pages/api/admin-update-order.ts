import type { APIRoute } from 'astro';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request }) => {
    try {
        const { paymentIntentId, statut_livraison, archived } = await request.json();

        if (!paymentIntentId) {
            return new Response(JSON.stringify({ error: "ID de paiement manquant" }), { status: 400 });
        }

        // On prépare un objet de métadonnées dynamique
        // Stripe ne mettra à jour que les clés fournies ici
        const metadata: Record<string, string> = {};
        
        // Si on remet en attente, on vide la métadonnée (plus propre pour Stripe)
        if (statut_livraison !== undefined) {
            metadata.statut_livraison = statut_livraison === 'en_attente' ? "" : statut_livraison;
        }
        
        if (archived !== undefined) metadata.archived = archived;

        await stripe.paymentIntents.update(paymentIntentId, { metadata });

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error("Erreur mise à jour commande:", error);
        return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
    }
};