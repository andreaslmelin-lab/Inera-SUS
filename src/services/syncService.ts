// src/services/syncService.ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getSusGrade } from '../lib/utils';

const INERA_ADMIN_SYNC_URL = "https://ais-dev-lvmun5ushirn36utur7hyn-168492443119.europe-west1.run.app/api/sync-metrics";
const API_TOKEN = "inera_ux_token_9e48bcf0";

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
    const response = await fetch(INERA_ADMIN_SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": API_TOKEN,
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

    let totalScore = 0;
    let totalCount = 0;

    const productMetrics = products.map(product => {
      const prodMeasurements = measurements.filter(m => m.productId === product.id);
      let pTotalScore = 0;
      let pCount = 0;
      prodMeasurements.forEach(m => {
        if (m.averageScore) {
          pTotalScore += m.averageScore * m.responseCount;
          pCount += m.responseCount;
        }
      });
      const pScore = pCount > 0 ? Math.round(pTotalScore / pCount) : 0;
      if (pCount > 0) {
        totalScore += pTotalScore;
        totalCount += pCount;
      }
      return {
        name: product.name,
        score: pScore,
        responses: pCount
      };
    });

    const overallScore = totalCount > 0 ? Math.round(totalScore / totalCount) : 0;

    const services = products.map(product => {
      const pMetrics = productMetrics.find(p => p.name === product.name);
      return {
        serviceId: product.id,
        serviceName: product.name,
        susScore: pMetrics?.score || 0,
        responsesCount: pMetrics?.responses || 0,
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
        productsCount: products.length,
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

