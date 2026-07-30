// src/services/syncService.ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getSusGrade } from '../lib/utils';

export async function pushMetricsToAdminDashboard(payload: {
  source: "ux-mognad" | "inera-kunskap" | "inera-sus" | "tillg-nglighetsranking";
  metrics: Record<string, any>;
  granularData?: {
    individuals?: any[];
    teams?: any[];
    services?: any[];
    events?: any[];
  };
}) {
  try {
    const response = await fetch("/api/sync-metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: payload.source,
        timestamp: new Date().toISOString(),
        organization: "Inera AB",
        metrics: payload.metrics,
        granularData: payload.granularData || {}
      }),
    });

    if (!response.ok) {
      console.warn("Kunde inte synka till Inera Admin Dashboard:", response.statusText);
      return false;
    }

    const data = await response.json();
    console.log("Synkroniserad med Inera Admin Dashboard!", data);
    return true;
  } catch (error) {
    console.error("Fel vid synkronisering med Inera Admin Dashboard:", error);
    return false;
  }
}

export async function triggerSusMetricsSync() {
  try {
    const productsSnap = await getDocs(collection(db, 'products'));
    const products = productsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const measurementsSnap = await getDocs(collection(db, 'measurements'));
    const measurements = measurementsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const responsesSnap = await getDocs(collection(db, 'responses'));
    const responses = responsesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // Calculate total scores from all responses
    let totalScoreSum = 0;
    responses.forEach(r => {
      totalScoreSum += r.susScore;
    });
    const overallScore = responses.length > 0 ? Math.round(totalScoreSum / responses.length) : 0;

    // Group responses by variantName to get scores for each "Produkt" (formerly variant)
    const variantMetricsMap: Record<string, { totalScore: number; count: number }> = {};
    responses.forEach(r => {
      const name = r.variantName === 'Generell' || r.variantName === 'Other' || r.variantName === 'Övriga' ? 'Övriga' : r.variantName;
      if (!variantMetricsMap[name]) {
        variantMetricsMap[name] = { totalScore: 0, count: 0 };
      }
      variantMetricsMap[name].totalScore += r.susScore;
      variantMetricsMap[name].count++;
    });

    const productMetrics = Object.entries(variantMetricsMap).map(([name, data]) => ({
      name,
      score: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
      responses: data.count
    }));

    // Services (formerly products)
    const services = products.map(product => {
      const prodResponses = responses.filter(r => r.productId === product.id);
      const serviceTotalScore = prodResponses.reduce((sum, r) => sum + r.susScore, 0);
      const serviceCount = prodResponses.length;
      return {
        serviceId: product.id,
        serviceName: product.name,
        susScore: serviceCount > 0 ? Math.round(serviceTotalScore / serviceCount) : 0,
        responsesCount: serviceCount,
        wcagPassRate: null,
        criticalWcagErrors: null
      };
    });

    const events = responses.map(r => {
      return {
        eventId: r.id,
        timestamp: r.submitDate ? (r.submitDate.toDate ? r.submitDate.toDate().toISOString() : new Date(r.submitDate).toISOString()) : new Date().toISOString(),
        eventType: "SUS_SURVEY_COMPLETED",
        targetServiceId: r.productId,
        scoreGiven: r.susScore
      };
    });

    return await pushMetricsToAdminDashboard({
      source: "inera-sus",
      metrics: {
        score: overallScore,
        grade: getSusGrade(overallScore),
        evaluationsCount: measurements.length,
        responseRate: 100,
        productsCount: productMetrics.length,
        products: productMetrics
      },
      granularData: {
        services,
        events
      }
    });
  } catch (err) {
    console.error("Fel vid samling av nyckeltal för synk:", err);
    return false;
  }
}

