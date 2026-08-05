// src/services/syncService.ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { loadProductMappings } from './catalogMappingService';

export async function pushMetricsToAdminDashboard(payload: {
  source: "inera-sus";
  metrics: {
    score: number;
    evaluationsCount: number;
    responseRate: number;
  };
  granularData?: {
    products?: Array<{
      productId: string;
      productName: string;
      susScore: number;
      responses: number;
    }>;
  };
}) {
  try {
    const body = {
      source: "inera-sus",
      timestamp: new Date().toISOString(),
      metrics: payload.metrics,
      granularData: payload.granularData || { products: [] }
    };

    const response = await fetch("/api/sync-metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn("Kunde inte synka till Inera UX Dashboard:", response.status, response.statusText);
      return false;
    }

    const data = await response.json();
    console.log("Data synkad med Inera UX Dashboard!", data);
    return true;
  } catch (error) {
    console.error("Fel vid synkronisering med Inera UX Dashboard:", error);
    return false;
  }
}

export async function triggerSusMetricsSync() {
  try {
    const measurementsSnap = await getDocs(collection(db, 'measurements'));
    const measurements = measurementsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const responsesSnap = await getDocs(collection(db, 'responses'));
    const responses = responsesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // Calculate total scores from all responses
    let totalScoreSum = 0;
    responses.forEach(r => {
      totalScoreSum += (r.susScore || 0);
    });
    const overallScore = responses.length > 0 
      ? Math.round((totalScoreSum / responses.length) * 10) / 10 
      : 0;

    const mappings = await loadProductMappings();

    // Fetch products to support direct ID or exact name matching
    const productsSnap = await getDocs(collection(db, 'products'));
    const products = productsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const productMap = new Map<string, any>();
    products.forEach(p => {
      productMap.set(p.id, p);
      productMap.set(p.name.toLowerCase().trim(), p);
    });

    // Group responses by variantName mapped to official master catalog product names
    const variantMetricsMap: Record<string, { totalScore: number; count: number; productId: string }> = {};
    responses.forEach(r => {
      // Find matching product in database
      let matchedProduct = null;
      const rawName = (r.variantName || '').trim();
      const rawNameLower = rawName.toLowerCase();

      if (productMap.has(rawName)) {
        matchedProduct = productMap.get(rawName);
      } else if (productMap.has(rawNameLower)) {
        matchedProduct = productMap.get(rawNameLower);
      } else if (r.productId && productMap.has(r.productId)) {
        matchedProduct = productMap.get(r.productId);
      }

      let mappedName = '';
      let prodId = '';

      if (matchedProduct) {
        mappedName = matchedProduct.name;
        prodId = matchedProduct.id;
      } else {
        const normalizedRaw = rawName === 'Generell' || rawName === 'Other' || rawName === 'Övriga' ? 'Övriga' : rawName;
        mappedName = mappings[normalizedRaw] || normalizedRaw || 'Övriga';
        prodId = (r.productId || mappedName).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'prod-general';
      }

      if (!variantMetricsMap[mappedName]) {
        variantMetricsMap[mappedName] = { 
          totalScore: 0, 
          count: 0, 
          productId: prodId
        };
      }
      variantMetricsMap[mappedName].totalScore += (r.susScore || 0);
      variantMetricsMap[mappedName].count++;
    });

    const productMetrics = Object.entries(variantMetricsMap).map(([name, data]) => ({
      productId: data.productId,
      productName: name,
      susScore: data.count > 0 ? Math.round((data.totalScore / data.count) * 10) / 10 : 0,
      responses: data.count
    }));

    return await pushMetricsToAdminDashboard({
      source: "inera-sus",
      metrics: {
        score: overallScore,
        evaluationsCount: responses.length > 0 ? responses.length : measurements.length,
        responseRate: 100
      },
      granularData: {
        products: productMetrics
      }
    });
  } catch (err) {
    console.error("Fel vid samling av nyckeltal för synk:", err);
    return false;
  }
}


