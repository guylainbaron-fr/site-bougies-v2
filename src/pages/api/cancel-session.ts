import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { kv } from '../../lib/kv';
import type { Produit } from './gestion-produits';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request }) => {
    try {
        const { sessionId } = await request.json();

        if (!sessionId) {
            return new Response(JSON.stringify({ error: "ID de session manquant" }), { status: 400 });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Si la session a déjà été payée ou expirée, on ne fait rien.
        if (session.payment_status === 'paid' || session.status === 'expired') {
            return new Response(JSON.stringify({ success: true, message: "Aucune action requise." }), { status: 200 });
        }

        // On récupère l'ID de l'article unique qui avait été verrouillé
        const lockedItemsIds = session.metadata?.locked_unique_items;

        if (lockedItemsIds) {
            const idsToUnlock = lockedItemsIds.split(',');

            const allProductsData = await kv.get<Produit[]>("boutique:produits");
            const allProducts: Produit[] = Array.isArray(allProductsData) ? allProductsData : [];
            
            let wasModified = false;

            idsToUnlock.forEach(idToUnlock => {
                const productToUnlock = allProducts.find(p => p.id === idToUnlock);

                // On remet le stock à 1 UNIQUEMENT si le stock était à -1 (réservé)
                if (productToUnlock && productToUnlock.stock === -1) {
                    console.log(`Restocking unique item ${idToUnlock} from cancelled session ${session.id}`);
                    productToUnlock.stock = 1;
                    wasModified = true;
                }
            });

            if (wasModified) {
                await kv.set("boutique:produits", allProducts);
            }
        }

        // On expire la session Stripe pour qu'elle ne puisse plus être utilisée
        await stripe.checkout.sessions.expire(sessionId);

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error: any) {
        console.error("Erreur lors de l'annulation de la session:", error);
        return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), { status: 500 });
    }
};