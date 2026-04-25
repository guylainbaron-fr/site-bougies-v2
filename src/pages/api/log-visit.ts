import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

// Helper to sanitize and limit string length
function sanitizeString(input: string | undefined | null, maxLength: number = 255): string {
    if (!input) return '';
    
    // 1. Suppression des caractères de contrôle
    let sanitized = input.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    // 2. Échappement des caractères HTML pour prévenir le XSS lors de l'affichage
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    sanitized = sanitized.replace(/[&<>"'/]/g, m => map[m]);

    sanitized = sanitized.trim();

    // Limit length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    return sanitized;
}

// Supprimer le ts-ignore si le problème est résolu ou si les types sont corrects
// Si le problème persiste, il peut être lié à la configuration TypeScript ou à la version de @vercel/kv
// Pour l'instant, on le laisse si nécessaire, mais l'objectif est de le supprimer.

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = sanitizeString(data.ua || request.headers.get('user-agent'));

        // 1. RÉCUPÉRATION IP, PAYS ET REFERRER
        const ip = sanitizeString(request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || "Anonyme", 45);

        // --- PROTECTION CONTRE LE SPAM (Rate Limit) ---
        // On limite à 1 log par minute par IP pour éviter le flood
        const rateLimitKey = `rate_limit_log:${ip}`; // IP is already sanitized
        const isRateLimited = await kv.get(rateLimitKey);
        
        if (isRateLimited) {
            return new Response(JSON.stringify({ success: false, message: "Too many requests" }), { status: 429 });
        }
        // Expire après 60 secondes
        await kv.set(rateLimitKey, "1", { ex: 60 });

        const referrer = sanitizeString(request.headers.get('referer')); 

        // --- MODE FANTÔME (BUREAU) ---
        const GHOST_IP = import.meta.env.GHOST_MODE_IP; // Utilisation de la variable d'environnement
        if (ip === GHOST_IP) {
            return new Response(JSON.stringify({ success: true, mode: "ghost-active" }), { status: 200 });
        }
        
        const countryCodeRaw = request.headers.get('x-vercel-ip-country');
        const countryCode = sanitizeString(countryCodeRaw, 2).toLowerCase(); // Country codes are 2 chars

        // 2. LOGIQUE DE DÉTECTION DE LA SOURCE + FIX QR CODE
        let sourceName = "Direct";
        const refLower = referrer.toLowerCase();
        
        // On récupère la source envoyée par le script du front
        const manualSource = sanitizeString(data.testSource || data.utmSource);

        // PRIORITÉ 1 : Paramètre manuel ou détection automatique via URL (fbclid, igshid)
        if (manualSource && manualSource !== "") {
            const s = manualSource.toLowerCase();
            if (s === 'qr') {
                sourceName = "Scan QR";
            } else {
                sourceName = s.charAt(0).toUpperCase() + s.slice(1);
            }
        } 
        // --- Détection auto si l'URL contient un ID Facebook ou Insta ---
        else if (data.currentUrl && (sanitizeString(data.currentUrl).includes('fbclid') || sanitizeString(data.currentUrl).includes('facebook.com'))) {
            sourceName = "Facebook";
        }
        else if (data.currentUrl && (sanitizeString(data.currentUrl).includes('igshid') || sanitizeString(data.currentUrl).includes('instagram.com'))) {
            sourceName = "Instagram";
        }
        // PRIORITÉ 2 : Détection classique via le Referrer
        else if (referrer && !refLower.includes('jf-aniuta.vercel.app')) {
            if (refLower.includes('instagram.com')) sourceName = "Instagram";
            else if (refLower.includes('facebook.com') || refLower.includes('fb.me')) sourceName = "Facebook";
            else if (refLower.includes('whatsapp.com')) sourceName = "WhatsApp";
            else if (refLower.includes('tiktok.com')) sourceName = "TikTok";
            else if (refLower.includes('google.')) sourceName = "Google";
            else {
                // Ensure referrer is a valid URL before parsing
                try {
                    const refUrl = new URL(referrer);
                    sourceName = sanitizeString(refUrl.hostname.replace('www.', ''), 50); // Limit hostname length
                } catch {
                    sourceName = "Lien Externe";
                }
            }
        }
        sourceName = sanitizeString(sourceName, 50); // Ensure final sourceName is also sanitized
        // On ne garde que les robots "légitimes" qui ont survécu au blocage Vercel
        const isBot = /(googlebot|google-favicon|adsbot|bingbot|yandexbot|duckduckbot|baiduspider|twitterbot|facebookexternalhit|linkedinbot|telegrambot|slackbot|ia_archiver|chrome-lighthouse|lighthouse)/i.test(ua);

        // 4. DÉTERMINATION DE L'APPAREIL
        let dev = "PC";
        if (isBot) {
            if (/google-favicon/i.test(ua)) dev = "Google (Favicon)";
            else if (/googlebot/i.test(ua)) dev = "Googlebot";
            else if (/lighthouse|chrome-lighthouse/i.test(ua)) dev = "Lighthouse";
            else if (/facebookexternalhit|facebook/i.test(ua)) dev = "Meta / FB Bot";
            else if (/bingbot/i.test(ua)) dev = "Bingbot";
            else dev = "Robot"; 
        } else if (/android/i.test(ua)) {
            dev = "Android"; // Max length 20 chars
        } else if (/iPad|iPhone|iPod/i.test(ua)) {
            dev = "iOS";
        }
        dev = sanitizeString(dev, 20); // Sanitize device string

        // 5. PRÉPARATION DU LOG
        // On force isQR à true si la source est "Scan QR"
        const finalIsQR = data.isQR || sourceName === "Scan QR";

        const log = {
            date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            device: dev,
            ip: ip,
            source: sourceName,
            country: countryCode === "fr" ? "FRANCE" : countryCode.toUpperCase(),
            flag_code: countryCode, 
            isQR: finalIsQR
        };

        // Incrémentations KV
        if (!isBot) {
            await kv.incr('visites_totales');
            if (finalIsQR) {
                await kv.incr('visites_qr'); // On incrémente aussi le compteur global QR
            }
        }

        // Sauvegarde dans le journal
        await kv.lpush('journal_visites', JSON.stringify(log));
        await kv.ltrim('journal_visites', 0, 99);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        console.error("Erreur API Log:", e);
        return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
    }
}