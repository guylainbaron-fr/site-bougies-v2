import type { APIRoute } from 'astro';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const GET: APIRoute = async () => {
    try {
        // On récupère les 20 dernières sessions de paiement terminées
        const sessions = await stripe.checkout.sessions.list({
            limit: 20,
            status: 'complete',
            expand: ['data.payment_intent', 'data.line_items'] // Indispensable pour avoir le détail des articles
        });

        const orders = sessions.data.map(session => {
            const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
            
            // On récupère le détail des articles (line_items)
            const items = session.line_items?.data || [];
            const panierDescription = items
                .filter(item => !item.description?.toLowerCase().includes('livraison') && !item.description?.toLowerCase().includes('emballage'))
                .map(item => `<div class="prep-item"><span class="prep-qty">${item.quantity}x</span> ${item.description.trim()}</div>`)
                .join('');
            
            return {
                id: session.id,
                created: session.created, // Timestamp brut pour calcul d'ancienneté
                paymentIntentId: paymentIntent?.id,
                date: new Date(session.created * 1000).toLocaleDateString('fr-FR'),
                client: session.customer_details?.name,
                email: session.customer_details?.email,
                telephone: session.customer_details?.phone,
                adresse: paymentIntent?.shipping?.address || session.customer_details?.address,
                total: session.amount_total ? session.amount_total / 100 : 0,
                panier: panierDescription || session.metadata?.details_commande || null,
                mode_livraison: session.metadata?.mode_livraison || 'colissimo',
                infos_relais: session.metadata?.infos_relais || null,
                statut_paiement: session.payment_status,
                statut_livraison: paymentIntent?.metadata?.statut_livraison || 'en_attente',
                archived: paymentIntent?.metadata?.archived === 'true'
            }
        });

        return new Response(JSON.stringify(orders), { status: 200 });
    } catch (error) {
        console.error("Erreur listing commandes:", error);
        return new Response(JSON.stringify({ error: "Impossible de récupérer les commandes" }), { status: 500 });
    }
};