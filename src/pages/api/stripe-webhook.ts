import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { kv } from '../../lib/kv';
import type { Produit } from './gestion-produits';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

// La clé secrète que vous obtiendrez depuis le dashboard Stripe
const endpointSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    const signature = request.headers.get('stripe-signature');
    const body = await request.text();

    if (!signature) {
        return new Response('Signature manquante', { status: 400 });
    }
    if (!endpointSecret) {
        console.error("Erreur: La variable d'environnement STRIPE_WEBHOOK_SECRET n'est pas définie.");
        return new Response('Configuration du webhook manquante côté serveur.', { status: 500 });
    }

    let event: Stripe.Event;

    try {
        // Vérification que la notification vient bien de Stripe
        event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // On ne traite que l'événement qui nous intéresse : l'expiration d'une session
    if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;

        // On récupère l'ID de l'article unique qui avait été verrouillé
        const lockedItemsIds = session.metadata?.locked_unique_items;

        if (lockedItemsIds) {
            const idsToUnlock = lockedItemsIds.split(',');

            try {
                const allProductsData = await kv.get("boutique:produits");
                const allProducts: Produit[] = Array.isArray(allProductsData) ? allProductsData : [];
                
                let wasModified = false;

                idsToUnlock.forEach(idToUnlock => {
                    const productToUnlock = allProducts.find(p => p.id === idToUnlock);

                    // On remet le stock à 1 UNIQUEMENT si le stock était à -1 (réservé)
                    if (productToUnlock && productToUnlock.stock === -1) {
                        console.log(`Restocking unique item ${idToUnlock} from expired session ${session.id}`);
                        productToUnlock.stock = 1;
                        wasModified = true;
                    }
                });

                if (wasModified) {
                    await kv.set("boutique:produits", allProducts);
                }

            } catch (dbError) {
                console.error(`Failed to restock item(s) ${lockedItemsIds}:`, dbError);
                // On retourne une erreur 500 pour que Stripe puisse réessayer plus tard
                return new Response('Database error during restock', { status: 500 });
            }
        }
    }

    // On répond à Stripe que tout s'est bien passé
    return new Response(JSON.stringify({ received: true }), { status: 200 });
};