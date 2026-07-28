import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/sync-metrics", async (req, res) => {
    const token = req.headers['x-api-token'];
    if (token !== 'inera_ux_token_9e48bcf0') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const { source, timestamp, organization, metrics, granularData } = req.body;
        
        await addDoc(collection(db, 'raw_data_exports'), {
            source,
            timestamp,
            organization,
            metrics,
            granularData
        });
        
        console.log("Received and persisted API Sync:", req.body);
        res.json({ status: "success" });
    } catch (error) {
        console.error("Error persisting data:", error);
        res.status(500).json({ error: 'Failed to persist data' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
