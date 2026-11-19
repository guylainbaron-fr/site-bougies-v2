// src/pages/feed.xml.ts
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
    console.error('Erreur lecture KV feed.xml:', error);
  }

  // Trier par ordre croissant
  produits.sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));

  const itemsXml = produits.map((produit) => {
    // Lien direct vers la fiche/carte sur la boutique
    const productUrl = `${siteUrl}/boutique#${encodeURIComponent(produit.id)}`;
    const imageUrl = produit.image || `${siteUrl}/images/logo_512.png`;
    const title = produit.nom || 'Création artisanale';
    const category = produit.categorie || 'Artisanat';
    
    // Description enrichie
    const descParts: string[] = [];
    if (produit.description) descParts.push(produit.description);
    if (produit.poids && produit.poids.trim()) descParts.push(`Poids : ${produit.poids}`);
    if (produit.parfum && produit.parfum.trim()) descParts.push(`Senteur : ${produit.parfum}`);
    if (typeof produit.prix === 'number' && produit.prix > 0) descParts.push(`Prix : ${produit.prix.toFixed(2)} €`);
    
    const plainDesc = descParts.join(' - ');
    const htmlDesc = `
      <![CDATA[
        <p><img src="${imageUrl}" alt="${title}" style="max-width: 600px; height: auto;" /></p>
        <p>${escapeXml(produit.description || '')}</p>
        <ul>
          <li><strong>Catégorie :</strong> ${escapeXml(category)}</li>
          ${produit.poids ? `<li><strong>Poids :</strong> ${escapeXml(produit.poids)}</li>` : ''}
          ${produit.parfum ? `<li><strong>Senteur :</strong> ${escapeXml(produit.parfum)}</li>` : ''}
          ${typeof produit.prix === 'number' && produit.prix > 0 ? `<li><strong>Prix :</strong> ${produit.prix.toFixed(2)} €</li>` : ''}
        </ul>
      ]]>
    `.trim();

    return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(productUrl)}</link>
      <guid isPermaLink="false">produit-${escapeXml(produit.id)}</guid>
      <description>${htmlDesc}</description>
      <category>${escapeXml(category)}</category>
      <enclosure url="${escapeXml(imageUrl)}" type="image/jpeg" length="0" />
      <media:content xmlns:media="http://search.yahoo.com/mrss/" url="${escapeXml(imageUrl)}" medium="image">
        <media:title>${escapeXml(title)}</media:title>
        <media:description>${escapeXml(plainDesc)}</media:description>
      </media:content>
    </item>`.trim();
  }).join('\n');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Boutique Artisanale | Jean-François &amp; Aniuta</title>
    <link>${siteUrl}/boutique</link>
    <description>Créations artisanales en Lozère : sculptures sur bois local, tableaux et bougies végétales coulées à la main.</description>
    <language>fr-FR</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`.trim();

  return new Response(xmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=3600',
    },
  });
};
