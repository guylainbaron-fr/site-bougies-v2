import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { kv } from '../../lib/kv';
import { Produit } from './gestion-produits'; // Importe l'interface Produit

export const prerender = false;

// Initialise Stripe avec votre clé secrète
const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY); // Retiré apiVersion pour utiliser la version par défaut de la librairie

export const POST: APIRoute = async ({ request }) => {
    try {
        const { cartItems, shippingFee, packagingFee, shippingMethod, relayData } = await request.json();
        
        let siteUrl = import.meta.env.SITE;

        if (!siteUrl) {
            // Fallback pour le développement local si SITE n'est pas explicitement défini
            if (import.meta.env.DEV) {
                siteUrl = 'http://localhost:4321'; // URL par défaut du serveur de développement Astro
                console.warn("Avertissement: La variable d'environnement SITE n'est pas définie. Utilisation de 'http://localhost:4321' pour le développement local.");
            } else {
                console.error("Erreur: La variable d'environnement SITE n'est pas définie dans astro.config.mjs ou .env");
                return new Response(JSON.stringify({ error: "Configuration du site manquante (SITE URL)." }), { status: 500 });
            }
        }
        siteUrl = siteUrl.replace(/\/$/, ''); // S'assure qu'il n'y a pas de slash final

        if (!siteUrl) {
            console.error("Erreur: La variable d'environnement SITE n'est pas définie dans astro.config.mjs ou .env");
            return new Response(JSON.stringify({ error: "Configuration du site manquante (SITE URL)." }), { status: 500 });
        }

        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return new Response(JSON.stringify({ error: "Le panier est vide ou invalide." }), { status: 400 });
        }

        // Récupère tous les produits de KV pour valider les prix et les détails côté serveur
        const storedProductsData = await kv.get("boutique:produits");
        const storedProducts: Produit[] = Array.isArray(storedProductsData) ? storedProductsData : [];
        const productMap = new Map<string, Produit>();
        storedProducts.forEach(p => productMap.set(p.id, p));

        const line_items: any[] = []; // Utilisation de any pour contourner les erreurs de types liées aux versions de la lib Stripe

        for (const item of cartItems) {
            const productId = item.id;
            const quantity = Math.max(1, Math.floor(Number(item.quantite))); // Correction : utiliser 'quantite' envoyé par le panier

            if (!productId || quantity <= 0) {
                continue; // Ignore les articles de panier invalides
            }

            const product = productMap.get(productId);

            // SÉCURITÉ : Bloque les articles exclusifs à l'atelier
            if (product?.enMagasinUniquement) {
                return new Response(JSON.stringify({ error: `L'article "${item.nom}" est disponible uniquement à l'atelier.` }), { status: 400 });
            }

            if (!product || product.stock < quantity) {
                // Gère les produits en rupture de stock ou invalides
                return new Response(JSON.stringify({ error: `Produit "${item.nom}" indisponible ou stock insuffisant.` }), { status: 400 });
            }

            // On s'assure que l'URL de l'image est absolue pour Stripe
            const imageUrl = product.image?.startsWith('http') ? product.image : `${siteUrl}${product.image}`;

            line_items.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: product.nom,
                        images: product.image ? [imageUrl] : [],
                        description: product.description,
                    },
                    unit_amount: Math.round(product.prix * 100), // Le prix doit être en centimes
                },
                quantity: quantity,
            });
        }

        // Ajout des frais de livraison (si présents et supérieurs à 0)
        if (shippingFee && Number(shippingFee) > 0) {
            const methodLabel = shippingMethod === 'mondialrelay' ? 'Mondial Relay' : 'Colissimo';
            line_items.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Livraison ${methodLabel}`,
                        description: shippingMethod === 'mondialrelay' ? 'Livraison en Point Relais' : 'Livraison à domicile',
                    },
                    unit_amount: Math.round(Number(shippingFee) * 100), // Conversion en centimes
                },
                quantity: 1,
            });
        }

        // Ajout des frais d'emballage (si présents et supérieurs à 0)
        if (packagingFee && Number(packagingFee) > 0) {
            line_items.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Frais d\'emballage',
                    },
                    unit_amount: Math.round(Number(packagingFee) * 100), // Conversion en centimes
                },
                quantity: 1,
            });
        }

        if (line_items.length === 0) {
            return new Response(JSON.stringify({ error: "Aucun article valide dans le panier." }), { status: 400 });
        }

        // Préparation d'un résumé pour les métadonnées (visible par l'admin dans Stripe)
        const orderSummary = cartItems
            .map(item => {
                const p = productMap.get(item.id);
                return p ? `${p.nom} (x${item.quantite})` : null;
            })
            .filter(Boolean)
            .join(', ')
            .substring(0, 500); // Limite de Stripe pour une valeur de metadata

        const infosRelais = relayData ? `${relayData.name} (${relayData.id}) - ${relayData.address}` : '';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: line_items,
            mode: 'payment',
            // --- AJOUTS ICI ---
            metadata: {
                details_commande: orderSummary,
                mode_livraison: shippingMethod || 'colissimo',
                infos_relais: infosRelais
            },
            shipping_address_collection: {
                allowed_countries: ['FR'], // Uniquement la France
            },
            phone_number_collection: {
                enabled: true, // Optionnel mais recommandé pour le livreur
            },
            // ------------------
            payment_intent_data: {
                metadata: {
                    details_commande: orderSummary,
                    mode_livraison: shippingMethod || 'colissimo',
                    infos_relais: infosRelais
                }
            },
            success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`, // Redirection après succès
            cancel_url: `${siteUrl}/cancel`, // Redirection après annulation
        });

        return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), { status: 200 });

    } catch (error) {
        console.error("Erreur lors de la création de la session de paiement Stripe:", error);
        return new Response(JSON.stringify({ error: "Erreur lors de la création de la session de paiement." }), { status: 500 });
    }
};