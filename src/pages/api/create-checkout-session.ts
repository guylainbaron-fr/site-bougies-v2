import type { APIRoute } from 'astro';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request }) => {
    try {
        const { cart, email, mode_livraison, id_relais, infos_relais } = await request.json();
        const siteUrl = new URL(request.url).origin;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: cart.map((item: any) => ({
                price_data: {
                    currency: 'eur',
                    product_data: { name: item.nom },
                    unit_amount: Math.round(item.prix * 100),
                },
                quantity: item.quantity,
            })),
            mode: 'payment',
            customer_email: email,
            success_url: `${siteUrl}/merci?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/panier`,
            metadata: {
                mode_livraison,
                id_relais: id_relais || '',
                infos_relais: infos_relais || '',
                client_email: email
            },
            shipping_address_collection: { allowed_countries: ['FR'] },
        });

        return new Response(JSON.stringify({ url: session.url }), { status: 200 });
    } catch (error: any) {
        console.error("Erreur Checkout:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};