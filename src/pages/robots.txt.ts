// src/pages/robots.txt.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const siteUrl = `${url.protocol}//${url.host}`;

  // Détecte si le site tourne sur votre ordinateur en local
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  // Si vous êtes en local ou sur un environnement de dev, on bloque le référencement
  // Si c'est en ligne, on autorise l'indexation
  const robotsContent = isLocal
    ? `User-agent: *\nDisallow: /`
    : `User-agent: *
Allow: /

# Bloque les API
Disallow: /api/

# Fichier de configuration
Disallow: /vercel.json

# Sitemap dynamique
Sitemap: ${siteUrl}/sitemap-index.xml
`;

  return new Response(robotsContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Cache le fichier côté navigateur/CDN pendant 1 heure pour éviter de solliciter le serveur
      'Cache-Control': 'public, max-age=3600',
    },
  });
};