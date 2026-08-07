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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const payload = req.body;
      const apiToken = (req.headers['x-api-token'] as string) || (req.headers['X-API-Token'] as string) || "inera_ux_token_11am0nao";
      const externalUrl = (req.headers['x-sync-endpoint'] as string) || (req.headers['X-Sync-Endpoint'] as string) || "https://inera-ux-dashboard.vercel.app/api/sync-metrics";

      console.log(`Attempting sync to upstream URL: ${externalUrl}...`);

      const upstreamResponse = await fetch(externalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": apiToken
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await upstreamResponse.text();
      console.log("Upstream response status:", upstreamResponse.status);

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
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error("Sync request timed out");
        return res.status(200).json({ success: false, error: "Sync request timed out (upstream was too slow)" });
      }
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

