import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { kv } from './../lib/kv';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

/**
 * Cette API a deux modes :
 * 1. Mode Client : Utilise `session_id`. C'est un "one-time use".
 *    - Vérifie si la facture a déjà été "réclamée" (consultée).
 *    - Si non, renvoie les détails et marque la session comme réclamée dans KV.
 *    - Si oui, renvoie une erreur 403 pour empêcher la re-consultation.
 * 2. Mode Admin : Utilise `admin_pi` (Payment Intent ID).
 *    - Recherche la session de checkout associée au Payment Intent.
 *    - Renvoie toujours les détails sans marquer la session comme réclamée.
 *    - C'est sécurisé car la page du dashboard est protégée par mot de passe.
 */
export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');
    const adminPi = url.searchParams.get('admin_pi');

    if (!sessionId && !adminPi) {
        return new Response(JSON.stringify({ error: "Identifiant de session ou de paiement manquant." }), { status: 400 });
    }

    let session: Stripe.Checkout.Session;

    try {
        if (adminPi) {
            // --- MODE ADMIN ---
            const sessions = await stripe.checkout.sessions.list({ payment_intent: adminPi, limit: 1 });
            if (sessions.data.length === 0) {
                return new Response(JSON.stringify({ error: "Aucune session de paiement trouvée pour cet identifiant." }), { status: 404 });
            }
            session = sessions.data[0];

        } else if (sessionId) {
            // --- MODE CLIENT ---
            const claimKey = `invoice_claimed:${sessionId}`;
            const isClaimed = await kv.get(claimKey);

            if (isClaimed) {
                return new Response(JSON.stringify({ error: "Cette facture a déjà été consultée et le lien a expiré." }), { status: 403 });
            }

            session = await stripe.checkout.sessions.retrieve(sessionId);

            // On marque la facture comme réclamée avec une expiration de 24h (sécurité supplémentaire)
            await kv.set(claimKey, 'true', { ex: 86400 });
        } else {
            // Ne devrait jamais arriver grâce à la première vérification, mais c'est une bonne pratique.
            return new Response(JSON.stringify({ error: "Requête invalide." }), { status: 400 });
        }

        // On s'assure que la session a bien été payée avant de renvoyer les infos
        if (session.payment_status !== 'paid') {
            return new Response(JSON.stringify({ error: "Le paiement pour cette session n'est pas confirmé." }), { status: 402 });
        }

        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });

        const responsePayload = {
            id: session.id,
            order_id: session.payment_intent,
            amount_total: session.amount_total,
            customer_details: session.customer_details,
            created: session.created,
            metadata: session.metadata,
            line_items: lineItems.data,
        };

        return new Response(JSON.stringify(responsePayload), { status: 200 });

    } catch (error) {
        console.error("Erreur API claim-invoice:", error);
        return new Response(JSON.stringify({ error: "Impossible de récupérer les détails de la commande." }), { status: 500 });
    }
};