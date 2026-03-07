// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || request.headers.get('user-agent') || '';
        
        // 1. RÉCUPÉRATION IP
        const ip = request.headers.get('x-real-ip') || "Anonyme";

        // --- SÉCURITÉ : VÉRIFICATION BLACKLIST ---
        // On vérifie si l'IP est dans l'ensemble 'banned_ips' sur Upstash/Vercel KV
        const isBanned = await kv.sismember('banned_ips', ip);
        if (isBanned) {
            return new Response(JSON.stringify({ success: false, message: "Blocked" }), { status: 403 });
        }

        // --- MODE FANTÔME (BUREAU) ---
        if (ip === '128.79.142.7') {
            return new Response(JSON.stringify({ success: true, mode: "ghost-active" }), { status: 200 });
        }
        
        const referrer = request.headers.get('referer') || ""; 
        const countryCodeRaw = request.headers.get('x-vercel-ip-country');
        const countryCode = countryCodeRaw ? countryCodeRaw.toLowerCase() : "un";

        // 2. LOGIQUE DE DÉTECTION DE LA SOURCE
        let sourceName = "Direct";
        const refLower = referrer.toLowerCase();
        const manualSource = data.testSource || data.utmSource;

        if (manualSource && manualSource !== "") {
            const s = manualSource.toLowerCase();
            sourceName = s === 'qr' ? "Scan QR" : s.charAt(0).toUpperCase() + s.slice(1);
        } 
        else if (referrer && !refLower.includes('jf-aniuta.vercel.app')) {
            if (refLower.includes('instagram.com')) sourceName = "Instagram";
            else if (refLower.includes('facebook.com') || refLower.includes('fb.me')) sourceName = "Facebook";
            else if (refLower.includes('whatsapp.com')) sourceName = "WhatsApp";
            else if (refLower.includes('tiktok.com')) sourceName = "TikTok";
            else if (refLower.includes('google.')) sourceName = "Google";
            else {
                try {
                    sourceName = new URL(referrer).hostname.replace('www.', '');
                } catch {
                    sourceName = "Lien Externe";
                }
            }
        }

        // 3. DÉTECTION ROBOTS
        const isBot = /(googlebot|google-favicon|adsbot|bingbot|yandexbot|duckduckbot|baiduspider|twitterbot|facebookexternalhit|linkedinbot|telegrambot|slackbot|ia_archiver|chrome-lighthouse|lighthouse)/i.test(ua);

        // 4. DÉTERMINATION DE L'APPAREIL
        let dev = "Ordinateur"; 
        if (isBot) {
            if (/google-favicon/i.test(ua)) dev = "Google (Favicon)";
            else if (/googlebot/i.test(ua)) dev = "Googlebot";
            else if (/lighthouse|chrome-lighthouse/i.test(ua)) dev = "Lighthouse";
            else if (/facebookexternalhit|facebook/i.test(ua)) dev = "Meta / FB Bot";
            else if (/bingbot/i.test(ua)) dev = "Bingbot";
            else dev = "Robot"; 
        } else if (/android/i.test(ua)) {
            dev = "Android";
        } else if (/iPad|iPhone|iPod/i.test(ua)) {
            dev = "iOS";
        } else if (/Windows|Macintosh|Linux|PC|Ordinateur/i.test(ua)) {
            dev = "Ordinateur";
        }

        // 5. PRÉPARATION DU LOG
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

        // 6. SAUVEGARDE ET COMPTEURS
        // On n'incrémente les compteurs globaux QUE pour les humains
        if (!isBot) {
            await kv.incr('visites_totales');
            if (finalIsQR) {
                await kv.incr('visites_qr');
            }
        }

        // Sauvegarde dans le journal (les 100 derniers logs)
        await kv.lpush('journal_visites', JSON.stringify(log));
        await kv.ltrim('journal_visites', 0, 99);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        console.error("Erreur API Log:", e);
        return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
    }
}