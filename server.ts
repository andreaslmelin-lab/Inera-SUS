import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const expressApp = express();
  const PORT = 3000;

  expressApp.use(express.json());

  // Proxy API route to avoid CORS and secure tokens server-side
  expressApp.post("/api/sync-metrics", async (req, res) => {
    try {
      const payload = req.body;
      const apiToken = "inera_ux_token_9e48bcf0"; // Kept secure on the server
      
      const externalUrl = "https://ais-dev-lvmun5ushirn36utur7hyn-168492443119.europe-west1.run.app/api/sync-metrics";

      const upstreamResponse = await fetch(externalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": apiToken,
        },
        body: JSON.stringify(payload),
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        console.error("Upstream dashboard sync failed:", upstreamResponse.statusText, errorText);
        return res.status(upstreamResponse.status).json({
          success: false,
          error: upstreamResponse.statusText,
          details: errorText
        });
      }

      const responseData = await upstreamResponse.json();
      return res.status(200).json(responseData);
    } catch (err: any) {
      console.error("Error proxying sync-metrics request:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
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

