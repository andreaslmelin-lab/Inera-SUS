// src/services/grundstrukturService.ts
import { collection, doc, setDoc, getDocs, writeBatch, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Papa from 'papaparse';
import { Product } from '../types';

export interface IneraStructureProduct extends Product {
  teamId: string;
  teamName: string;
  trainId: string;
  trainName: string;
  uxLead?: string;
  uiDesigner?: string;
  productOwner?: string;
  serviceManager?: string;
  otherContact?: string;
  brandTheme?: string;
  appliesBrand?: string;
  framework?: string;
  links?: string;
  rte?: string;
  maturity?: number;
  susScore?: number;
  idsVersion?: string;
  comment?: string;
  type: 'product';
  updatedAt?: string;
}

function cleanString(str: any): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateProductId(name: string, existingIds: Set<string>): string {
  const normalized = name
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[éè]/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let baseId = `prod-${normalized}`.substring(0, 45);
  if (!baseId || baseId === 'prod-') baseId = 'prod-' + Math.random().toString(36).substring(2, 8);

  let uniqueId = baseId;
  let counter = 2;
  while (existingIds.has(uniqueId)) {
    uniqueId = `${baseId}-${counter}`;
    counter++;
  }
  existingIds.add(uniqueId);
  return uniqueId;
}

/**
 * Universal CSV parser for Inera Grundstruktur.
 * Supports:
 * 1. Inera Master Product Matrix (e.g. Produkt, Varumärke/Tema, Tillämpar varumärke, Ramverk, IDS-version, Tåg, Team, UX-lead, UI-designer, etc.)
 * 2. Hierarchical structure CSVs with Typ (product/team/train), ID, Överliggande ID, etc.
 * 3. Both comma (,) and semicolon (;) separators, with automatic header resolution and clean newline handling in quoted cells.
 */
export function parseGrundstrukturCsv(csvText: string): IneraStructureProduct[] {
  if (!csvText || !csvText.trim()) {
    throw new Error('Filen är tom eller saknar innehåll.');
  }

  // 1. First attempt: parse with headers enabled (auto-detect delimiter)
  const headerParsed = Papa.parse<Record<string, any>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false
  });

  const rawRows = headerParsed.data;
  const fields = headerParsed.meta.fields || [];

  const findKey = (row: Record<string, any>, strictKeys: string[], partialKeys: string[] = []): string => {
    // 1. Strict match
    for (const key of strictKeys) {
      for (const f of Object.keys(row)) {
        const cleanF = f.trim().toLowerCase();
        if (cleanF === key.toLowerCase()) {
          const val = row[f];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return cleanString(val);
          }
        }
      }
    }
    // 2. Partial match
    for (const key of partialKeys) {
      for (const f of Object.keys(row)) {
        const cleanF = f.trim().toLowerCase();
        if (cleanF.includes(key.toLowerCase()) && 
            !cleanF.includes('version') && 
            !cleanF.includes('tema') && 
            !cleanF.includes('ramverk') &&
            !cleanF.includes('tillämpar') &&
            !cleanF.includes('tillampar')) {
          const val = row[f];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return cleanString(val);
          }
        }
      }
    }
    return '';
  };

  const usedIds = new Set<string>();
  const products: IneraStructureProduct[] = [];

  // Check if this is a hierarchical CSV (has "Typ" and "Överliggande ID" or "Parent")
  const isHierarchical = fields.some(f => {
    const cf = f.toLowerCase();
    return cf === 'typ' || cf === 'överliggande id' || cf === 'overliggande id';
  });

  if (isHierarchical) {
    // Handle hierarchical format
    const rowMap = new Map<string, Record<string, any>>();
    for (const row of rawRows) {
      const id = findKey(row, ['id', 'produkt id', 'id (källsystems-mappning)']);
      if (id) rowMap.set(id, row);
    }

    for (const row of rawRows) {
      const type = findKey(row, ['typ', 'type']).toLowerCase();
      if (type !== 'product' && type !== 'produkt' && type !== '') continue;

      const name = findKey(row, ['namn', 'produkt', 'name', 'tjanst', 'tjänst']);
      if (!name) continue;

      const rawId = findKey(row, ['id', 'produkt id', 'id (källsystems-mappning)']);
      const id = rawId || generateProductId(name, usedIds);
      usedIds.add(id);

      const parentId = findKey(row, ['överliggande id', 'overliggande id', 'parentid', 'parent id']);
      let teamName = 'Inget team';
      let teamId = parentId || 'no-team';
      let trainName = findKey(row, ['organisationsområde', 'organisationsomrade', 'tåg', 'train']) || 'Inget tåg';
      let trainId = 'no-train';

      if (parentId && rowMap.has(parentId)) {
        const parentRow = rowMap.get(parentId)!;
        const parentType = findKey(parentRow, ['typ', 'type']).toLowerCase();

        if (parentType === 'team') {
          teamId = parentId;
          teamName = findKey(parentRow, ['namn', 'name', 'team']) || teamName;
          trainName = findKey(parentRow, ['organisationsområde', 'organisationsomrade', 'tåg', 'train']) || trainName;
          trainId = findKey(parentRow, ['överliggande id', 'overliggande id', 'parentid']) || 'no-train';
        } else if (parentType === 'train' || parentType === 'tåg') {
          trainId = parentId;
          trainName = findKey(parentRow, ['namn', 'name', 'tåg', 'train']) || trainName;
        }
      }

      const uxLead = findKey(row, ['ux ansvarig', 'ux-ansvarig', 'ux-lead', 'ux lead', 'ux']);
      const uiDesigner = findKey(row, ['ui-designer', 'ui designer', 'designer']);
      const productOwner = findKey(row, ['produktägare', 'produktagare', 'product owner', 'po']);
      const serviceManager = findKey(row, ['tjänsteansvarig', 'tjansteansvarig', 'ta', 'rte']);
      const otherContact = findKey(row, ['övrig kontakt', 'ovrig kontakt', 'kontakt']);
      const rte = findKey(row, ['rte']) || serviceManager;
      const idsVersion = findKey(row, ['ids version', 'ids-version', 'idsversion']);
      const comment = findKey(row, ['kommentar', 'anteckning', 'notering', 'beskrivning']);
      const brandTheme = findKey(row, ['varumärke/tema', 'varumarke/tema', 'tema', 'varumärke']);
      const appliesBrand = findKey(row, ['tillämpar varumärke', 'tillampar varumarke']);
      const framework = findKey(row, ['ramverk', 'framework']);
      const links = findKey(row, ['länkar', 'lankar', 'länk', 'url', 'webbplats']);

      let maturity = 0;
      const rawMaturity = findKey(row, ['ux mognadsnivå', 'ux mognad', 'mognad']);
      if (rawMaturity) {
        const val = parseInt(rawMaturity, 10);
        if (!isNaN(val)) maturity = val;
      }

      let susScore: number | undefined = undefined;
      const rawSus = findKey(row, ['sus poäng', 'sus poang', 'sus betyg', 'sus score', 'sus']);
      if (rawSus) {
        const val = parseFloat(rawSus.replace(',', '.'));
        if (!isNaN(val)) susScore = val;
      }

      products.push({
        id,
        name,
        type: 'product',
        trainId,
        trainName,
        teamId,
        teamName,
        uxLead,
        uiDesigner,
        productOwner,
        serviceManager,
        otherContact,
        rte,
        maturity,
        susScore,
        idsVersion,
        comment,
        brandTheme,
        appliesBrand,
        framework,
        links,
        updatedAt: findKey(row, ['uppdaterat', 'datum']) || new Date().toISOString()
      });
    }
  } else {
    // Master Product Matrix format
    for (const row of rawRows) {
      const name = findKey(row, 
        ['produkt', 'namn', 'product', 'produktnamn', 'tjanst', 'tjänst', 'namn på produkt'], 
        ['produkt', 'product', 'tjanst', 'tjänst']
      );

      if (!name) continue;

      const rawId = findKey(row, ['id', 'produkt id', 'product id', 'id (källsystems-mappning)']);
      const id = rawId || generateProductId(name, usedIds);
      usedIds.add(id);

      const trainName = findKey(row, 
        ['tåg', 'tag', 'organisationsområde', 'organisationsomrade', 'train', 'område', 'omrade', 'art'], 
        ['tåg', 'organisations']
      ) || 'Omappade';

      const trainId = findKey(row, ['tåg id', 'train id', 'tag id']) || 
        `train-${trainName.toLowerCase().replace(/[åä]/g, 'a').replace(/[ö]/g, 'o').replace(/[^a-z0-9]+/g, '-')}`;

      const teamName = findKey(row, 
        ['team', 'utvecklingsteam', 'teamnamn', 'team namn', 'k1 java', 'k2 ivt'], 
        ['team']
      ) || 'Inget team';

      const teamId = findKey(row, ['team id', 'team-id']) || 
        `team-${teamName.toLowerCase().replace(/[åä]/g, 'a').replace(/[ö]/g, 'o').replace(/[^a-z0-9]+/g, '-')}`;

      const uxLead = findKey(row, ['ux-lead', 'ux lead', 'ux ansvarig', 'ux-ansvarig', 'uxansvarig', 'ux']);
      const uiDesigner = findKey(row, ['ui-designer', 'ui designer', 'designer', 'uidesigner']);
      const productOwner = findKey(row, ['produktägare', 'produktagare', 'product owner', 'po']);
      const serviceManager = findKey(row, ['tjänsteansvarig', 'tjansteansvarig', 'service manager', 'ta', 'rte']);
      const otherContact = findKey(row, ['övrig kontakt', 'ovrig kontakt', 'kontakt', 'andra kontakter']);
      const rte = findKey(row, ['rte']) || serviceManager;
      const idsVersion = findKey(row, ['ids-version', 'ids version', 'idsversion', 'ids']);
      const comment = findKey(row, ['kommentar', 'anteckning', 'notering', 'beskrivning', 'info']);
      const brandTheme = findKey(row, ['varumärke/tema', 'varumarke/tema', 'tema', 'varumärke', 'varumarke', 'brand']);
      const appliesBrand = findKey(row, ['tillämpar varumärke', 'tillampar varumarke', 'varumärkesstatus']);
      const framework = findKey(row, ['ramverk', 'framework', 'teknik']);
      const links = findKey(row, ['länkar', 'lankar', 'länk', 'lank', 'url', 'webbplats']);

      let maturity = 0;
      const rawMaturity = findKey(row, ['ux mognadsnivå', 'ux mognad', 'mognadsnivå', 'mognad']);
      if (rawMaturity) {
        const val = parseInt(rawMaturity, 10);
        if (!isNaN(val)) maturity = val;
      }

      let susScore: number | undefined = undefined;
      const rawSus = findKey(row, ['sus poäng', 'sus poang', 'sus betyg', 'sus score', 'sus']);
      if (rawSus) {
        const val = parseFloat(rawSus.replace(',', '.'));
        if (!isNaN(val)) susScore = val;
      }

      const updatedAt = findKey(row, ['uppdaterat', 'datum', 'senast uppdaterad', 'uppdaterad']) || new Date().toISOString();

      products.push({
        id,
        name,
        type: 'product',
        trainId,
        trainName,
        teamId,
        teamName,
        uxLead,
        uiDesigner,
        productOwner,
        serviceManager,
        otherContact,
        rte,
        maturity,
        susScore,
        idsVersion,
        comment,
        brandTheme,
        appliesBrand,
        framework,
        links,
        updatedAt
      });
    }
  }

  return products;
}

