import CryptoJS from 'crypto-js';
import { parseStringPromise } from 'xml2js';

const ENSEIGNE = "TTMRSDBX";
const KEY = "9ytnxVCC";
const PAYS = "FR";

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
    const cp = url.searchParams.get('cp');
    const poids = url.searchParams.get('poids') || "0";
    const nombreResultats = "10";

    if (!cp) {
        return new Response(JSON.stringify({ error: "Code postal manquant" }), { status: 400 });
    }

    /**
     * ALGORITHME MD5 WSI4
     * Ordre : Enseigne + Pays + NumPointRelais + Ville + CP + Latitude + Longitude + Taille + Poids + Action + DelaiEnvoi + RayonRecherche + TypeActivite + NACE + NombreResultats + Cle
     * Note : On laisse les champs vides pour ceux qu'on n'utilise pas.
     */
    const chaineSecurite = 
        ENSEIGNE + 
        PAYS + 
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
      <Pays>${PAYS}</Pays>
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