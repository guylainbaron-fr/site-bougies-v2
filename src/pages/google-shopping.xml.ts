// src/pages/google-shopping.xml.ts
import type { APIRoute } from 'astro';
import { kv } from '../lib/kv';
import type { Produit } from './api/gestion-produits';

export const prerender = false;

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const siteUrl = import.meta.env.SITE || `${url.protocol}//${url.host}`;

  let produits: Produit[] = [];
  try {
    const data = await kv.get('boutique:produits');
    if (Array.isArray(data)) {
      produits = data.filter((p) => p && p.id);
    }
  } catch (error) {
    console.error('Erreur lecture KV google-shopping.xml:', error);
  }

  // Filtrer uniquement les articles éligibles à la vente en ligne (prix > 0)
  // ou qui sont des articles physiques de la boutique
  const validProducts = produits.filter((p) => {
    // Si c'est en magasin uniquement sans prix vente en ligne, Google Shopping le refusera s'il n'a pas de prix
    return typeof p.prix === 'number' && p.prix > 0;
  });

  const itemsXml = validProducts.map((p) => {
    const id = p.id;
    const title = p.nom || 'Création artisanale';
    const link = `${siteUrl}/boutique#${encodeURIComponent(p.id)}`;
    
    // Description complète
    let fullDescription = p.description || 'Création artisanale fait main par Jean-François & Aniuta en Lozère.';
    if (p.parfum) fullDescription += ` Senteur : ${p.parfum}.`;
    if (p.poids) fullDescription += ` Poids : ${p.poids}.`;

    const mainImage = p.image || `${siteUrl}/images/logo_512.png`;
    const priceStr = `${Number(p.prix).toFixed(2)} EUR`;

    // Calcul de la disponibilité Google Merchant
    // Options valides Google : in_stock, out_of_stock, preorder, backorder
    let availability = 'in_stock';
    if (p.enMagasinUniquement) {
      availability = 'out_of_stock'; // ou géré en commande directe
    } else if (p.stock <= 0) {
      availability = 'out_of_stock';
    }

    // Google Product Category par défaut
    // 499893 = Home & Garden > Decor > Home Fragrances > Candles
    // 500044 = Home & Garden > Decor > Artwork > Sculptures & Statues
    let googleCategory = '5999'; // Arts & Entertainment
    let productType = p.categorie || 'Artisanat';
    if (p.categorie === 'Bougies') {
      googleCategory = '499893';
      productType = 'Maison > Décoration > Bougies parfumées artisanales';
    } else if (p.categorie === 'Sculptures') {
      googleCategory = '500044';
      productType = 'Maison > Décoration > Sculptures sur bois';
    } else if (p.categorie === 'Tableaux') {
      googleCategory = '500042'; // Artwork > Posters, Prints, & Visual Artwork
      productType = 'Maison > Décoration > Tableaux';
    }

    // Images additionnelles (image2, image3)
    const additionalImagesXml: string[] = [];
    if (p.image2 && p.image2.trim()) {
      additionalImagesXml.push(`<g:additional_image_link>${escapeXml(p.image2.trim())}</g:additional_image_link>`);
    }
    if (p.image3 && p.image3.trim()) {
      additionalImagesXml.push(`<g:additional_image_link>${escapeXml(p.image3.trim())}</g:additional_image_link>`);
    }

    return `
    <item>
      <g:id>${escapeXml(id)}</g:id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${escapeXml(fullDescription)}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(mainImage)}</g:image_link>
      ${additionalImagesXml.join('\n      ')}
      <g:availability>${availability}</g:availability>
      <g:price>${priceStr}</g:price>
      <g:google_product_category>${googleCategory}</g:google_product_category>
      <g:product_type>${escapeXml(productType)}</g:product_type>
      <g:brand>Jean-François &amp; Aniuta</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      ${p.poids ? `<g:shipping_weight>${escapeXml(p.poids)}</g:shipping_weight>` : ''}
    </item>`.trim();
  }).join('\n');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Google Shopping Feed | Jean-François &amp; Aniuta</title>
    <link>${siteUrl}/boutique</link>
    <description>Catalogue officiel des créations artisanales de Jean-François et Aniuta (Bougies et Sculptures).</description>
    ${itemsXml}
  </channel>
</rss>`.trim();

  return new Response(xmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=3600',
    },
  });
};
