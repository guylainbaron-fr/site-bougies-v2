// src/pages/pinterest.xml.ts
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

function toAbsoluteUrl(pathOrUrl: string, siteUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const cleanSite = siteUrl.replace(/\/$/, '');
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${cleanSite}${cleanPath}`;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const siteUrl = (import.meta.env.SITE || `${url.protocol}//${url.host}`).replace(/\/$/, '');

  let produits: Produit[] = [];
  try {
    const data = await kv.get('boutique:produits');
    if (Array.isArray(data)) {
      produits = data.filter((p) => p && p.id);
    }
  } catch (error) {
    console.error('Erreur lecture KV pinterest.xml:', error);
  }

  const validProducts = produits.filter((p) => {
    const hasPrice = typeof p.prix === 'number' && p.prix > 0;
    const isAvailableOnline = !p.enMagasinUniquement && p.stock > 0;
    return hasPrice && isAvailableOnline;
  });

  const itemsXml = validProducts.map((p) => {
    const id = p.id;
    const title = p.nom || 'Création artisanale';
    const link = `${siteUrl}/boutique#${encodeURIComponent(p.id)}`;

    let fullDescription = p.description || 'Création artisanale fait main par Jean-François & Aniuta en Lozère.';
    if (p.parfum) fullDescription += ` Senteur : ${p.parfum}.`;
    if (p.poids) fullDescription += ` Poids : ${p.poids}.`;

    const mainImage = p.image
      ? toAbsoluteUrl(p.image, siteUrl)
      : `${siteUrl}/images/logo_512.png`;

    const priceStr = `${Number(p.prix).toFixed(2)} EUR`;

    let googleCategory = '5999';
    let productType = p.categorie || 'Artisanat';
    if (p.categorie === 'Bougies') {
      googleCategory = '499893';
      productType = 'Maison > Décoration > Bougies parfumées artisanales';
    } else if (p.categorie === 'Sculptures') {
      googleCategory = '500044';
      productType = 'Maison > Décoration > Sculptures sur bois';
    } else if (p.categorie === 'Tableaux') {
      googleCategory = '500042';
      productType = 'Maison > Décoration > Tableaux';
    }

    const additionalImagesXml: string[] = [];
    if (p.image2 && p.image2.trim()) {
      additionalImagesXml.push(`<g:additional_image_link>${escapeXml(toAbsoluteUrl(p.image2, siteUrl))}</g:additional_image_link>`);
    }
    if (p.image3 && p.image3.trim()) {
      additionalImagesXml.push(`<g:additional_image_link>${escapeXml(toAbsoluteUrl(p.image3, siteUrl))}</g:additional_image_link>`);
    }

    return `
    <item>
      <g:id>${escapeXml(id)}</g:id>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(fullDescription)}</description>
      <link>${escapeXml(link)}</link>
      <g:image_link>${escapeXml(mainImage)}</g:image_link>
      ${additionalImagesXml.join('\n      ')}
      <g:availability>in stock</g:availability>
      <g:price>${priceStr}</g:price>
      <g:google_product_category>${googleCategory}</g:google_product_category>
      <g:product_type>${escapeXml(productType)}</g:product_type>
      <g:brand>Jean-François &amp; Aniuta</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>FALSE</g:identifier_exists>
    </item>`.trim();
  }).join('\n');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Catalogue Pinterest | Jean-François &amp; Aniuta</title>
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