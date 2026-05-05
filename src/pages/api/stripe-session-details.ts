import type { APIRoute } from 'astro';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const GET: APIRoute = async ({ url }) => {
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
        return new Response(JSON.stringify({ error: "ID de session manquant" }), { status: 400 });
    }

    try {
        // On récupère la session et on "expand" les line_items pour avoir le détail des produits
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['line_items', 'payment_intent'],
        });

        return new Response(JSON.stringify({
            customer_details: session.customer_details,
            amount_total: session.amount_total,
            line_items: session.line_items?.data,
            currency: session.currency,
            created: session.created,
            metadata: session.metadata,
            order_id: (session.payment_intent as any)?.id || session.id
        }), { status: 200 });

    } catch (error) {
        console.error("Erreur Stripe Details:", error);
        return new Response(JSON.stringify({ error: "Impossible de récupérer les détails" }), { status: 500 });
    }
};