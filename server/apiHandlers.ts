import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { initializeApp, getApps, getApp, applicationDefault, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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
} from "./emailService.js";

const ADMIN_EMAILS = [
  "andreas.melin@inera.se",
  "andreas.melin@inera",
  "andreas.l.melin@gmail.com",
];

function readJsonFileSafe<T>(filename: string, fallback: T): T {
  try {
    const filePath = path.join(process.cwd(), filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    }
  } catch {
    // Ignore read errors and use fallback
  }
  return fallback;
}

const firebaseConfig = readJsonFileSafe<{ projectId?: string; firestoreDatabaseId?: string }>(
  "firebase-applet-config.json",
  {
    projectId: "gen-lang-client-0974410969",
    firestoreDatabaseId: "ai-studio-2fdc0386-724a-477b-94ec-ca286f848bb2",
  }
);

const metadataJson = readJsonFileSafe<{ name?: string }>("metadata.json", {
  name: "Inera SUS Tracker",
});

const appName = metadataJson?.name ? String(metadataJson.name) : "Inera SUS Tracker";

function getAdminApp(): App | null {
  try {
    return getApps().length
      ? getApp()
      : initializeApp(
          firebaseConfig?.projectId
            ? { projectId: firebaseConfig.projectId }
            : undefined
        );
  } catch (err) {
    console.warn("Could not initialize firebase-admin:", err);
    return null;
  }
}

function getAdminFirestore() {
  const adminApp = getAdminApp();
  if (!adminApp) return null;
  const dbId = firebaseConfig?.firestoreDatabaseId;
  if (dbId && dbId !== "(default)") {
    return getFirestore(adminApp, dbId);
  }
  return getFirestore(adminApp);
}

export type ApiRequest = IncomingMessage & {
  body?: any;
  headers: Record<string, string | string[] | undefined>;
  method?: string;
};

export type ApiResponse = ServerResponse;

export function sendJson(res: ApiResponse, statusCode: number, payload: unknown) {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: ApiRequest): Promise<any> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString("utf8"));
      } catch {
        return {};
      }
    }
    return req.body;
  }

  if ((req as any).readableEnded) return {};

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const timeout = setTimeout(() => resolve({}), 5000);
    req.on("data", (chunk: any) => {
      total += chunk.length || 0;
      if (total <= 50 * 1024 * 1024) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    });
    req.on("end", () => {
      clearTimeout(timeout);
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => {
      clearTimeout(timeout);
      resolve({});
    });
  });
}

function getHeader(req: ApiRequest, name: string): string {
  const val = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(val)) return val[0] || "";
  return typeof val === "string" ? val : "";
}

type AdminAuthResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; status: number; error: string };

async function verifyAdminRequest(req: ApiRequest): Promise<AdminAuthResult> {
  const authHeader = getHeader(req, "authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Oauktoriserad. Logga in igen." };
  }
  const token = authHeader.split(" ")[1];
  try {
    const adminApp = getAdminApp();
    const decodedToken = await getAuth(adminApp || undefined).verifyIdToken(token);
    const email = (decodedToken.email || "").toLowerCase().trim();
    if (!email || decodedToken.email_verified === false) {
      return { ok: false, status: 403, error: "Åtkomst nekad. Verifierad e-postadress krävs." };
    }
    if (ADMIN_EMAILS.includes(email)) {
      return { ok: true, uid: decodedToken.uid, email };
    }

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
    msg.includes("user_project_denied") ||
    msg.includes("default credentials") ||
    msg.includes("insufficient permission") ||
    msg.includes("serviceusage") ||
    msg.includes("iam")
  );
}

function isQuotaProjectFallbackError(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return code === "auth/internal-error" && msg.includes("identitytoolkit.googleapis.com");
}

async function generatePasswordResetLinkSafe(email: string, continueUrl: string): Promise<string> {
  const adminApp = getAdminApp();
  try {
    return await getAuth(adminApp || undefined).generatePasswordResetLink(email, {
      url: continueUrl,
    });
  } catch (err: any) {
    if (!isQuotaProjectFallbackError(err) || !firebaseConfig?.projectId) {
      throw err;
    }

    const tokenObj = await applicationDefault().getAccessToken();
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/accounts:sendOobCode`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenObj.access_token}`,
          "Content-Type": "application/json",
          "x-goog-user-project": firebaseConfig.projectId,
        },
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          email,
          continueUrl,
          returnOobLink: true,
        }),
      }
    );

    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data?.oobLink) {
      return String(data.oobLink);
    }

    const apiMsg = String(data?.error?.message || "");
    if (apiMsg.includes("EMAIL_NOT_FOUND")) {
      const notFoundErr: any = new Error("User not found");
      notFoundErr.code = "auth/user-not-found";
      throw notFoundErr;
    }

    const apiErr: any = new Error(apiMsg || "Identity Toolkit API error");
    apiErr.code = res.status === 403 ? "auth/insufficient-permission" : "auth/internal-error";
    throw apiErr;
  }
}

