// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || request.headers.get('user-agent') || '';

        // 1. RÉCUPÉRATION IP, PAYS ET REFERRER
        const ip = request.headers.get('x-real-ip') || "Anonyme";
        const referrer = request.headers.get('referer') || ""; 

        // --- MODE FANTÔME (BUREAU) ---
        if (ip === '128.79.142.7') {
            return new Response(JSON.stringify({ success: true, mode: "ghost-active" }), { status: 200 });
        }
        
        const countryCodeRaw = request.headers.get('x-vercel-ip-country');
        const countryCode = countryCodeRaw ? countryCodeRaw.toLowerCase() : "un";

        // 2. LOGIQUE DE DÉTECTION DE LA SOURCE + FIX QR CODE
        let sourceName = "Direct";
        const refLower = referrer.toLowerCase();
        
        // On récupère la source envoyée par le script du front
        const manualSource = data.testSource || data.utmSource;

        // PRIORITÉ 1 : Paramètre manuel (QR Code, Instagram Bio, etc.)
        if (manualSource && manualSource !== "") {
            const s = manualSource.toLowerCase();
            if (s === 'qr') {
                sourceName = "Scan QR";
            } else {
                sourceName = s.charAt(0).toUpperCase() + s.slice(1);
            }
        } 
        // PRIORITÉ 2 : Détection automatique via le Referrer
        // On n'analyse le referrer QUE si ce n'est pas ton propre site (évite les logs "jf-aniuta.vercel.app")
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
            dev = "Android";
        } else if (/iPad|iPhone|iPod/i.test(ua)) {
            dev = "iOS";
        }

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