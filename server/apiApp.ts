import "dotenv/config";
import express from "express";
import { initializeApp, getApps, getApp, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import metadataJson from "../metadata.json";
import {
  sendEmail,
  getSmtpConfigSummary,
  getRecentEmailLogs,
  getLastDiagnosticsResult,
  runSmtpDiagnostics,
  checkTestEmailRateLimit,
  isValidSingleEmail,
  buildInvitationEmail,
  buildPasswordResetEmail,
} from "./emailService";

const ADMIN_EMAILS = [
  "andreas.melin@inera.se",
  "andreas.melin@inera",
  "andreas.l.melin@gmail.com",
];

const appName = metadataJson?.name ? String(metadataJson.name) : "Inera SUS Tracker";

// Initialize firebase-admin robustly (guard against duplicate init across serverless invocations)
let adminApp: App | null = null;
try {
  adminApp = getApps().length
    ? getApp()
    : initializeApp(
        firebaseConfig?.projectId
          ? { projectId: firebaseConfig.projectId }
          : undefined
      );
} catch (err) {
  console.warn("Could not fully initialize firebase-admin:", err);
}

function getAdminFirestore() {
  if (!adminApp) return null;
  const dbId = firebaseConfig?.firestoreDatabaseId;
  if (dbId && dbId !== "(default)") {
    return getFirestore(adminApp, dbId);
  }
  return getFirestore(adminApp);
}

type AdminAuthResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; status: number; error: string };

async function verifyAdminRequest(req: express.Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Oauktoriserad. Logga in igen." };
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await getAuth(adminApp || undefined).verifyIdToken(token);
    const email = (decodedToken.email || "").toLowerCase().trim();
    if (!email || decodedToken.email_verified === false) {
      return { ok: false, status: 403, error: "Åtkomst nekad. Verifierad e-postadress krävs." };
    }
    if (ADMIN_EMAILS.includes(email)) {
      return { ok: true, uid: decodedToken.uid, email };
    }

    // Check Firestore role if Admin SDK has IAM access
    try {
      const db = getAdminFirestore();
      if (db) {
        const callerDoc = await db.collection("users").doc(decodedToken.uid).get();
        const callerData = callerDoc.data();
        if (callerData?.role === "admin" && !callerData?.isBlocked) {
          return { ok: true, uid: decodedToken.uid, email };
        }
      }
    } catch {
      // Starter Tier or external serverless environments without IAM cannot query Firestore via Admin SDK
    }

    return { ok: false, status: 403, error: "Åtkomst nekad. Endast behöriga administratörer har tillgång." };
  } catch {
    return { ok: false, status: 401, error: "Ogiltig eller utgången session. Logga in igen." };
  }
}

function isAdminSdkCredentialOrIamError(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code.includes("invalid-credential") ||
    code.includes("insufficient-permission") ||
    code.includes("permission-denied") ||
    msg.includes("permission_denied") ||
    msg.includes("permission denied") ||
    msg.includes("default credentials") ||
    msg.includes("insufficient permission") ||
    msg.includes("serviceusage") ||
    msg.includes("iam")
  );
}

// Simple rate limiter for public password-reset requests (max 3 per 5 min per email key)
const passwordResetRateLimit = new Map<string, number[]>();

