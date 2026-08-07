// src/services/grundstrukturService.ts
import { collection, doc, setDoc, getDocs, writeBatch, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Papa from 'papaparse';
import { Product } from '../services';
import { DEFAULT_MASTER_PRODUCTS, loadProductMappings } from './catalogMappingService';

export interface IneraStructureProduct extends Product {
  teamId: string;
  teamName: string;
  trainId: string;
  trainName: string;
  uxLead?: string;
  rte?: string;
  maturity?: number;
  susScore?: number;
  idsVersion?: string;
  comment?: string;
  type: 'product';
  updatedAt?: string;
}

// // Utility to parse Swedish-style semicolon CSV using the specific Inera mapping
export function parseGrundstrukturCsv(csvText: string): IneraStructureProduct[] {
  const parsed = Papa.parse<any>(csvText, {
    delimiter: ';',
    skipEmptyLines: true,
    header: false
  });

  const rows = parsed.data;
  if (rows.length < 2) {
    throw new Error('Filen är tom eller saknar rader.');
  }

  const rawHeaders = rows[0].map((h: string) => h.trim());
  
  const findIdx = (headers: string[], ...keys: string[]) => {
    return headers.findIndex(h => {
      const hh = h.toLowerCase().trim();
      return keys.some(k => hh === k.toLowerCase() || hh.includes(k.toLowerCase()));
    });
  };

  const idIdx = findIdx(rawHeaders, 'ID (Källsystems-mappning)', 'ID', 'Produkt ID');
  const nameIdx = findIdx(rawHeaders, 'Namn');
  const typeIdx = findIdx(rawHeaders, 'Typ');
  const orgAreaIdx = findIdx(rawHeaders, 'Organisationsområde');
  const parentIdIdx = findIdx(rawHeaders, 'Överliggande ID');
  const uxLeadIdx = findIdx(rawHeaders, 'UX Ansvarig');
  const rteIdx = findIdx(rawHeaders, 'RTE');
  const maturityIdx = findIdx(rawHeaders, 'UX Mognadsnivå', 'Mognad');
  const susScoreIdx = findIdx(rawHeaders, 'SUS Poäng', 'SUS Betyg');
  const idsVersionIdx = findIdx(rawHeaders, 'IDS Version');
  const commentIdx = findIdx(rawHeaders, 'Kommentar');

  // Step 1: Map all rows by ID for hierarchy lookup
  const rowMap = new Map<string, any>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[idIdx]?.trim();
    if (id) rowMap.set(id, row);
  }

  const products: IneraStructureProduct[] = [];

  // Step 2: Extract products and traverse hierarchy
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const type = (row[typeIdx] || '').toLowerCase().trim();
    
    if (type !== 'product') continue;

    const id = row[idIdx]?.trim();
    const name = row[nameIdx]?.trim();
    if (!id || !name) continue;

    const parentId = row[parentIdIdx]?.trim();
    let teamName = 'Inget team';
    let teamId = parentId || 'no-team';
    let trainName = row[orgAreaIdx]?.trim() || 'Inget tåg';
    let trainId = 'no-train';

    // Traverse up to find Team and Train
    if (parentId && rowMap.has(parentId)) {
      const parentRow = rowMap.get(parentId);
      const parentType = (parentRow[typeIdx] || '').toLowerCase().trim();
      
      if (parentType === 'team') {
        teamId = parentId;
        teamName = parentRow[nameIdx]?.trim() || teamName;
        
        // Use Organisationsområde from the team row for Train Name
        trainName = parentRow[orgAreaIdx]?.trim() || trainName;
        trainId = parentRow[parentIdIdx]?.trim() || 'no-train';
      } else if (parentType === 'train') {
        // If parent is directly a train
        trainId = parentId;
        trainName = parentRow[nameIdx]?.trim() || trainName;
      }
    }

    const uxLead = uxLeadIdx !== -1 ? (row[uxLeadIdx] || '').trim() : '';
    const rte = rteIdx !== -1 ? (row[rteIdx] || '').trim() : '';
    
    let maturity = 0;
    if (maturityIdx !== -1 && row[maturityIdx]) {
      const val = parseInt(row[maturityIdx], 10);
      if (!isNaN(val)) maturity = val;
    }

    let susScore: number | undefined = undefined;
    if (susScoreIdx !== -1 && row[susScoreIdx]) {
      const val = parseFloat(row[susScoreIdx].toString().replace(',', '.'));
      if (!isNaN(val)) susScore = val;
    }

    const idsVersion = idsVersionIdx !== -1 ? (row[idsVersionIdx] || '').trim() : '';
    const comment = commentIdx !== -1 ? (row[commentIdx] || '').trim() : '';

    products.push({
      id,
      name,
      type: 'product',
      trainId,
      trainName,
      teamId,
      teamName,
      uxLead,
      rte,
      maturity,
      susScore,
      idsVersion,
      comment,
      updatedAt: new Date().toISOString()
    });
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

    const batch = writeBatch(db);
    
    // Save each parsed product directly into the products collection
    products.forEach(prod => {
      const prodRef = doc(db, 'products', prod.id);
      batch.set(prodRef, {
        id: prod.id,
        name: prod.name,
        teamId: prod.teamId,
        teamName: prod.teamName,
        trainId: prod.trainId,
        trainName: prod.trainName,
        uxLead: prod.uxLead || '',
        rte: prod.rte || '',
        maturity: prod.maturity ?? 0,
        susScore: prod.susScore ?? null,
        idsVersion: prod.idsVersion || '',
        comment: prod.comment || '',
        type: 'product',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });

    await batch.commit();
  },

  // Save a single product edit
  async saveProduct(product: Partial<IneraStructureProduct>): Promise<void> {
    if (!product.id) throw new Error("Product ID is required for editing.");
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

function mergeOptions(prod: IneraStructureProduct) {
  return true;
}