export const GrundstrukturService = {
  // Clear all products from the collection
  async clearAllProducts(): Promise<void> {
    const snap = await getDocs(collection(db, 'products'));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  },

  // Bulk upload new products structure
  async saveStructure(products: IneraStructureProduct[]): Promise<void> {
    // 1. Clear existing products first to avoid duplicates
    await this.clearAllProducts();

    // Firestore batch has a limit of 500 operations per batch
    const chunks: IneraStructureProduct[][] = [];
    for (let i = 0; i < products.length; i += 400) {
      chunks.push(products.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(prod => {
        const prodRef = doc(db, 'products', prod.id);
        batch.set(prodRef, {
          id: prod.id,
          name: prod.name,
          teamId: prod.teamId,
          teamName: prod.teamName,
          trainId: prod.trainId,
          trainName: prod.trainName,
          uxLead: prod.uxLead || '',
          uiDesigner: prod.uiDesigner || '',
          productOwner: prod.productOwner || '',
          serviceManager: prod.serviceManager || '',
          otherContact: prod.otherContact || '',
          rte: prod.rte || '',
          maturity: prod.maturity ?? 0,
          susScore: prod.susScore ?? null,
          idsVersion: prod.idsVersion || '',
          brandTheme: prod.brandTheme || '',
          appliesBrand: prod.appliesBrand || '',
          framework: prod.framework || '',
          links: prod.links || '',
          comment: prod.comment || '',
          type: 'product',
          updatedAt: prod.updatedAt || new Date().toISOString()
        }, { merge: true });
      });
      await batch.commit();
    }
  },

  // Save a single product edit
  async saveProduct(product: Partial<IneraStructureProduct>): Promise<void> {
    if (!product.id) throw new Error('Produkt-ID är obligatoriskt.');
    const docRef = doc(db, 'products', product.id);
    await setDoc(docRef, {
      ...product,
      type: 'product',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  },

  // Delete a product from the structure
  async deleteProduct(productId: string): Promise<void> {
    await deleteDoc(doc(db, 'products', productId));
  }
};

