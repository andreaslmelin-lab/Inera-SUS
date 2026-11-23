import "dotenv/config";
import express from "express";
import {
  handleSmtpStatus,
  handleSmtpLogs,
  handleSmtpTest,
  handleSendInvitation,
  handlePasswordReset,
  handleAdminChangePassword,
  handleSyncMetrics,
} from "../api/_lib/apiHandlers.js";

export function createApiApp(): express.Express {
  const apiApp = express();

  apiApp.use((req, _res, next) => {
    if (req.body !== undefined) {
      if (typeof req.body === "string" && req.headers["content-type"]?.includes("application/json")) {
        try {
          req.body = JSON.parse(req.body);
        } catch {}
      }
      (req as any)._body = true;
    }
    next();
  });

  apiApp.use(express.json({ limit: "50mb" }));
  apiApp.use(express.urlencoded({ limit: "50mb", extended: true }));

  apiApp.get("/api/admin/smtp/status", (req, res) => void handleSmtpStatus(req, res));
  apiApp.get("/api/admin/smtp/logs", (req, res) => void handleSmtpLogs(req, res));
  apiApp.post("/api/admin/smtp/test", (req, res) => void handleSmtpTest(req, res));
  apiApp.post("/api/admin/email/send-invitation", (req, res) => void handleSendInvitation(req, res));
  apiApp.post("/api/auth/password-reset", (req, res) => void handlePasswordReset(req, res));
  apiApp.post("/api/admin/change-password", (req, res) => void handleAdminChangePassword(req, res));
  apiApp.post("/api/sync-metrics", (req, res) => void handleSyncMetrics(req, res));

  return apiApp;
}

const sharedApiApp = createApiApp();
export default sharedApiApp;
