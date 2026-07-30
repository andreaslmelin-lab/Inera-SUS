import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_MASTER_PRODUCTS = [
  "Hjälpmedelstjänsten",
  "Intygstjänster Intygsstatistik",
  "Intygstjänster Rehabstöd",
  "Intygstjänster Webcert",
  "Intygstjänster 1177 intyg",
  "Intygstjänster Intygsadmin",
  "Intygstjänster Ärendesimulator",
  "Nationell patientöversikt (NPÖ)",
  "Nitha",
  "Pascal",
  "Infektionsverktyget",
  "SIL Online",
  "Rekord Rekommenderad ordination, SIL",
  "Centerped Redaktörsverktyg SIL",
  "Mitt gymnasieval",
  "Mitt gymnasieval Admin",
  "1177.se",
  "Barn och unga",
  "UMO.se",
  "Inera.se",
  "vardpersonal.1177.se",
  "Rikshandboken i barnhälsovård",
  "Vårdhandboken",
  "RGS Rådgivningsstödet Webb",
  "RKH Regelmotor för katalog och hänvisning",
  "Granskningsmiljön",
  "KKA Kontaktkortsadmin",
  "HJV Admin Hitta och jämför vård",
  "BUH Admin Medicinskt beslutsstöd",
  "BoV Gränssnitt Invånare Bild- och videoverktyget",
  "BoV Gränssnitt Vårdpersonal Bild- och videoverktyget",
  "1177 e-tjänster Startsida, Inställningar, Mottagnings startsida, Övriga tjänster, Webbkarta",
  "1177 e-tjänster Inkorg",
  "1177 e-tjänster bas Förnya recept - mottagningsväljare",
  "1177 E-tjänster personalverktyg (Bas)",
  "1177 Ärendehantering invånarvyer",
  "1177 Synpunkter och klagomål",
  "1177 e-tjänster inställningar",
  "1177 e-tjänster Mottagnings startsida",
  "1177 tidbokning",
  "1177 listning",
  "1177 högkostnadsskydd",
  "1177 samtycken",
  "1177 E-tjänster personalverktyget (HLT)",
  "1177 App",
  "1177 Stöd och behandlingsplattform, SOB Invånare",
  "1177 Stöd och behandlingsplattform, SOB Personal (Behandlare)",
  "1177 Stöd och behandlingsplattform, SOB Designverktyget",
  "1177 Formulärhantering invånare",
  "1177 Formulärhantering personal FORM",
  "1177 Journal",
  "1177 Provhantering",
  "1177 E-tjänster personalverktyg (ÄHT)",
  "SITHS eID portal ID-administratörer",
  "SITHS Mina sidor Personal",
  "SITHS eID klienter Windows",
  "SITHS eID klienter MacOS",
  "SITHS eID klienter Appar mobil (iOS)",
  "SITHS eID klienter Appar mobil (Android)",
  "IdP Medarbetare - Bas Legitimeringstjänst för medarbetare",
  "IdP Medarbetare - Plus Legitimeringstjänst för medarbetare",
  "IdP Invånar-IdP",
  "IdP Klientadministration",
  "Underskriftstjänsten Web",
  "HSA Webb Katalogtjänst HSA",
  "HSA Sök",
  "Terminologitjänsten",
  "PU Personuppgiftstjänsten",
  "Säkerhetstjänster Loggtjänsten",
  "Säkerhetstjänster Spärrtjänsten",
  "Säkerhetstjänster Samtyckestjänsten",
  "Video- och distansmötestjänsten",
  "Mimir Anslutningsverifiering"
];

export interface CatalogMappingState {
  masterCatalog: string[];
  mappings: Record<string, string>;
}

export async function loadMasterCatalog(): Promise<string[]> {
  try {
    const docRef = doc(db, 'settings', 'masterCatalog');
    const snap = await getDoc(docRef);
    if (snap.exists() && Array.isArray(snap.data().products) && snap.data().products.length > 0) {
      return snap.data().products;
    }
  } catch (e) {
    console.error("Fel vid laddning av masterCatalog:", e);
  }
  return DEFAULT_MASTER_PRODUCTS;
}

export async function saveMasterCatalog(products: string[]): Promise<void> {
  const docRef = doc(db, 'settings', 'masterCatalog');
  await setDoc(docRef, { products, updatedAt: new Date().toISOString() });
}

export async function loadProductMappings(): Promise<Record<string, string>> {
  try {
    const docRef = doc(db, 'settings', 'productMappings');
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().mappings) {
      return snap.data().mappings;
    }
  } catch (e) {
    console.error("Fel vid laddning av produktmappningar:", e);
  }
  return {};
}

