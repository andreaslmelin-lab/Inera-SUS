import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const expressApp = express();
  const PORT = 3000;

  expressApp.use(express.json());

  expressApp.get("/api/export-data", async (req, res) => {
    try {
      const { getDocs, collection } = await import('firebase/firestore');
      
      const getSusGrade = (score: number) => {
        if (score >= 80.3) return 'A';
        if (score >= 74) return 'B';
        if (score >= 68) return 'C';
        if (score >= 51) return 'D';
        return 'F';
      };

      const productsSnap = await getDocs(collection(db, 'products'));
      const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const measurementsSnap = await getDocs(collection(db, 'measurements'));
      const measurements = measurementsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const responsesSnap = await getDocs(collection(db, 'responses'));
      const responses = responsesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      let totalScore = 0;
      let totalCount = 0;

      const productMetrics = products.map((product: any) => {
        const prodMeasurements = measurements.filter((m: any) => m.productId === product.id);
        
        let pTotalScore = 0;
        let pCount = 0;
        prodMeasurements.forEach((m: any) => {
           if (m.averageScore) {
             pTotalScore += m.averageScore * m.responseCount;
             pCount += m.responseCount;
           }
        });
        const pScore = pCount > 0 ? Math.round(pTotalScore / pCount) : 0;
        
        if(pCount > 0) {
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
      
      const services = products.map((product: any) => {
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

      const events = responses.map((r: any) => {
         return {
           eventId: r.id,
           timestamp: r.submitDate ? (r.submitDate as any).toDate().toISOString() : new Date().toISOString(),
           eventType: "SUS_SURVEY_COMPLETED",
           targetServiceId: r.productId,
           scoreGiven: r.susScore
         };
      });

      const payload = {
        "$schema": "https://inera-admin.se/schemas/ux-bigdata-v1.json",
        "source": "inera-sus",
        "timestamp": new Date().toISOString(),
        "organization": "Inera AB",
        "metrics": {
          "score": overallScore,
          "grade": overallScore > 0 ? getSusGrade(overallScore) : "N/A",
          "evaluationsCount": measurements.length,
          "responseRate": 100,
          "productsCount": products.length,
          "products": productMetrics
        },
        "granularData": {
          "individuals": [],
          "teams": [],
          "services": services,
          "events": events
        }
      };

      res.json(payload);
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    expressApp.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    expressApp.use(express.static(distPath));
    expressApp.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  expressApp.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
