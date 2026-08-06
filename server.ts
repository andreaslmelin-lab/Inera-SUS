import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const expressApp = express();
  const PORT = 3000;

  expressApp.use(express.json({ limit: "50mb" }));
  expressApp.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Proxy API route to avoid CORS and secure tokens server-side
  expressApp.post("/api/sync-metrics", async (req, res) => {
    try {
      const payload = req.body;
      const apiToken = "inera_ux_token_11am0nao"; // Kept secure on the server
      
      const externalUrl = "https://inera-ux-dashboard.vercel.app/api/sync-metrics";

      const upstreamResponse = await fetch(externalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`,
          "x-api-token": apiToken,
          "X-API-TOKEN": apiToken,
        },
        body: JSON.stringify(payload),
      });

      console.log("Sync request payload:", JSON.stringify(payload));

      const responseText = await upstreamResponse.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }

      if (!upstreamResponse.ok) {
        console.error("Upstream dashboard sync failed:", upstreamResponse.status, upstreamResponse.statusText, responseText);
        return res.status(200).json({
          success: false,
          error: `Upstream service response: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
          details: responseData
        });
      }

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

