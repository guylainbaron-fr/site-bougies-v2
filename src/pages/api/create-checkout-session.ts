import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import CryptoJS from 'crypto-js';
import { parseStringPromise } from 'xml2js';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-04-22.dahlia',
});

const ENSEIGNE = (import.meta.env.MONDIAL_RELAY_ENSEIGNE || "").replace(/['"]/g, "").trim();
const KEY = (import.meta.env.MONDIAL_RELAY_KEY || "").replace(/['"]/g, "").trim();

function cleanMRString(str: string): string {
    if (!str) return '';
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/&/g, " ET ")            
        .replace(/['’"`]/g, " ")          
        .replace(/[^\w\s-]/g, "")         
        .replace(/\s+/g, " ")             
        .trim()
        .toUpperCase();
}

export const POST: APIRoute = async ({ request }) => {
    const jsonHeader = { headers: { 'Content-Type': 'application/json' } };

    try {
        if (!ENSEIGNE || !KEY) {
            return new Response(
                JSON.stringify({ error: "Configuration Mondial Relay manquante dans le .env" }), 
                { status: 500, ...jsonHeader }
            );
        }

        const { paymentIntentId, mode_livraison } = await request.json();

        if (!paymentIntentId) {
            return new Response(JSON.stringify({ error: "ID de commande manquant" }), { status: 400, ...jsonHeader });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const shipping = paymentIntent.shipping;
        const email = paymentIntent.metadata?.client_email || paymentIntent.receipt_email || 'client@email.com'; 
        
        let relaisId = paymentIntent.metadata?.id_relais;
        if (!relaisId) {
            const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId });
            if (sessions.data.length > 0) {
                relaisId = sessions.data[0].metadata?.id_relais;
            }
        }

        if (!shipping || !shipping.address) {
            return new Response(JSON.stringify({ error: "Données de livraison introuvables." }), { status: 400, ...jsonHeader });
        }

        let labelUrl = "";
        let trackingNumber = "";
        
        if (mode_livraison === 'mondialrelay') {
            if (!relaisId) {
                return new Response(JSON.stringify({ error: "ID du point relais manquant." }), { status: 400, ...jsonHeader });
            }

            const result = await generateMondialRelayLabel(shipping, email, relaisId, paymentIntentId);
            labelUrl = result.url;
            trackingNumber = result.tracking;
        } else {
            const result = await generateColissimoLabel(shipping, email);
            labelUrl = result.url;
            trackingNumber = result.tracking;
        }

        await stripe.paymentIntents.update(paymentIntentId, {
            metadata: { 
                url_etiquette: labelUrl,
                numero_suivi: trackingNumber
            }
        });

        return new Response(JSON.stringify({ labelUrl }), { status: 200, ...jsonHeader });

    } catch (error: any) {
        console.error("Erreur génération étiquette :", error);
        return new Response(JSON.stringify({ 
            error: error.message || "Erreur technique lors de la génération." 
        }), { status: 500, ...jsonHeader });
    }
};

// =========================================================================
// MONDIAL RELAY API (WSI2_CreationEtiquette - Basé sur ton WSDL)
// =========================================================================
async function generateMondialRelayLabel(shipping: any, email: string, relaisId: string, paymentIntentId: string) {
    
    const destAd1Clean = cleanMRString(shipping.name).substring(0, 29);
    
    // Nettoyage strict du téléphone obligatoire pour l'étiquette
    let rawPhone = shipping.phone || '0658909835';
    rawPhone = rawPhone.replace(/[^\d]/g, '');
    if (rawPhone.startsWith('33')) {
        rawPhone = '0' + rawPhone.substring(2);
    }
    const destTelClean = rawPhone.substring(0, 15);
    const destEmailClean = email.substring(0, 49);

    // ID Unique basé sur Stripe pour éviter les collisions de cache chez Mondial Relay
    const uniqueDossier = paymentIntentId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 12);

    const params = {
        Enseigne: ENSEIGNE,
        ModeCol: "REL",  // Dépôt au point relais
        ModeLiv: "2C",   // Livraison en Point Relais
        NDossier: uniqueDossier,
        NClient: "1",
        Exped_Langage: "FR",
        Exped_Ad1: cleanMRString('ATELIER J-F ET ANIUTA'),
        Exped_Ad2: cleanMRString('149 ROUTE DU PONT DU VALLAT'),
        Exped_Ad3: "",
        Exped_Ad4: "",
        Exped_Ville: cleanMRString('MONT LOZERE ET GOULET'),
        Exped_CP: '48250',
        Exped_Pays: "FR",
        Exped_Tel1: '0658909835',
        Exped_Tel2: "",
        Exped_Mail: 'jeanfrancoisbaron2@laposte.net',
        Dest_Langage: "FR",
        Dest_Ad1: destAd1Clean,
        Dest_Ad2: "", // En mode 2C, laisser vide pour éviter le STAT 33
        Dest_Ad3: "", 
        Dest_Ad4: "",
        Dest_Ville: cleanMRString(shipping.address.city).substring(0, 29),
        Dest_CP: shipping.address.postal_code.replace(/\s/g, ''),
        Dest_Pays: "FR",
        Dest_Tel1: destTelClean,
        Dest_Tel2: "",
        Dest_Mail: destEmailClean,
        Poids: "1000",   // En grammes (1kg par défaut)
        Longueur: "",
        Taille: "",
        NbColis: "1",
        CRT_Valeur: "0",
        CRT_Devise: "EUR",
        Assurance: "0",
        Instructions: "",
        Livreur: "",
        IdInShip: "",
        Texte: relaisId.trim() // On transmet le numéro du point relais cible ici
    };

    // Calcul de la clé de sécurité MD5 obligatoire (Champs du WSDL dans l'ordre + clé privée)
    const chaineSecurity = 
        params.Enseigne + params.ModeCol + params.ModeLiv + params.NDossier + params.NClient +
        params.Exped_Langage + params.Exped_Ad1 + params.Exped_Ad2 + params.Exped_Ad3 + params.Exped_Ad4 +
        params.Exped_Ville + params.Exped_CP + params.Exped_Pays + params.Exped_Tel1 + params.Exped_Tel2 + params.Exped_Mail +
        params.Dest_Langage + params.Dest_Ad1 + params.Dest_Ad2 + params.Dest_Ad3 + params.Dest_Ad4 +
        params.Dest_Ville + params.Dest_CP + params.Dest_Pays + params.Dest_Tel1 + params.Dest_Tel2 + params.Dest_Mail +
        params.Poids + params.Longueur + params.Taille + params.NbColis + params.CRT_Valeur + params.CRT_Devise +
        params.Assurance + params.Instructions + params.Livreur + params.IdInShip + params.Texte + KEY;

    const security = CryptoJS.MD5(chaineSecurity).toString().toUpperCase();

    // Enveloppe SOAP calquée à 100% sur ton WSDL
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_CreationEtiquette xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${params.Enseigne}</Enseigne>
      <ModeCol>${params.ModeCol}</ModeCol>
      <ModeLiv>${params.ModeLiv}</ModeLiv>
      <NDossier>${params.NDossier}</NDossier>
      <NClient>${params.NClient}</NClient>
      <Exped_Langage>${params.Exped_Langage}</Exped_Langage>
      <Exped_Ad1>${params.Exped_Ad1}</Exped_Ad1>
      <Exped_Ad2>${params.Exped_Ad2}</Exped_Ad2>
      <Exped_Ad3>${params.Exped_Ad3}</Exped_Ad3>
      <Exped_Ad4>${params.Exped_Ad4}</Exped_Ad4>
      <Exped_Ville>${params.Exped_Ville}</Exped_Ville>
      <Exped_CP>${params.Exped_CP}</Exped_CP>
      <Exped_Pays>${params.Exped_Pays}</Exped_Pays>
      <Exped_Tel1>${params.Exped_Tel1}</Exped_Tel1>
      <Exped_Tel2>${params.Exped_Tel2}</Exped_Tel2>
      <Exped_Mail>${params.Exped_Mail}</Exped_Mail>
      <Dest_Langage>${params.Dest_Langage}</Dest_Langage>
      <Dest_Ad1>${params.Dest_Ad1}</Dest_Ad1>
      <Dest_Ad2>${params.Dest_Ad2}</Dest_Ad2>
      <Dest_Ad3>${params.Dest_Ad3}</Dest_Ad3>
      <Dest_Ad4>${params.Dest_Ad4}</Dest_Ad4>
      <Dest_Ville>${params.Dest_Ville}</Dest_Ville>
      <Dest_CP>${params.Dest_CP}</Dest_CP>
      <Dest_Pays>${params.Dest_Pays}</Dest_Pays>
      <Dest_Tel1>${params.Dest_Tel1}</Dest_Tel1>
      <Dest_Tel2>${params.Dest_Tel2}</Dest_Tel2>
      <Dest_Mail>${params.Dest_Mail}</Dest_Mail>
      <Poids>${params.Poids}</Poids>
      <Longueur>${params.Longueur}</Longueur>
      <Taille>${params.Taille}</Taille>
      <NbColis>${params.NbColis}</NbColis>
      <CRT_Valeur>${params.CRT_Valeur}</CRT_Valeur>
      <CRT_Devise>${params.CRT_Devise}</CRT_Devise>
      <Assurance>${params.Assurance}</Assurance>
      <Instructions>${params.Instructions}</Instructions>
      <Livreur>${params.Livreur}</Livreur>
      <IdInShip>${params.IdInShip}</IdInShip>
      <Texte>${params.Texte}</Texte>
      <Security>${security}</Security>
    </WSI2_CreationEtiquette>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch("https://api.mondialrelay.com/WebServices.asmx", {
        method: "POST",
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "http://www.mondialrelay.fr/webservice/WSI2_CreationEtiquette"
        },
        body: soapBody
    });

    const xmlResult = await response.text();
    const parsed = await parseStringPromise(xmlResult, { 
        explicitArray: false,
        tagNameProcessors: [(name) => name.replace('soap:', '')] 
    });

    const result = parsed.Envelope.Body.WSI2_CreationEtiquetteResponse.WSI2_CreationEtiquetteResult;

    if (result.STAT !== "0") {
        throw new Error(`Erreur Mondial Relay Etiquette (STAT ${result.STAT})`);
    }

    return {
        url: result.URLEtiquette,
        tracking: result.ExpeditionNum
    };
}

// =========================================================================
// COLISSIMO API
// =========================================================================
async function generateColissimoLabel(shipping: any, email: string) {
    const contractNumber = import.meta.env.COLISSIMO_CONTRACT_NUMBER;
    const password = import.meta.env.COLISSIMO_PASSWORD;

    const payload = {
        contractNumber: contractNumber,
        password: password,
        outputFormat: { outputPrintingProtocol: "PDF_A4_300dpi" },
        letter: {
            service: { productCode: "DOM", commercialName: "Atelier Jean-François & Aniuta" },
            parcel: { weight: 1.0 },
            sender: {
                address: {
                    companyName: "Atelier Jean-François & Aniuta",
                    line2: "Mont Lozère et Goulet",
                    postalCode: "48250",
                    city: "Chasseradès",
                    countryCode: "FR"
                }
            },
            addressee: {
                address: {
                    lastName: shipping.name.toUpperCase(),
                    firstName: "Client",
                    line2: shipping.address.line1,
                    line3: shipping.address.line2 || "",
                    postalCode: shipping.address.postal_code,
                    city: shipping.address.city,
                    countryCode: "FR"
                },
                email: email,
                phoneNumber: shipping.phone || ""
            }
        }
    };

    const response = await fetch('https://ws.colissimo.fr/sls-ws/SlsServiceWS/rest/v2/generateLabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur API Colissimo : ${errText}`);
    }

    const data = await response.json();
    if (data.messages && data.messages[0].id !== "0") {
        throw new Error(`Colissimo Refus : ${data.messages[0].messageText}`);
    }

    const pdfBase64 = data.labelV2Response.pdf;
    return {
        url: `data:application/pdf;base64,${pdfBase64}`,
        tracking: data.labelV2Response.parcelNumber
    };
}