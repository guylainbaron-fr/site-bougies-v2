// @ts-ignore
import { kv } from '@vercel/kv';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const ua = data.ua || request.headers.get('user-agent') || '';
        
        // 1. RÉCUPÉRATION IP, PAYS ET REFERRER (LA SOURCE)
        const ip = request.headers.get('x-real-ip') || "Anonyme";
        const referrer = request.headers.get('referer') || ""; // <--- C'est ici qu'on voit d'où ils viennent

        // --- MODE FANTÔME (BUREAU) ---
        if (ip === '128.79.142.7') {
            return new Response(JSON.stringify({ success: true, mode: "ghost-active" }), { status: 200 });
        }
        
        const countryCodeRaw = request.headers.get('x-vercel-ip-country');
        const countryCode = countryCodeRaw ? countryCodeRaw.toLowerCase() : "un";

        // 2. LOGIQUE DE DÉTECTION DE LA SOURCE (Version Définitive)
        let sourceName = "Direct";
        const refLower = referrer.toLowerCase();

        // PRIORITÉ 1 : Paramètre manuel (ex: lien dans la bio Instagram ou test)
        if (data && data.testSource) {
            // On met la première lettre en majuscule (ex: instagram -> Instagram)
            sourceName = data.testSource.charAt(0).toUpperCase() + data.testSource.slice(1);
        } 
        // PRIORITÉ 2 : Détection automatique via le Referrer
        else if (refLower.includes('instagram.com')) sourceName = "Instagram";
        else if (refLower.includes('facebook.com') || refLower.includes('fb.me')) sourceName = "Facebook";
        else if (refLower.includes('whatsapp.com')) sourceName = "WhatsApp";
        else if (refLower.includes('tiktok.com')) sourceName = "TikTok";
        else if (refLower.includes('google.')) sourceName = "Google";
        else if (referrer) {
            try {
                sourceName = new URL(referrer).hostname.replace('www.', '');
            } catch {
                sourceName = "Lien Externe";
            }
        }

        // 3. LA REGEX MUSCLÉE (Bots)
        const isBot = /(googlebot|google-favicon|adsbot|bingbot|yandexbot|duckduckbot|baiduspider|twitterbot|facebookexternalhit|pinterest|linkedinbot|telegrambot|slackbot|petalbot|ia_archiver|robot|bot|spider|headless|chrome-lighthouse|lighthouse|inspect|ahrefsbot|semrushbot|dotbot|python|axios|curl|wget|go-http-client|java|php|postman|runtime|insomnia|nimbostratus)/i.test(ua);

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
        const log = {
            date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            device: dev,
            ip: ip,
            source: sourceName, // <--- NOUVEAU : On enregistre la source
            country: countryCode === "fr" ? "FRANCE" : countryCode.toUpperCase(),
            flag_code: countryCode, 
            isQR: data.isQR || false
        };

        // On n'incrémente les visites totales que si ce n'est PAS un bot
        if (!isBot) {
            await kv.incr('visites_totales');
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