import { kv } from "../../lib/kv"; // verifyAdminToken is not needed here if called via proxy

export const prerender = false;

// On définit une interface pour que TS sache à quoi ressemble un produit
export interface Produit { // Export the interface
    id: string;
    nom: string;
    categorie: string;
    prix: number;
    poids: string;
    parfum: string;
    image: string;
    image2: string;
    image3: string;
    description: string;
    stock: number;
    isUnique: boolean;
    ordre: number;
    enMagasinUniquement: boolean;
}

export async function POST({ request }) {
    // This API endpoint is now expected to be called by the server-side proxy
    // which will add the ADMIN_TOKEN. The middleware protects the proxy.
    // If this endpoint were to be called directly by other services,
    // verifyAdminToken would still be useful, but for dashboard calls,
    // the proxy handles the token.
    // For simplicity and to avoid exposing ADMIN_TOKEN client-side,
    // we assume the request is authenticated if it reaches here via the proxy.
    // If this API were to be exposed to other server-side services,
    // the verifyAdminToken check would be re-added here.

    try {
        const { action, payload } = await request.json();
        
        const data = await kv.get("boutique:produits");
        let produits = (Array.isArray(data) ? data : []) as Produit[];

        if (action === "upsert") {
            // Server-side validation and sanitization for upsert
            if (!payload || typeof payload.nom !== 'string' || payload.nom.trim() === '') {
                return new Response(JSON.stringify({ error: "Nom du produit manquant" }), { status: 400 });
            }
            
            const newProduct: Produit = {
                id: typeof payload.id === 'string' ? payload.id : '', // Should be generated client-side or server-side
                nom: payload.nom.trim(),
                categorie: typeof payload.categorie === 'string' ? payload.categorie.trim() : 'Divers',
                prix: typeof payload.prix === 'number' && payload.prix >= 0 ? parseFloat(payload.prix.toFixed(2)) : 0,
                poids: typeof payload.poids === 'string' ? payload.poids.trim() : '',
                parfum: typeof payload.parfum === 'string' ? payload.parfum.trim() : '',
                image: typeof payload.image === 'string' ? payload.image.trim() : '',
                image2: typeof payload.image2 === 'string' ? payload.image2.trim() : '',
                image3: typeof payload.image3 === 'string' ? payload.image3.trim() : '',
                description: typeof payload.description === 'string' ? payload.description.trim() : '',
                stock: typeof payload.stock === 'number' && payload.stock >= 0 ? Math.floor(payload.stock) : 0,
                isUnique: typeof payload.isUnique === 'boolean' ? payload.isUnique : false,
                // Ensure 'ordre' is handled correctly, it should be set by reorder action or on new product
                ordre: typeof payload.ordre === 'number' && payload.ordre >= 1 ? Math.floor(payload.ordre) : 1,
                enMagasinUniquement: typeof payload.enMagasinUniquement === 'boolean' ? payload.enMagasinUniquement : false,
            };

            const index = produits.findIndex((p) => p.id === payload.id);
            if (index !== -1) {
                produits[index] = { ...produits[index], ...newProduct }; // Merge existing with new, preserving order if not explicitly set
            } else {
                produits.unshift(newProduct);
            }
        }

        if (action === "reorder") {
            // Server-side validation for reorder payload
            if (!Array.isArray(payload)) {
                return new Response(JSON.stringify({ error: "Payload de réorganisation invalide" }), { status: 400 });
            }
            // Ensure each item in payload has at least id and ordre, and is a valid product structure
            const reorderedProducts: Produit[] = payload.map(item => {
                if (typeof item.id !== 'string' || typeof item.ordre !== 'number' || item.ordre < 1) {
                    throw new Error("Élément de réorganisation invalide"); // Or handle more gracefully
                }
                // Find the original product and update its order, or create a minimal one
                const originalProduct = produits.find(p => p.id === item.id);
                if (!originalProduct) throw new Error(`Produit ${item.id} non trouvé`);
                return { ...originalProduct, ordre: Math.floor(item.ordre) };
            });
            produits = reorderedProducts;
        }

        if (action === "delete") {
            produits = produits.filter((p) => p.id !== payload.id); // Maintenant 'filter' fonctionne
        }

        await kv.set("boutique:produits", produits);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Erreur Base de données" }), { status: 500 });
    }
}