export function createApiApp(): express.Express {
  const apiApp = express();

  // Compatibility guard for Vercel serverless runtime where req.body may already be pre-parsed
  apiApp.use((req, _res, next) => {
    if (req.body !== undefined) {
      if (typeof req.body === "string" && req.headers["content-type"]?.includes("application/json")) {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          // Let express.json handle malformed payloads
        }
      }
      (req as any)._body = true;
    }
    next();
  });

  apiApp.use(express.json({ limit: "50mb" }));
  apiApp.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Admin: Get SMTP configuration summary, last diagnostics, and sanitized dispatch logs
  apiApp.get("/api/admin/smtp/status", async (req, res) => {
    const authResult = await verifyAdminRequest(req);
    if ("error" in authResult) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const config = getSmtpConfigSummary();
    const lastTest = getLastDiagnosticsResult();
    const logs = getRecentEmailLogs();

    return res.json({
      config,
      lastTest,
      logs,
      appName,
    });
  });

  // Admin: Get sanitized email dispatch logs
  apiApp.get("/api/admin/smtp/logs", async (req, res) => {
    const authResult = await verifyAdminRequest(req);
    if ("error" in authResult) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    return res.json({
      logs: getRecentEmailLogs(),
    });
  });

  // Admin: Run SMTP verification and/or send single test email
  apiApp.post("/api/admin/smtp/test", async (req, res) => {
    const authResult = await verifyAdminRequest(req);
    if ("error" in authResult) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const mode = req.body?.mode === "send_test" ? "send_test" : "verify";
    const recipient = typeof req.body?.recipient === "string" ? req.body.recipient.trim() : "";

    if (mode === "send_test") {
      if (!isValidSingleEmail(recipient)) {
        return res.status(400).json({
          error: "Ogiltig mottagaradress. Ange en enskild giltig e-postadress.",
        });
      }

      const rateCheck = checkTestEmailRateLimit(authResult.uid);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: `Högst ett testutskick per minut per administratör är tillåtet. Försök igen om ${rateCheck.retryAfterSeconds} sekunder.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        });
      }
    }

    try {
      const diagnostics = await runSmtpDiagnostics({
        mode,
        testRecipient: recipient,
        appName,
        adminIdentifier: authResult.email,
      });

      return res.status(200).json({
        config: getSmtpConfigSummary(),
        diagnostics,
        logs: getRecentEmailLogs(),
      });
    } catch {
      console.error("[SMTP] Diagnostic execution error");
      return res.status(500).json({
        error: "Ett oväntat fel uppstod vid SMTP-testet.",
      });
    }
  });

  // Admin: Send user invitation email via central SMTP service
  apiApp.post("/api/admin/email/send-invitation", async (req, res) => {
    const authResult = await verifyAdminRequest(req);
    if ("error" in authResult) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim().slice(0, 120) : "";
    const inviteCode = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.trim().slice(0, 64) : "";
    const role = typeof req.body?.role === "string" ? req.body.role : "viewer";
    const registrationUrl = typeof req.body?.registrationUrl === "string" ? req.body.registrationUrl.trim() : "";

    if (!isValidSingleEmail(to)) {
      return res.status(400).json({ error: "Ogiltig e-postadress för mottagaren." });
    }
    if (!inviteCode) {
      return res.status(400).json({ error: "Inbjudningskod saknas." });
    }

    let safeUrl = registrationUrl;
    try {
      const parsedUrl = new URL(registrationUrl);
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        return res.status(400).json({ error: "Ogiltig registreringslänk." });
      }
      safeUrl = parsedUrl.toString();
    } catch {
      return res.status(400).json({ error: "Ogiltig registreringslänk." });
    }

    const roleLabel =
      role === "admin" ? "Administratör" : role === "editor" ? "Redaktör" : "Läsbehörig";

    const emailPayload = buildInvitationEmail({
      appName,
      recipientName: recipientName || undefined,
      inviteCode,
      roleLabel,
      registrationUrl: safeUrl,
    });

    const result = await sendEmail(to, emailPayload.subject, emailPayload.html, emailPayload.text, {
      messageType: "user_invitation",
      initiatedBy: `AdminView:Bjud in användare (${authResult.email})`,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.errorMessage || "Kunde inte skicka inbjudningsmejlet.",
        errorCode: result.errorCode,
      });
    }

    return res.json({
      success: true,
      smtpResponse: result.smtpResponse,
    });
  });

  // Password Reset Route: uses Admin SDK + central Gmail SMTP if available;
  // safely signals Firebase client fallback if Admin SDK IAM is unavailable or SMTP isn't configured.
  apiApp.post("/api/auth/password-reset", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!isValidSingleEmail(email)) {
      return res.status(400).json({ error: "Ange en giltig e-postadress." });
    }

    const lowerEmail = email.toLowerCase();
    const now = Date.now();
    const recent = (passwordResetRateLimit.get(lowerEmail) || []).filter((ts) => now - ts < 5 * 60_000);
    if (recent.length >= 3) {
      return res.status(429).json({
        error: "För många återställningsförsök. Vänta några minuter innan du försöker igen.",
      });
    }
    recent.push(now);
    passwordResetRateLimit.set(lowerEmail, recent);

    const smtpConfig = getSmtpConfigSummary();
    if (!smtpConfig.configured) {
      return res.status(200).json({
        handledBy: "firebase_client_required",
        reason: "smtp_not_configured",
        missingVars: smtpConfig.missingVars,
      });
    }

    try {
      const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : "";
      const continueUrl = process.env.APP_URL || originHeader || "https://inera-sus.vercel.app";
      const resetLink = await getAuth(adminApp || undefined).generatePasswordResetLink(lowerEmail, {
        url: continueUrl,
      });

      const mail = buildPasswordResetEmail({
        appName,
        resetLink,
      });

      const sendRes = await sendEmail(lowerEmail, mail.subject, mail.html, mail.text, {
        messageType: "password_reset",
        initiatedBy: "Auth:PasswordReset",
      });

      if (!sendRes.success) {
        return res.status(200).json({
          handledBy: "firebase_client_required",
          reason: sendRes.errorCode || "smtp_send_failed",
        });
      }

      return res.status(200).json({
        handledBy: "smtp",
        success: true,
      });
    } catch (err: any) {
      const code = String(err?.code || "");
      // Never leak whether user exists on public password reset
      if (code === "auth/user-not-found") {
        return res.status(200).json({
          handledBy: "smtp",
          success: true,
        });
      }
      // If Admin SDK lacks IAM (e.g., Starter Tier or external hosting), fall back safely to Firebase Auth client SDK
      return res.status(200).json({
        handledBy: "firebase_client_required",
        reason: "admin_sdk_unavailable",
      });
    }
  });

  // Admin Change Password Route
  apiApp.post("/api/admin/change-password", async (req, res) => {
    try {
      const authResult = await verifyAdminRequest(req);
      if ("error" in authResult) {
        return res.status(authResult.status).json({ error: authResult.error });
      }

      const { uid, newPassword, forceChangeOnLogin } = req.body || {};
      if (!uid || !newPassword || typeof uid !== "string") {
        return res.status(400).json({ error: "Användar-ID och nytt lösenord saknas." });
      }

      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({ error: "Lösenordet måste vara minst 6 tecken." });
      }

      try {
        await getAuth(adminApp || undefined).updateUser(uid, {
          password: newPassword,
        });
      } catch (authErr: any) {
        if (isAdminSdkCredentialOrIamError(authErr)) {
          return res.status(400).json({
            error:
              'Direkt lösenordsbyte via servern stöds inte i denna miljö eftersom Firebase Admin SDK saknar IAM-behörighet (roles/firebaseauth.admin). Använd istället "Skicka länk för lösenordsåterställning per e-post".',
            code: "ADMIN_SDK_UNAVAILABLE",
          });
        }
        return res.status(400).json({
          error: authErr?.message || "Kunde inte uppdatera lösenordet i Firebase Auth.",
        });
      }

      let firestoreSynced = false;
      try {
        const db = getAdminFirestore();
        if (db) {
          await db.collection("users").doc(uid).update({
            mustChangePassword: forceChangeOnLogin === undefined ? true : forceChangeOnLogin,
            passwordChangedByAdminAt: FieldValue.serverTimestamp(),
          });
          firestoreSynced = true;
        }
      } catch {
        // Non-fatal if Firestore Admin SDK lacks IAM; client can sync Firestore flag
      }

      return res.json({ success: true, firestoreSynced });
    } catch (err: any) {
      console.error("Error changing password:", err);
      return res.status(500).json({ error: err?.message || "Misslyckades att uppdatera lösenordet." });
    }
  });

  const DEFAULT_INERA_TOKEN = process.env.INERA_SYNC_TOKEN || "inera_ux_token_11am0nao";
  const DEFAULT_INERA_ENDPOINT = "https://inera-ux-dashboard.vercel.app/api/sync-metrics";

  // Proxy API route to avoid CORS and secure tokens server-side
  apiApp.post("/api/sync-metrics", async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const payload = req.body;
      const rawToken = ((req.headers["x-api-token"] as string) || (req.headers["X-API-Token"] as string) || "").trim();
      const apiToken = rawToken && rawToken !== "undefined" && rawToken !== "null" ? rawToken : DEFAULT_INERA_TOKEN;
      const rawEndpoint = ((req.headers["x-sync-endpoint"] as string) || (req.headers["X-Sync-Endpoint"] as string) || "").trim();
      const externalUrl = rawEndpoint && rawEndpoint !== "undefined" && rawEndpoint !== "null" ? rawEndpoint : DEFAULT_INERA_ENDPOINT;

      let upstreamResponse = await fetch(externalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Token": apiToken,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (upstreamResponse.status === 401 && apiToken !== DEFAULT_INERA_TOKEN) {
        upstreamResponse = await fetch(externalUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Token": DEFAULT_INERA_TOKEN,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      const responseText = await upstreamResponse.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }

      if (!upstreamResponse.ok) {
        return res.status(200).json({
          success: false,
          error: responseData.error || responseData.message || `Upstream service response: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
          details: responseData,
        });
      }

      return res.status(200).json(responseData);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        return res.status(200).json({ success: false, error: "Sync request timed out (upstream was too slow)" });
      }
      console.error("Error proxying sync-metrics request:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });

  return apiApp;
}

const sharedApiApp = createApiApp();
export default sharedApiApp;