async function updateUserPasswordSafe(uid: string, newPassword: string): Promise<void> {
  const adminApp = getAdminApp();
  try {
    await getAuth(adminApp || undefined).updateUser(uid, {
      password: newPassword,
    });
  } catch (err: any) {
    if (!isQuotaProjectFallbackError(err) || !firebaseConfig?.projectId) {
      throw err;
    }

    const tokenObj = await applicationDefault().getAccessToken();
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/accounts:update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenObj.access_token}`,
          "Content-Type": "application/json",
          "x-goog-user-project": firebaseConfig.projectId,
        },
        body: JSON.stringify({
          localId: uid,
          password: newPassword,
        }),
      }
    );

    const data: any = await res.json().catch(() => ({}));
    if (res.ok) {
      return;
    }

    const apiMsg = String(data?.error?.message || "");
    const apiErr: any = new Error(apiMsg || "Kunde inte uppdatera lösenordet i Firebase Auth.");
    apiErr.code = res.status === 403 ? "auth/insufficient-permission" : "auth/internal-error";
    throw apiErr;
  }
}

const passwordResetRateLimit = new Map<string, number[]>();

export async function handleSmtpStatus(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  const authResult = await verifyAdminRequest(req);
  if ("error" in authResult) {
    return sendJson(res, authResult.status, { error: authResult.error });
  }
  return sendJson(res, 200, {
    config: getSmtpConfigSummary(),
    lastTest: getLastDiagnosticsResult(),
    logs: getRecentEmailLogs(),
    appName,
  });
}

export async function handleSmtpLogs(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  const authResult = await verifyAdminRequest(req);
  if ("error" in authResult) {
    return sendJson(res, authResult.status, { error: authResult.error });
  }
  return sendJson(res, 200, {
    logs: getRecentEmailLogs(),
  });
}

export async function handleSmtpTest(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "POST") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  const authResult = await verifyAdminRequest(req);
  if ("error" in authResult) {
    return sendJson(res, authResult.status, { error: authResult.error });
  }

  const body = await readJsonBody(req);
  const mode = body?.mode === "send_test" ? "send_test" : "verify";
  const recipient = typeof body?.recipient === "string" ? body.recipient.trim() : "";

  if (mode === "send_test") {
    if (!isValidSingleEmail(recipient)) {
      return sendJson(res, 400, {
        error: "Ogiltig mottagaradress. Ange en enskild giltig e-postadress.",
      });
    }

    const rateCheck = checkTestEmailRateLimit(authResult.uid);
    if (!rateCheck.allowed) {
      return sendJson(res, 429, {
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

    return sendJson(res, 200, {
      config: getSmtpConfigSummary(),
      diagnostics,
      logs: getRecentEmailLogs(),
    });
  } catch {
    console.error("[SMTP] Diagnostic execution error");
    return sendJson(res, 500, {
      error: "Ett oväntat fel uppstod vid SMTP-testet.",
    });
  }
}

export async function handleSendInvitation(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "POST") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  const authResult = await verifyAdminRequest(req);
  if ("error" in authResult) {
    return sendJson(res, authResult.status, { error: authResult.error });
  }

  const body = await readJsonBody(req);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const recipientName = typeof body?.recipientName === "string" ? body.recipientName.trim().slice(0, 120) : "";
  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim().slice(0, 64) : "";
  const role = typeof body?.role === "string" ? body.role : "viewer";
  const registrationUrl = typeof body?.registrationUrl === "string" ? body.registrationUrl.trim() : "";

  if (!isValidSingleEmail(to)) {
    return sendJson(res, 400, { error: "Ogiltig e-postadress för mottagaren." });
  }
  if (!inviteCode) {
    return sendJson(res, 400, { error: "Inbjudningskod saknas." });
  }

  let safeUrl = registrationUrl;
  try {
    const parsedUrl = new URL(registrationUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return sendJson(res, 400, { error: "Ogiltig registreringslänk." });
    }
    safeUrl = parsedUrl.toString();
  } catch {
    return sendJson(res, 400, { error: "Ogiltig registreringslänk." });
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
    return sendJson(res, 400, {
      success: false,
      error: result.errorMessage || "Kunde inte skicka inbjudningsmejlet.",
      errorCode: result.errorCode,
    });
  }

  return sendJson(res, 200, {
    success: true,
    smtpResponse: result.smtpResponse,
  });
}

export async function handlePasswordReset(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "POST") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  const body = await readJsonBody(req);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!isValidSingleEmail(email)) {
    return sendJson(res, 400, { error: "Ange en giltig e-postadress." });
  }

  const lowerEmail = email.toLowerCase();
  const now = Date.now();
  const recent = (passwordResetRateLimit.get(lowerEmail) || []).filter((ts) => now - ts < 5 * 60_000);
  if (recent.length >= 3) {
    return sendJson(res, 429, {
      error: "För många återställningsförsök. Vänta några minuter innan du försöker igen.",
    });
  }
  recent.push(now);
  passwordResetRateLimit.set(lowerEmail, recent);

  const smtpConfig = getSmtpConfigSummary();
  if (!smtpConfig.configured) {
    return sendJson(res, 200, {
      handledBy: "firebase_client_required",
      reason: "smtp_not_configured",
      missingVars: smtpConfig.missingVars,
    });
  }

  try {
    const originHeader = getHeader(req, "origin");
    const continueUrl = process.env.APP_URL || originHeader || "https://inera-sus.vercel.app";
    const resetLink = await generatePasswordResetLinkSafe(lowerEmail, continueUrl);

    const mail = buildPasswordResetEmail({
      appName,
      resetLink,
    });

    const sendRes = await sendEmail(lowerEmail, mail.subject, mail.html, mail.text, {
      messageType: "password_reset",
      initiatedBy: "Auth:PasswordReset",
    });

    if (!sendRes.success) {
      return sendJson(res, 200, {
        handledBy: "firebase_client_required",
        reason: sendRes.errorCode || "smtp_send_failed",
      });
    }

    return sendJson(res, 200, {
      handledBy: "smtp",
      success: true,
    });
  } catch (err: any) {
    const code = String(err?.code || "");
    if (code === "auth/user-not-found") {
      return sendJson(res, 200, {
        handledBy: "smtp",
        success: true,
      });
    }
    return sendJson(res, 200, {
      handledBy: "firebase_client_required",
      reason: "admin_sdk_unavailable",
    });
  }
}

export async function handleAdminChangePassword(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "POST") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  try {
    const authResult = await verifyAdminRequest(req);
    if ("error" in authResult) {
      return sendJson(res, authResult.status, { error: authResult.error });
    }

    const body = await readJsonBody(req);
    const { uid, newPassword, forceChangeOnLogin } = body || {};
    if (!uid || !newPassword || typeof uid !== "string") {
      return sendJson(res, 400, { error: "Användar-ID och nytt lösenord saknas." });
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return sendJson(res, 400, { error: "Lösenordet måste vara minst 6 tecken." });
    }

    try {
      await updateUserPasswordSafe(uid, newPassword);
    } catch (authErr: any) {
      if (isAdminSdkCredentialOrIamError(authErr)) {
        return sendJson(res, 400, {
          error:
            'Direkt lösenordsbyte via servern saknar nödvändig IAM-behörighet (kontrollera att rollerna "Firebase Authentication Admin" och "Service Usage Consumer" finns på tjänstekontot). Använd annars "Skicka länk för lösenordsåterställning per e-post".',
          code: "ADMIN_SDK_UNAVAILABLE",
        });
      }
      return sendJson(res, 400, {
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
      // Non-fatal if Firestore Admin SDK lacks IAM; client syncs Firestore flag
    }

    return sendJson(res, 200, { success: true, firestoreSynced });
  } catch (err: any) {
    console.error("Error changing password:", err);
    return sendJson(res, 500, { error: err?.message || "Misslyckades att uppdatera lösenordet." });
  }
}

export async function handleSyncMetrics(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "POST") {
    return sendJson(res, 405, { error: "Metoden stöds inte." });
  }
  const DEFAULT_INERA_TOKEN = process.env.INERA_SYNC_TOKEN || "inera_ux_token_11am0nao";
  const DEFAULT_INERA_ENDPOINT = "https://inera-ux-dashboard.vercel.app/api/sync-metrics";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const payload = await readJsonBody(req);
    const rawToken = getHeader(req, "x-api-token").trim();
    const apiToken = rawToken && rawToken !== "undefined" && rawToken !== "null" ? rawToken : DEFAULT_INERA_TOKEN;
    const rawEndpoint = getHeader(req, "x-sync-endpoint").trim();
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
      return sendJson(res, 200, {
        success: false,
        error: responseData.error || responseData.message || `Upstream service response: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
        details: responseData,
      });
    }

    return sendJson(res, 200, responseData);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      return sendJson(res, 200, { success: false, error: "Sync request timed out (upstream was too slow)" });
    }
    console.error("Error proxying sync-metrics request:", err);
    return sendJson(res, 500, { success: false, error: err?.message || "Internal server error" });
  }
}