export async function saveProductMappings(mappings: Record<string, string>): Promise<void> {
  const docRef = doc(db, 'settings', 'productMappings');
  await setDoc(docRef, { mappings, updatedAt: new Date().toISOString() });
}

export function parseMasterCatalogCsv(csvText: string): string[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  const products: string[] = [];

  // Parse simple CSV handling quoted strings
  for (let i = 1; i < lines.length; i++) { // Skip header line 0
    const line = lines[i];
    let firstCol = '';
    if (line.startsWith('"')) {
      const closingQuoteIdx = line.indexOf('"', 1);
      if (closingQuoteIdx > -1) {
        firstCol = line.substring(1, closingQuoteIdx).replace(/\n/g, ' ').trim();
      }
    } else {
      const firstCommaIdx = line.indexOf(',');
      if (firstCommaIdx > -1) {
        firstCol = line.substring(0, firstCommaIdx).trim();
      } else {
        firstCol = line.trim();
      }
    }

    if (firstCol && !products.includes(firstCol) && firstCol.toLowerCase() !== 'produkt') {
      products.push(firstCol);
    }
  }

  return products.length > 0 ? products : DEFAULT_MASTER_PRODUCTS;
}

export function findBestMatch(internalName: string, masterCatalog: string[]): string | undefined {
  if (!internalName || internalName.trim() === '') return undefined;
  const target = internalName.trim().toLowerCase();

  // 1. Exact match (case insensitive)
  const exact = masterCatalog.find(m => m.trim().toLowerCase() === target);
  if (exact) return exact;

  // 2. Dictionary of common Inera abbreviations & product synonyms
  const synonyms: Record<string, string> = {
    "inkorg": "1177 e-tjänster Inkorg",
    "inkorgen": "1177 e-tjänster Inkorg",
    "journal": "1177 Journal",
    "journalen": "1177 Journal",
    "tidbokning": "1177 tidbokning",
    "listning": "1177 listning",
    "recept": "1177 e-tjänster bas Förnya recept - mottagningsväljare",
    "provhantering": "1177 Provhantering",
    "sob": "1177 Stöd och behandlingsplattform, SOB Invånare",
    "stöd och behandling": "1177 Stöd och behandlingsplattform, SOB Invånare",
    "stöd och behandlingsplattform": "1177 Stöd och behandlingsplattform, SOB Invånare",
    "npö": "Nationell patientöversikt (NPÖ)",
    "nationell patientöversikt": "Nationell patientöversikt (NPÖ)",
    "hjälpmedel": "Hjälpmedelstjänsten",
    "hjälpmedelstjänsten": "Hjälpmedelstjänsten",
    "app": "1177 App",
    "1177 app": "1177 App",
    "siths": "SITHS eID portal ID-administratörer",
    "webcert": "Intygstjänster Webcert",
    "rehabstöd": "Intygstjänster Rehabstöd",
    "rehabstod": "Intygstjänster Rehabstöd",
    "nitha": "Nitha",
    "pascal": "Pascal",
    "terminologi": "Terminologitjänsten",
    "video": "Video- och distansmötestjänsten",
    "distansmöte": "Video- och distansmötestjänsten",
    "1177": "1177.se",
    "inera": "Inera.se",
    "umo": "UMO.se"
  };

  if (synonyms[target]) {
    const found = masterCatalog.find(m => m.trim().toLowerCase() === synonyms[target].toLowerCase());
    if (found) return found;
  }

  // 3. Check substring / word overlap
  const candidates = masterCatalog.filter(m => {
    const lower = m.trim().toLowerCase();
    return lower.includes(target) || target.includes(lower);
  });

  if (candidates.length > 0) {
    // Return shortest candidate name
    return candidates.sort((a, b) => a.length - b.length)[0];
  }

  return undefined;
}

export function autoMapProducts(
  internalNames: string[],
  masterCatalog: string[],
  currentMappings: Record<string, string>
): Record<string, string> {
  const updated = { ...currentMappings };

  for (const name of internalNames) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === 'Övriga' || trimmed === 'Generell' || trimmed === 'Other') {
      continue;
    }
    // Only auto-map if not already mapped or if mapped value is invalid
    if (!updated[trimmed] || !masterCatalog.includes(updated[trimmed])) {
      const match = findBestMatch(trimmed, masterCatalog);
      if (match) {
        updated[trimmed] = match;
      }
    }
  }

  return updated;
}
