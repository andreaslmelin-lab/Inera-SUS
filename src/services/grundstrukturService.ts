// src/services/grundstrukturService.ts
import { collection, doc, setDoc, getDocs, writeBatch, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Papa from 'papaparse';
import { Product } from '../services';

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
}

// Utility to parse Swedish-style semicolon CSV
export function parseGrundstrukturCsv(csvText: string): IneraStructureProduct[] {
  // Use papaparse with explicit semicolon delimiter
  const parsed = Papa.parse<any>(csvText, {
    delimiter: ';',
    skipEmptyLines: true,
    header: false
  });

  const rows = parsed.data;
  if (rows.length < 2) {
    throw new Error('Filen är tom eller saknar rader.');
  }

  // Find header indices
  const rawHeaders = rows[0].map((h: string) => h.trim());
  
  const idIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('id (källsystems-mappning)') || h.toLowerCase() === 'id');
  const nameIdx = rawHeaders.findIndex(h => h.toLowerCase() === 'namn');
  const typeIdx = rawHeaders.findIndex(h => h.toLowerCase() === 'typ');
  const parentIdIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('överliggande id') || h.toLowerCase() === 'parent_id');
  const parentNameIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('överliggande namn'));
  const uxLeadIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('ux ansvarig'));
  const rteIdx = rawHeaders.findIndex(h => h.toLowerCase() === 'rte');
  const maturityIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('mognadsnivå') || h.toLowerCase().includes('mognad'));
  const susScoreIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('sus poäng') || h.toLowerCase().includes('sus_score') || h.toLowerCase().includes('sus poäng'));
  const idsVersionIdx = rawHeaders.findIndex(h => h.toLowerCase().includes('ids version') || h.toLowerCase().includes('ids_version'));
  const commentIdx = rawHeaders.findIndex(h => h.toLowerCase() === 'kommentar' || h.toLowerCase() === 'notes');

  if (idIdx === -1 || nameIdx === -1 || typeIdx === -1) {
    throw new Error('Hittade inte obligatoriska kolumner (ID, Namn, Typ) i CSV-huvudet.');
  }

  // Process rows into a dictionary map first for tracing hierarchy
  const rawRowsMap: Record<string, {
    id: string;
    name: string;
    type: string;
    parentId: string;
    parentName: string;
    uxLead?: string;
    rte?: string;
    maturity?: number;
    susScore?: number;
    idsVersion?: string;
    comment?: string;
  }> = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const id = (row[idIdx] || '').trim();
    const name = (row[nameIdx] || '').trim();
    const type = (row[typeIdx] || '').trim().toLowerCase();

    if (!id || !name) continue;

    const parentId = parentIdIdx !== -1 ? (row[parentIdIdx] || '').trim() : '';
    const parentName = parentNameIdx !== -1 ? (row[parentNameIdx] || '').trim() : '';
    const uxLead = uxLeadIdx !== -1 ? (row[uxLeadIdx] || '').trim() : '';
    const rte = rteIdx !== -1 ? (row[rteIdx] || '').trim() : '';
    
    let maturity: number | undefined = undefined;
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

    rawRowsMap[id] = {
      id,
      name,
      type,
      parentId,
      parentName,
      uxLead,
      rte,
      maturity,
      susScore,
      idsVersion,
      comment
    };
  }

  // Trace hierarchy to find team and train for each product
  const products: IneraStructureProduct[] = [];

  for (const id in rawRowsMap) {
    const item = rawRowsMap[id];
    if (item.type === 'product' || item.type === 'produkt' || id.startsWith('prod-')) {
      let teamId = item.parentId || '';
      let teamName = item.parentName || '';
      let trainId = '';
      let trainName = '';

      // Let's look up the team in our map
      if (teamId && rawRowsMap[teamId]) {
        const teamRow = rawRowsMap[teamId];
        teamName = teamRow.name;
        // The train is the team's parent
        if (teamRow.parentId && rawRowsMap[teamRow.parentId]) {
          const trainRow = rawRowsMap[teamRow.parentId];
          trainId = trainRow.id;
          trainName = trainRow.name;
        } else {
          // Fallback if team has direct train/org info
          trainId = teamRow.parentId || '';
          trainName = teamRow.parentName || '';
        }
      } else {
        // Fallback or unmapped
        teamId = teamId || 'team-omappat';
        teamName = teamName || 'Omappat team';
        trainId = 'train-omappade';
        trainName = 'Omappade';
      }

      products.push({
        id: item.id,
        name: item.name,
        type: 'product',
        teamId,
        teamName,
        trainId: trainId || 'train-omappade',
        trainName: trainName || 'Omappade',
        uxLead: item.uxLead || '',
        rte: item.rte || '',
        maturity: item.maturity ?? 0,
        susScore: item.susScore,
        idsVersion: item.idsVersion || '',
        comment: item.comment || ''
      });
    }
  }

  return products;
}

export const GrundstrukturService = {
  // Bulk upload new products structure
  async saveStructure(products: IneraStructureProduct[]): Promise<void> {
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
