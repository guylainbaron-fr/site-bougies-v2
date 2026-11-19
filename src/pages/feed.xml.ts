// src/pages/feed.xml.ts
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { kv } from '../lib/kv';
import type { Produit } from './api/gestion-produits';

export const prerender = false;

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&apos;/gi, '’')
    .replace(/&quot;/gi, '«')
    .replace(/&#39;/gi, '’')
    .replace(/'/g, '’')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const siteUrl = (import.meta.env.SITE || `${url.protocol}//${url.host}`).replace(/\/$/, '');

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

    return rss({
      title: 'Boutique Artisanale | Jean-François & Aniuta',
      description:
        'Créations artisanales en Lozère : sculptures sur bois local, tableaux et bougies végétales coulées à la main.',
      site: siteUrl,
      trailingSlash: false,
      items: produits.map((produit) => {
        const productUrl = `/boutique#${encodeURIComponent(produit.id)}`;
        const imageUrl = produit.image || `${siteUrl}/images/logo_512.png`;
        const title = cleanText(produit.nom) || 'Création artisanale';
        const category = cleanText(produit.categorie) || 'Artisanat';

        // Statut de disponibilité
        let statusLabel = 'Disponible';
        if (produit.enMagasinUniquement) {
          statusLabel = 'Création sur mesure / Atelier';
        } else if (produit.isUnique && produit.stock <= 0) {
          statusLabel = 'Pièce unique vendue (Exemple de création)';
        } else if (produit.stock <= 0) {
          statusLabel = 'En cours de réapprovisionnement';
        }

        // Description propre sans balises HTML ni &apos;
        const descParts: string[] = [];
        if (produit.description) descParts.push(cleanText(produit.description));
        descParts.push(`Catégorie : ${category}`);
        descParts.push(`Disponibilité : ${statusLabel}`);
        if (produit.poids && produit.poids.trim()) {
          descParts.push(`Poids : ${cleanText(produit.poids)}`);
        }
        if (produit.parfum && produit.parfum.trim()) {
          descParts.push(`Senteur : ${cleanText(produit.parfum)}`);
        }
        if (typeof produit.prix === 'number' && produit.prix > 0) {
          descParts.push(`Prix : ${produit.prix.toFixed(2)} €`);
        }

        const descriptionFinale = descParts.join('\n');

        let imageType = 'image/jpeg';
        const lowerImg = imageUrl.toLowerCase();
        if (lowerImg.includes('.webp')) imageType = 'image/webp';
        else if (lowerImg.includes('.png')) imageType = 'image/png';

        const safeImageUrl = imageUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const safeId = cleanText(String(produit.id)).replace(/[<>&"]/g, '');

        return {
          title,
          description: descriptionFinale,
          pubDate: new Date(),
          link: productUrl,
          customData: `
  <guid isPermaLink="false">produit-${safeId}</guid>
  <category>${cleanText(category).replace(/[<>&"]/g, '')}</category>
  ${imageUrl ? `<enclosure url="${safeImageUrl}" type="${imageType}" length="0" />` : ''}
`.trim(),
        };
      }),
      customData: `<language>fr-FR</language>`,
    });
  } catch (error) {
    console.error('Erreur génération feed.xml:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la génération du flux RSS' }),
      { status: 500 }
    );
  }
};