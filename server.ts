import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createServer as createViteServer } from "vite";

// Initialize firebase-admin robustly
try {
  initializeApp();
} catch (e) {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      initializeApp({
        projectId: config.projectId,
      });
    }
  } catch (err) {
    console.warn("Could not fully initialize firebase-admin:", err);
  }
}

async function startServer() {
  const expressApp = express();
  const PORT = 3000;

  expressApp.use(express.json({ limit: "50mb" }));
  expressApp.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Admin Change Password Route
  expressApp.post("/api/admin/change-password", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Oauktoriserad. Logga in igen." });
      }
      const token = authHeader.split(" ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const callerUid = decodedToken.uid;
      
      // Verify caller is admin
      const callerDoc = await getFirestore().collection("users").doc(callerUid).get();
      const callerData = callerDoc.data();
      const callerEmail = callerData?.email?.toLowerCase();
      
      const ADMIN_EMAILS = ['andreas.melin@inera.se', 'andreas.melin@inera', 'andreas.l.melin@gmail.com'];
      if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
        return res.status(403).json({ error: "Åtkomst nekad. Endast administratörer kan ändra lösenord." });
      }
      
      const { uid, newPassword, forceChangeOnLogin } = req.body;
      if (!uid || !newPassword) {
        return res.status(400).json({ error: "Användar-ID och nytt lösenord saknas." });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Lösenordet måste vara minst 6 tecken." });
      }
      
      // Update password in Auth
      await getAuth().updateUser(uid, {
        password: newPassword
      });
      
      // Update mustChangePassword in Firestore
      await getFirestore().collection("users").doc(uid).update({
        mustChangePassword: forceChangeOnLogin === undefined ? true : forceChangeOnLogin,
        passwordChangedByAdminAt: FieldValue.serverTimestamp()
      });
      
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error changing password:", err);
      return res.status(500).json({ error: err.message || "Misslyckades att uppdatera lösenordet." });
    }
  });

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

