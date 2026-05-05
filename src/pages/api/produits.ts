import { kv } from "../../lib/kv";
export const prerender = false;

export async function GET() {
  try {
    const produits = await kv.get("boutique:produits") || [];
    return new Response(JSON.stringify(produits), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Erreur lecture" }), { status: 500 });
  }
}