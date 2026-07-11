import CryptoJS from 'crypto-js';
import { parseStringPromise } from 'xml2js';

const ENSEIGNE = "TTMRSDBX";
const KEY = "9ytnxVCC";

const PAYS_CONFIG: Record<string, { regex: RegExp, example: string }> = {
    "FR": { regex: /^\d{5}$/, example: "75001" },
    "BE": { regex: /^\d{4}$/, example: "1000" },
    "LU": { regex: /^\d{4}$/, example: "L-1234" },
    "NL": { regex: /^\d{4} ?[A-Z]{2}$/i, example: "1012 AB" },
    "ES": { regex: /^\d{5}$/, example: "28001" },
    "PT": { regex: /^\d{4}-\d{3}$/, example: "1000-001" },
    "IT": { regex: /^\d{5}$/, example: "00100" },
};

const PAYS_AUTORISES = Object.keys(PAYS_CONFIG);



/**
 * Formate les horaires issus du XML WSI4
 */
function formatHoraires(horaireNode: any): string {
    if (!horaireNode || (typeof horaireNode === 'object' && horaireNode['$']?.['xsi:nil'] === 'true')) {
        return "Fermé";
    }

    // Dans WSI4, les horaires sont souvent dans horaireNode.string (un tableau)
    const blocs = horaireNode.string || [];
    const blocsArray = Array.isArray(blocs) ? blocs : [blocs];

    const formatted = blocsArray
        .filter((b: string) => b !== "0000")
        .map((b: string) => `${b.substring(0, 2)}:${b.substring(2, 4)}`);

    if (formatted.length === 0) return "Fermé";

    let res = [];
    for (let i = 0; i < formatted.length; i += 2) {
        if (formatted[i + 1]) res.push(`${formatted[i]}–${formatted[i + 1]}`);
    }
    return res.join(' / ');
}

export async function GET({ url }: { url: URL }) {
    let cp = url.searchParams.get('cp');
    const poids = url.searchParams.get('poids') || "0";
    const nombreResultats = "10";

    const paysParam = (url.searchParams.get('pays') || "FR").toUpperCase();

    if (!cp) {
        return new Response(JSON.stringify({ error: "Code postal manquant" }), { status: 400 });
    }

    if (!PAYS_AUTORISES.includes(paysParam)) {
        return new Response(JSON.stringify({ error: `Le pays '${paysParam}' n'est pas desservi.` }), { status: 400 });
    }

    // Nettoyage et validation du code postal
    cp = cp.trim().toUpperCase();
    if (paysParam === 'LU' && /^\d{4}$/.test(cp)) {
        cp = `L-${cp}`; // Ajoute le préfixe pour le Luxembourg si manquant
    }

    const countryConfig = PAYS_CONFIG[paysParam];
    if (countryConfig && !countryConfig.regex.test(cp)) {
        const errorMsg = `Format de code postal invalide pour ${paysParam}. Exemple attendu : ${countryConfig.example}.`;
        return new Response(JSON.stringify({ error: errorMsg }), { status: 400 });
    }

    /**
     * ALGORITHME MD5 WSI4
     * Ordre : Enseigne + Pays + NumPointRelais + Ville + CP + Latitude + Longitude + Taille + Poids + Action + DelaiEnvoi + RayonRecherche + TypeActivite + NACE + NombreResultats + Cle
     * Note : On laisse les champs vides pour ceux qu'on n'utilise pas.
     */
    const chaineSecurite = 
        ENSEIGNE + 
        paysParam + 
        "" + // NumPointRelais
        "" + // Ville
        cp + 
        "" + // Latitude
        "" + // Longitude
        "" + // Taille
        poids + 
        "" + // Action
        "" + // DelaiEnvoi
        "" + // RayonRecherche
        "" + // TypeActivite
        "" + // NACE
        nombreResultats + 
        KEY;
    
    const security = CryptoJS.MD5(chaineSecurite).toString().toUpperCase();

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI4_PointRelais_Recherche xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${ENSEIGNE}</Enseigne>
      <Pays>${paysParam}</Pays>
      <NumPointRelais></NumPointRelais>
      <Ville></Ville>
      <CP>${cp}</CP>
      <Latitude></Latitude>
      <Longitude></Longitude>
      <Taille></Taille>
      <Poids>${poids}</Poids>
      <Action></Action>
      <DelaiEnvoi></DelaiEnvoi>
      <RayonRecherche></RayonRecherche>
      <TypeActivite></TypeActivite>
      <NACE></NACE>
      <NombreResultats>${nombreResultats}</NombreResultats>
      <Security>${security}</Security>
    </WSI4_PointRelais_Recherche>
  </soap:Body>
</soap:Envelope>`;

    try {
        const response = await fetch("https://api.mondialrelay.com/WebService.asmx", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche"
            },
            body: soapEnvelope
        });

        const xmlData = await response.text();
        const result = await parseStringPromise(xmlData, { 
            explicitArray: false,
            tagNameProcessors: [(name) => name.replace('soap:', '')] 
        });

        const searchResult = result.Envelope.Body.WSI4_PointRelais_RechercheResponse.WSI4_PointRelais_RechercheResult;

        if (searchResult.STAT !== "0") {
            return new Response(JSON.stringify({ error: `Erreur MR STAT ${searchResult.STAT}` }), { status: 200 });
        }

        // Si aucun point relais n'est retourné, on renvoie une liste vide proprement
        if (!searchResult.PointsRelais || !searchResult.PointsRelais.PointRelais_Details) {
            return new Response(JSON.stringify({ points: [] }), { status: 200 });
        }
        let pointsBruts = searchResult.PointsRelais.PointRelais_Details;
        if (!Array.isArray(pointsBruts)) pointsBruts = [pointsBruts];

        const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

        const points = pointsBruts.map((p: any) => {
            const isLocker = p.LgAdr1.includes("LOCKER") || p.LgAdr1.includes("24/7");
            
            const hor_list = jours.map(j => {
                let h = formatHoraires(p[`Horaires_${j}`]);
                if (isLocker && (h === "Fermé" || h === "")) h = "Ouvert 24h/24";
                return `${j.substring(0, 2)}: ${h}`;
            });

            return {
                id: p.Num,
                nom: p.LgAdr1,
                adresse: p.LgAdr3,
                cp: p.CP,
                ville: p.Ville,
                horaires: hor_list
            };
        });

        return new Response(JSON.stringify({ points }), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({ error: "Crash API" }), { status: 500 });
    }
}