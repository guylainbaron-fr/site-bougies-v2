import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { kv } from '../../lib/kv';
import { Produit } from './gestion-produits'; // Importe l'interface Produit

export const prerender = false;

// Initialise Stripe avec votre clé secrète
const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY); // Retiré apiVersion pour utiliser la version par défaut de la librairie

/** Source unique de vérité pour tous les pays de livraison autorisés */
const PAYS_AUTORISES_STRIPE: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
    // Pays principaux
    'FR', 'BE', 'LU', 'CH', 'DE', 'NL', 'ES', 'IT', 'PT', 'GB', 'US', 'CA',
    // Extension pour couvrir "Autre pays"
    'AU', 'AT', 'DK', 'FI', 'GR', 'IE', 'NO', 'SE', // Europe + Australie
    'JP', 'NZ', 'SG' // Asie-Pacifique
];

/**
 * Copie de la fonction de calcul des frais de port côté serveur pour la sécurité.
 * Le serveur ne doit JAMAIS faire confiance aux frais de port envoyés par le client.
 */
function calculFraisPortServeur(weight: number, method: string = 'colissimo', country: string = 'FR'): number {
    const totalWeight = weight > 0 ? weight + 300 : 0; // Harmonisé à 300g comme sur le client
    if (totalWeight <= 0) return 0;

    if (method === 'mondialrelay') {
        if (country === 'FR') {
            if (totalWeight <= 500) return 4.90; if (totalWeight <= 1000) return 5.50; if (totalWeight <= 2000) return 7.20; if (totalWeight <= 3000) return 8.50; if (totalWeight <= 5000) return 11.90; if (totalWeight <= 7000) return 14.50; if (totalWeight <= 10000) return 16.50; return -1;
        }
        if (['BE', 'LU'].includes(country)) {
            if (totalWeight <= 500) return 5.20; if (totalWeight <= 1000) return 5.90; if (totalWeight <= 2000) return 7.90; if (totalWeight <= 5000) return 12.90; return -1;
        }
        if (['ES', 'PT', 'NL', 'IT'].includes(country)) {
            if (totalWeight <= 500) return 9.90; if (totalWeight <= 1000) return 10.90; if (totalWeight <= 2000) return 12.90; if (totalWeight <= 5000) return 15.90; return -1;
        }
        return -1;
    }

    // Tarifs Colissimo par zones (miroir de la version client)
    const zoneUE = ['BE', 'LU', 'DE', 'NL', 'IT', 'ES', 'PT', 'CH', 'AT', 'IE', 'SE', 'DK', 'FI', 'GR'];
    const zoneEuropeEst = ['GB'];
    const zoneAmeriques = ['US', 'CA'];
    const zoneAsieOceanie = ['JP', 'AU', 'NZ', 'SG'];

    if (country === 'FR') {
        if (totalWeight <= 250) return 6.00; if (totalWeight <= 500) return 8.00; if (totalWeight <= 1000) return 10.00; if (totalWeight <= 2000) return 11.50; if (totalWeight <= 5000) return 18.00; if (totalWeight <= 10000) return 26.50; return -1;
    } else if (zoneUE.includes(country)) {
        if (totalWeight <= 500) return 14.00; if (totalWeight <= 1000) return 17.00; if (totalWeight <= 2000) return 19.50; if (totalWeight <= 5000) return 26.00; return -1;
    } else if (zoneEuropeEst.includes(country)) {
        if (totalWeight <= 500) return 20.00; if (totalWeight <= 1000) return 24.00; if (totalWeight <= 2000) return 28.00; if (totalWeight <= 5000) return 35.00; return -1;
    } else if (zoneAmeriques.includes(country)) {
        if (totalWeight <= 500) return 29.00; if (totalWeight <= 1000) return 33.00; if (totalWeight <= 2000) return 45.00; if (totalWeight <= 5000) return 65.00; return -1;
    } else if (zoneAsieOceanie.includes(country) || country === 'WORLD') {
        if (totalWeight <= 500) return 29.00; if (totalWeight <= 1000) return 33.00; if (totalWeight <= 2000) return 45.00; if (totalWeight <= 5000) return 65.00; return -1;
    }

    return -1;
}

function parseWeight(weightInput: any): number {
    if (typeof weightInput === 'number') return weightInput;
    if (!weightInput) return 0;
    const cleaned = weightInput.toString().replace(/[^\d.]/g, '');
    return parseFloat(cleaned) || 0;
}

export const POST: APIRoute = async ({ request }) => {
    try {
        // On ne récupère plus shippingFee du client
        const { cartItems, shippingMethod, relayData, colissimoCountry } = await request.json();
        
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

        let totalWeight = 0;
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

            // Calcul du poids total côté serveur
            totalWeight += (parseWeight(product.poids) * quantity);

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

        // SÉCURITÉ : Calcul des frais de port côté serveur
        let shippingCountry = 'FR';
        if (shippingMethod === 'mondialrelay') {
            shippingCountry = relayData?.country || 'FR';
        } else {
            shippingCountry = colissimoCountry || 'FR';
        }

        const shippingFee = calculFraisPortServeur(totalWeight, shippingMethod, shippingCountry);

        if (shippingFee > 0) {
            const methodLabel = shippingMethod === 'mondialrelay' ? 'Mondial Relay' : 'Colissimo';
            line_items.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Livraison ${methodLabel}`,
                        description: shippingMethod === 'mondialrelay' ? `Livraison en Point Relais (${shippingCountry})` : `Livraison à domicile (${shippingCountry})`,
                    },
                    unit_amount: Math.round(shippingFee * 100),
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
        const paysRelais = relayData ? relayData.country : '';

        // SÉCURITÉ : Vérification de la cohérence de la livraison et détermination du pays de livraison final
        // On définit un type plus strict pour s'assurer que la valeur est un code pays valide pour Stripe.
        let finalShippingCountry: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry = 'FR';

        if (shippingMethod === 'mondialrelay' && !infosRelais) {
            return new Response(JSON.stringify({ error: "Aucun point relais n'a été sélectionné pour la livraison." }), { status: 400 });
        } else if (shippingMethod === 'mondialrelay') {
            // On s'assure que le pays du relais est un code valide
            finalShippingCountry = paysRelais as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry;
        } else { // Colissimo : on utilise directement le pays choisi
            finalShippingCountry = (colissimoCountry || 'FR') as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry;
        }

        // Ajout dynamique des méthodes de paiement locales
        const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ['card'];
        if (finalShippingCountry === 'BE') {
            paymentMethodTypes.push('bancontact');
        }
        if (finalShippingCountry === 'NL') {
            paymentMethodTypes.push('ideal');
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: paymentMethodTypes,
            line_items: line_items,
            mode: 'payment',
            // --- AJOUTS ICI ---
            metadata: { // Pour le dashboard
                details_commande: orderSummary,
                mode_livraison: shippingMethod || 'colissimo',
                infos_relais: infosRelais,
                pays_relais: paysRelais
            },
            shipping_address_collection: {
                // SÉCURITÉ RENFORCÉE : On n'autorise QUE le pays de destination calculé.
                allowed_countries: [finalShippingCountry],
            },
            phone_number_collection: {
                enabled: true, // Optionnel mais recommandé pour le livreur
            },
            // ------------------
            payment_intent_data: { // Pour la facture
                metadata: {
                    details_commande: orderSummary,
                    mode_livraison: shippingMethod || 'colissimo',
                    infos_relais: infosRelais,
                    pays_relais: paysRelais
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