// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { ip } = await request.json();

    if (!ip || ip === 'Privé' || ip === 'Anonyme') {
      return new Response(JSON.stringify({ error: "IP invalide" }), { status: 400 });
    }

    // On ajoute l'IP à un "Set" (liste unique) appelée 'banned_ips' sur Vercel KV
    // sadd renvoie le nombre d'éléments ajoutés (1 si nouveau, 0 si déjà présent)
    await kv.sadd('banned_ips', ip);

    return new Response(JSON.stringify({ 
        success: true, 
        message: `IP ${ip} bannie avec succès` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Erreur Ban API:", error);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
};