import type { APIRoute } from 'astro';

export const prerender = false;

// This endpoint acts as a secure proxy for dashboard API calls.
// It is protected by the middleware using Basic Auth.
// It adds the ADMIN_TOKEN on the server-side before forwarding the request
// to the actual /api/gestion-produits endpoint, thus keeping ADMIN_TOKEN secret.
export const POST: APIRoute = async ({ request }) => {
    try {
        // Détection dynamique de l'URL du site à partir de la requête
        const url = new URL(request.url);
        const siteUrl = `${url.protocol}//${url.host}`;

        const body = await request.json(); // Get the payload from the dashboard

        // Forward the request to the actual API endpoint, adding the ADMIN_TOKEN
        const apiResponse = await fetch(`${siteUrl}/api/gestion-produits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.ADMIN_TOKEN}` // ADMIN_TOKEN added securely on server
            },
            body: JSON.stringify(body)
        });

        const data = await apiResponse.json();
        return new Response(JSON.stringify(data), { status: apiResponse.status });
    } catch (e) {
        console.error("Erreur Proxy Admin:", e);
        return new Response(JSON.stringify({ error: `Erreur du proxy admin : ${e instanceof Error ? e.message : 'Erreur inconnue'}` }), { status: 500 });
    }
};