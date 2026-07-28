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
    // In a production environment, this endpoint would use the Firebase Admin SDK
    // to bypass security rules and query the 'products', 'measurements', and 'responses'
    // collections directly, just like the client does in RawDataView.
    // For now, we return a mock structure matching the Big Data Contract.
    
    try {
      const payload = {
        "$schema": "https://inera-admin.se/schemas/ux-bigdata-v1.json",
        "source": "inera-sus",
        "timestamp": new Date().toISOString(),
        "organization": "Inera AB",
        "metrics": {
          "score": 76,
          "grade": "B",
          "evaluationsCount": 1396,
          "responseRate": 100,
          "productsCount": 2,
          "products": [
            { "name": "1177", "score": 78, "responses": 1209 },
            { "name": "Vårdpersonaltjänster", "score": 74, "responses": 187 }
          ]
        },
        "granularData": {
          "individuals": [],
          "teams": [],
          "services": [
            {
              "serviceId": "s_1177_portal",
              "serviceName": "1177.se Invånartjänster",
              "susScore": 78,
              "responsesCount": 1209,
              "wcagPassRate": 92,
              "criticalWcagErrors": 0
            },
            {
              "serviceId": "s_vardpersonal",
              "serviceName": "Vårdpersonaltjänster",
              "susScore": 74,
              "responsesCount": 187,
              "wcagPassRate": 85,
              "criticalWcagErrors": 1
            }
          ],
          "events": [
            {
              "eventId": "evt_10029",
              "timestamp": new Date().toISOString(),
              "eventType": "SUS_SURVEY_COMPLETED",
              "targetServiceId": "s_1177_portal",
              "scoreGiven": 85
            }
          ]
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
