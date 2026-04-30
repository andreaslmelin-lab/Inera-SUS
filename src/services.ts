import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  onSnapshot,
  Timestamp,
  writeBatch,
  limit,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import Papa from 'papaparse';
import { calculateSusScore } from './lib/utils';

export interface Product {
  id: string;
  name: string;
  description?: string;
}

export interface Variant {
  id: string;
  productId: string;
  name: string;
}

export interface Measurement {
  id: string;
  productId: string;
  date: Date;
  uploadedBy: string;
  fileName: string;
  averageScore: number;
  medianScore?: number;
  responseCount: number;
  variantScores?: Record<string, { 
    score: number, 
    median: number, 
    count: number,
    min?: number,
    max?: number,
    q1?: number,
    q3?: number
  }>;
  stats?: {
    min: number,
    max: number,
    q1: number,
    q3: number
  };
}

export interface ResponseData {
  id: string;
  measurementId: string;
  productId: string;
  variantName: string;
  susScore: number;
  answers: number[];
  comment: string;
  submitDate: Date;
  startDate?: Date;
  otherText?: string;
}

export const ProductService = {
  async getProductsOnce(): Promise<Product[]> {
    const path = 'products';
    try {
      const q = query(collection(db, path), orderBy('name'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  getAllProducts(callback: (data: Product[]) => void) {
    const path = 'products';
    const q = query(collection(db, path), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      callback(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, path));
  },

  async getVariants(productId: string): Promise<Variant[]> {
    const path = `products/${productId}/variants`;
    try {
      const q = collection(db, path);
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Variant));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async ensureProduct(name: string): Promise<string> {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const docRef = doc(db, 'products', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      await setDoc(docRef, { id, name });
    }
    return id;
  }
};

export const MeasurementService = {
  async uploadCsv(file: File, productId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        encoding: 'ISO-8859-1', // Correct for Swedish characters in common CSV exports
        complete: async (results) => {
          try {
            const rows = results.data as string[][];
            if (rows.length < 2) {
              throw new Error('Filen är tom eller saknar data.');
            }

            // Basic format validation
            const rawHeader = rows[0];
            if (rawHeader.length < 5) {
              throw new Error(`Ogiltigt filformat. Förväntade minst 5 kolumner, hittade ${rawHeader.length}.`);
            }
            
            // Normalize headers
            const header = rawHeader.map(h => h.trim().toLowerCase());
            
            // Explicitly detect columns as requested
            const filterIdx = header.findIndex(h => h.includes('kommer du ihåg'));
            const variantIdx = header.findIndex(h => h.includes('vilken funktion på 1177'));
            const otherIdx = header.findIndex(h => h === 'other' || h.includes('other'));
            const commentIdx = header.findIndex(h => h.includes('här kan du skriva en kommentar') || h.includes('kommentar'));
            const scoreIdx = header.findIndex(h => h === 'score' || h === 'poäng' || h === 'sus');
            
            // Date detection
            const startDateIdx = header.findIndex(h => h.includes('start date'));
            const submitDateIdx = header.findIndex(h => h.includes('submit date') || h.includes('inskickad'));
            
            console.log('Detected indices:', { filterIdx, variantIdx, otherIdx, commentIdx, scoreIdx, startDateIdx, submitDateIdx });
            
            const dataRows = rows.slice(1);
            const responses: Partial<ResponseData>[] = [];
            let totalSus = 0;
            let validCount = 0;
            const allScores: number[] = [];
            const variants = new Set<string>();
            const variantStats: Record<string, { total: number, count: number, scores: number[] }> = {};

            for (let i = 0; i < dataRows.length; i++) {
              const row = dataRows[i];
              if (row.length < 5) continue;

              // Rule: if value in "Kommer du ihåg..." is 0, skip.
              if (filterIdx !== -1 && row[filterIdx] === '0') {
                continue;
              }

              // Extract variant name
              let variantName = '';
              let otherText = '';

              if (variantIdx !== -1) {
                variantName = (row[variantIdx] || '').trim();
              }
              
              // Handle "Other" merger as requested
              // If the explicit "Other" column has data, we categorize as 'Other'
              if (otherIdx !== -1 && row[otherIdx] && row[otherIdx].trim()) {
                otherText = row[otherIdx].trim();
                variantName = 'Other';
              }

              if (!variantName || variantName === 'Other' || variantName === 'Generell' || variantName === 'Utvärdering' || variantName === 'Övriga') {
                variantName = 'Other';
              }
              
              // Clean quotes
              variantName = variantName.replace(/^"|"$/g, '').trim();
              variants.add(variantName);

              let susScore = 0;
              let usedRawScore = false;
              
              if (scoreIdx !== -1 && row[scoreIdx]) {
                const rawScoreStr = row[scoreIdx].replace(',', '.').trim();
                const rawScore = parseFloat(rawScoreStr);
                if (!isNaN(rawScore) && rawScore > 0) {
                  // If score is already > 40, we assume it's a 0-100 SUS score.
                  // If it's <= 40, we assume it's the raw sum and multiply by 2.5.
                  if (rawScore > 40) {
                    susScore = rawScore;
                  } else {
                    susScore = rawScore * 2.5;
                  }
                  usedRawScore = true;
                }
              } 
              
              if (!usedRawScore) {
                let foundAnswers: number[] | null = null;
                // Look for 10 consecutive SUS-like answers (1-5)
                for (let start = 0; start < Math.min(row.length - 10, 15); start++) {
                  const slice = row.slice(start, start + 10).map(v => parseInt(v, 10));
                  if (slice.every(v => !isNaN(v) && v >= 1 && v <= 5)) {
                    foundAnswers = slice;
                    break;
                  }
                }

                if (foundAnswers) {
                  susScore = calculateSusScore(foundAnswers);
                } else {
                  continue;
                }
              }

              // CRITICAL: Max SUS is 100. Skip rows with invalid high scores.
              if (susScore <= 0 || susScore > 100) continue;
              
              // Date parsing with validation
              const submitDateStr = submitDateIdx !== -1 ? row[submitDateIdx] : (row[row.length - 1] || '');
              const startDateStr = startDateIdx !== -1 ? row[startDateIdx] : '';
              
              let submitDate = submitDateStr ? new Date(submitDateStr.trim()) : new Date();
              if (isNaN(submitDate.getTime())) submitDate = new Date();

              let startDate: Date | undefined = undefined;
              if (startDateStr) {
                const parsedStart = new Date(startDateStr.trim());
                if (!isNaN(parsedStart.getTime())) {
                  startDate = parsedStart;
                }
              }
              
              const commentVal = commentIdx !== -1 ? (row[commentIdx] || '') : '';
              
              responses.push({
                productId,
                variantName,
                susScore,
                answers: [], // Not strictly needed for stats now
                comment: commentVal.replace(/^"|"$/g, '').trim(),
                submitDate,
                startDate: startDate || submitDate,
                otherText
              });
              
              totalSus += susScore;
              validCount++;
              allScores.push(susScore);
              
              if (!variantStats[variantName]) variantStats[variantName] = { total: 0, count: 0, scores: [] };
              variantStats[variantName].total += susScore;
              variantStats[variantName].count++;
              variantStats[variantName].scores.push(susScore);
            }

            if (validCount === 0) {
              throw new Error('Inga giltiga SUS-svar hittades. Kontrollera att filen har rätt format.');
            }

            const averageScore = totalSus / validCount;
            
            const getBoxStats = (scores: number[]) => {
              const sorted = [...scores].sort((a, b) => a - b);
              const n = sorted.length;
              const median = n % 2 !== 0 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
              const q1 = sorted[Math.floor(n / 4)];
              const q3 = sorted[Math.floor(3 * n / 4)];
              return {
                min: sorted[0],
                max: sorted[n - 1],
                median,
                q1,
                q3
              };
            };

            const globalStats = getBoxStats(allScores);
            
            const variantScores: Record<string, any> = {};
            for (const [vName, stats] of Object.entries(variantStats)) {
              const vStats = getBoxStats(stats.scores);
              variantScores[vName] = {
                score: stats.total / stats.count,
                count: stats.count,
                ...vStats
              };
            }
            
            const measurementRef = await addDoc(collection(db, 'measurements'), {
              productId,
              date: Timestamp.now(),
              uploadedBy: userId,
              fileName: file.name,
              averageScore,
              medianScore: globalStats.median,
              responseCount: validCount,
              variantScores,
              stats: {
                min: globalStats.min,
                max: globalStats.max,
                q1: globalStats.q1,
                q3: globalStats.q3
              }
            });

            // Batch upload responses
            const batch = writeBatch(db);
            responses.forEach(resp => {
              const respRef = doc(collection(db, 'responses'));
              batch.set(respRef, {
                ...resp,
                measurementId: measurementRef.id,
                submitDate: Timestamp.fromDate(resp.submitDate || new Date()),
                startDate: resp.startDate ? Timestamp.fromDate(resp.startDate) : Timestamp.fromDate(resp.submitDate || new Date()),
                otherText: resp.otherText || ''
              });
            });
            
            // Ensure variants exist
            for (const vName of variants) {
              const vId = vName.toLowerCase().replace(/\s+/g, '-');
              const vRef = doc(db, `products/${productId}/variants`, vId);
              batch.set(vRef, { id: vId, productId, name: vName }, { merge: true });
            }

            await batch.commit();
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => reject(err)
      });
    });
  },

  async deleteMeasurement(measurementId: string): Promise<void> {
    const measurementRef = doc(db, 'measurements', measurementId);
    
    // Get all responses for this measurement
    const q = query(collection(db, 'responses'), where('measurementId', '==', measurementId));
    const snapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete the measurement itself
    batch.delete(measurementRef);
    
    await batch.commit();
  },

  async resetCatalog(): Promise<void> {
    const deleteCollection = async (collectionPath: string) => {
      const q = query(collection(db, collectionPath), limit(500));
      let snapshot = await getDocs(q);
      
      while (snapshot.size > 0) {
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        snapshot = await getDocs(q);
      }
    };

    // Delete responses first (usually the largest)
    await deleteCollection('responses');
    // Delete measurements
    await deleteCollection('measurements');
    
    // For products, we also need to delete their variants subcollections
    const productsSnap = await getDocs(collection(db, 'products'));
    for (const productDoc of productsSnap.docs) {
      await deleteCollection(`products/${productDoc.id}/variants`);
    }
    
    // Finally delete products
    await deleteCollection('products');
  },

  getMeasurements(productId: string, callback: (data: Measurement[]) => void) {
    const q = query(
      collection(db, 'measurements'),
      where('productId', '==', productId),
      orderBy('date', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      } as Measurement));
      callback(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'measurements'));
  },

  getAllMeasurements(callback: (data: Measurement[]) => void) {
    const q = query(
      collection(db, 'measurements'),
      orderBy('date', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      } as Measurement));
      callback(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'measurements'));
  },

  getResponses(measurementId: string, callback: (data: ResponseData[]) => void) {
    const q = query(
      collection(db, 'responses'),
      where('measurementId', '==', measurementId)
    );
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        submitDate: (doc.data().submitDate as Timestamp).toDate()
      } as ResponseData));
      callback(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'responses'));
  },

  getResponsesByProduct(productId: string, callback: (data: ResponseData[]) => void) {
    const q = query(
      collection(db, 'responses'),
      where('productId', '==', productId)
    );
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        submitDate: (doc.data().submitDate as Timestamp).toDate(),
        startDate: doc.data().startDate ? (doc.data().startDate as Timestamp).toDate() : (doc.data().submitDate as Timestamp).toDate(),
        otherText: doc.data().otherText || ''
      } as ResponseData));
      callback(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'responses'));
  },

  async getLatestMeasurementsForAllProducts(): Promise<Measurement[]> {
    const products = await ProductService.getProductsOnce();
    const latestMeasurements: Measurement[] = [];
    
    for (const product of products) {
      const q = query(
        collection(db, 'measurements'),
        where('productId', '==', product.id),
        orderBy('date', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        latestMeasurements.push({
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data(),
          date: (snapshot.docs[0].data().date as Timestamp).toDate()
        } as Measurement);
      }
    }
    return latestMeasurements;
  }
};
