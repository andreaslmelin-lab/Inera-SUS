import nodemailer from "nodemailer";
import tls from "tls";

export type EmailMessageType =
  | "smtp_test"
  | "password_reset"
  | "user_invitation"
  | "notification"
  | "reminder"
  | "system";

export type CheckState = "OK" | "Fel" | "Ej testad";
export type TestMessageState = "Skickat" | "Fel" | "Ej testad";

export interface SmtpConfigSummary {
  configured: boolean;
  missingVars: string[];
  host: string;
  port: number;
  secure: boolean;
  encryptionLabel: string;
  userConfigured: boolean;
  userDisplay: string;
  fromValue: string;
  passwordConfigured: boolean;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  smtpResponse?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export interface EmailDispatchLog {
  id: string;
  timestamp: string;
  messageType: EmailMessageType;
  deliveryStatus: "Accepterad av SMTP-server" | "Avvisad av SMTP-server" | "Fel";
  errorCode: string | null;
  errorMessage: string | null;
  initiatedBy: string;
  smtpResponse: string | null;
}

export interface SmtpDiagnosticsResult {
  overallStatus: "Fungerar" | "Fel" | "Ej testad";
  testedAt: string;
  mode: "verify" | "send_test";
  checks: {
    envVars: CheckState;
    connection: CheckState;
    tls: CheckState;
    auth: CheckState;
    testEmail: TestMessageState;
  };
  errorMessage: string | null;
  errorCode: string | null;
  smtpResponse: string | null;
  deliveryNote: string | null;
  missingVars: string[];
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_LOGS = 50;

// In-memory store for recent logs and rate limiting (no PII, no secrets)
const emailDispatchLogs: EmailDispatchLog[] = [];
const lastTestEmailByAdmin = new Map<string, number>();
let lastDiagnosticsResult: SmtpDiagnosticsResult | null = null;

function sanitizeSmtpString(raw?: string | null): string | null {
  if (!raw) return null;
  const pass = process.env.SMTP_PASS;
  let cleaned = String(raw).replace(/[\r\n]+/g, " ").trim();
  if (pass && pass.length > 0) {
    cleaned = cleaned.split(pass).join("[REDACTED]");
  }
  cleaned = cleaned.replace(/AUTH\s+(LOGIN|PLAIN)\s+[A-Za-z0-9+/=]+/gi, "AUTH $1 [REDACTED]");
  if (cleaned.length > 220) {
    cleaned = cleaned.slice(0, 220) + "...";
  }
  return cleaned || null;
}

export function isValidSingleEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return false;
  if (/[\r\n,;<>]/.test(trimmed)) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function extractAddressFromFromHeader(fromHeader: string): string | null {
  const trimmed = fromHeader.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  const bracketMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (bracketMatch ? bracketMatch[1] : trimmed).trim();
  return isValidSingleEmail(candidate) ? candidate : null;
}

function getSmtpEnv() {
  const host = (process.env.SMTP_HOST || "").trim();
  const portRaw = (process.env.SMTP_PORT || "").trim();
  const port = portRaw ? Number(portRaw) : 465;
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  const from = (process.env.SMTP_FROM || "").trim();
  const secureEnv = (process.env.SMTP_SECURE || "true").trim().toLowerCase();
  const secure = secureEnv !== "false";

  const missingVars: string[] = [];
  if (!host) missingVars.push("SMTP_HOST");
  if (!portRaw || Number.isNaN(port) || port <= 0 || port > 65535) missingVars.push("SMTP_PORT");
  if (!user) missingVars.push("SMTP_USER");
  if (!pass.trim()) missingVars.push("SMTP_PASS");
  if (!from) missingVars.push("SMTP_FROM");

  return {
    host,
    port,
    user,
    pass,
    from,
    secure,
    missingVars,
    isComplete: missingVars.length === 0,
  };
}

export function getSmtpConfigSummary(): SmtpConfigSummary {
  const env = getSmtpEnv();
  const maskedUser = env.user
    ? (() => {
        const atIdx = env.user.indexOf("@");
        if (atIdx <= 2) return "Konfigurerat SMTP-konto";
        return `${env.user.slice(0, 2)}***${env.user.slice(atIdx)}`;
      })()
    : "Saknas";

  return {
    configured: env.isComplete,
    missingVars: env.missingVars,
    host: env.host || "Saknas",
    port: Number.isNaN(env.port) ? 465 : env.port,
    secure: env.secure,
    encryptionLabel: env.secure ? "SSL/TLS" : "STARTTLS",
    userConfigured: Boolean(env.user),
    userDisplay: env.user ? `Konfigurerat SMTP-konto (${maskedUser})` : "Saknas",
    fromValue: env.from || "Saknas",
    passwordConfigured: Boolean(env.pass.trim()),
  };
}

export function getRecentEmailLogs(): EmailDispatchLog[] {
  return [...emailDispatchLogs];
}

export function getLastDiagnosticsResult(): SmtpDiagnosticsResult | null {
  return lastDiagnosticsResult;
}

function recordDispatchLog(entry: Omit<EmailDispatchLog, "id">) {
  emailDispatchLogs.unshift({
    id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...entry,
  });
  if (emailDispatchLogs.length > MAX_LOGS) {
    emailDispatchLogs.length = MAX_LOGS;
  }
}

function mapSmtpError(err: any): { errorCode: string; errorMessage: string; category: "connection" | "tls" | "auth" | "sender" | "send" } {
  const code = String(err?.code || "").toUpperCase();
  const responseCode = Number(err?.responseCode || 0);
  const rawMessage = String(err?.message || "").toLowerCase();
  const response = String(err?.response || "").toLowerCase();

  if (
    code.includes("CERT") ||
    code.includes("TLS") ||
    code.includes("SSL") ||
    rawMessage.includes("tls") ||
    rawMessage.includes("ssl") ||
    rawMessage.includes("certificate")
  ) {
    return {
      errorCode: code || "TLS_ERROR",
      errorMessage: "TLS-krypteringen kunde inte verifieras mot SMTP-servern.",
      category: "tls",
    };
  }

  if (
    code === "EAUTH" ||
    responseCode === 535 ||
    responseCode === 534 ||
    responseCode === 530 ||
    rawMessage.includes("username and password not accepted") ||
    rawMessage.includes("invalid login") ||
    response.includes("username and password not accepted")
  ) {
    return {
      errorCode: responseCode ? `SMTP_${responseCode}` : "EAUTH",
      errorMessage: "Autentiseringen misslyckades.",
      category: "auth",
    };
  }

  if (
    err?.command === "MAIL FROM" ||
    rawMessage.includes("mail from") ||
    rawMessage.includes("sender address") ||
    response.includes("sender")
  ) {
    return {
      errorCode: responseCode ? `SMTP_${responseCode}` : "SENDER_REJECTED",
      errorMessage: "Avsändaradressen accepterades inte.",
      category: "sender",
    };
  }

  if (
    code === "ECONNECTION" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "ESOCKET" ||
    rawMessage.includes("timeout") ||
    rawMessage.includes("econnrefused") ||
    rawMessage.includes("enotfound")
  ) {
    return {
      errorCode: code || "CONNECTION_FAILED",
      errorMessage: "SMTP-servern kan inte nås.",
      category: "connection",
    };
  }

  return {
    errorCode: responseCode ? `SMTP_${responseCode}` : code || "SEND_FAILED",
    errorMessage: "E-postmeddelandet kunde inte skickas.",
    category: "send",
  };
}

function createSmtpTransport(env: ReturnType<typeof getSmtpEnv>) {
  return nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: {
      user: env.user,
      pass: env.pass,
    },
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function checkTcpAndTlsConnectivity(host: string, port: number, secure: boolean): Promise<{
  connectionOk: boolean;
  tlsOk: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  if (!secure) {
    return new Promise((resolve) => {
      import("net").then(({ default: net }) => {
        const socket = net.createConnection({ host, port, timeout: 8000 });
        socket.once("connect", () => {
          socket.destroy();
          resolve({ connectionOk: true, tlsOk: true });
        });
        socket.once("timeout", () => {
          socket.destroy();
          resolve({
            connectionOk: false,
            tlsOk: false,
            errorCode: "ETIMEDOUT",
            errorMessage: "SMTP-servern kan inte nås.",
          });
        });
        socket.once("error", (err: any) => {
          socket.destroy();
          const mapped = mapSmtpError(err);
          resolve({
            connectionOk: false,
            tlsOk: false,
            errorCode: mapped.errorCode,
            errorMessage: mapped.errorMessage,
          });
        });
      });
    });
  }

  return new Promise((resolve) => {
    let tcpConnected = false;
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        timeout: 8000,
      },
      () => {
        tcpConnected = true;
        const authorized = socket.authorized;
        socket.destroy();
        if (authorized) {
          resolve({ connectionOk: true, tlsOk: true });
        } else {
          resolve({
            connectionOk: true,
            tlsOk: false,
            errorCode: "TLS_UNAUTHORIZED",
            errorMessage: "TLS-krypteringen kunde inte verifieras mot SMTP-servern.",
          });
        }
      }
    );

    socket.once("connect", () => {
      tcpConnected = true;
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve({
        connectionOk: tcpConnected,
        tlsOk: false,
        errorCode: "ETIMEDOUT",
        errorMessage: "SMTP-servern kan inte nås.",
      });
    });

    socket.once("error", (err: any) => {
      socket.destroy();
      const mapped = mapSmtpError(err);
      resolve({
        connectionOk: mapped.category === "tls" ? true : tcpConnected,
        tlsOk: false,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      });
    });
  });
}

/**
 * Central email dispatch function.
 * All application emails should pass through this service.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  meta?: {
    messageType?: EmailMessageType;
    initiatedBy?: string;
    isTest?: boolean;
  }
): Promise<SendEmailResult> {
  const timestamp = new Date().toISOString();
  const messageType: EmailMessageType = meta?.messageType || "notification";
  const initiatedBy = meta?.initiatedBy || "Application";

  const env = getSmtpEnv();
  if (!env.isComplete) {
    const errorMessage = "SMTP-konfigurationen är ofullständig.";
    recordDispatchLog({
      timestamp,
      messageType,
      deliveryStatus: "Fel",
      errorCode: "CONFIG_INCOMPLETE",
      errorMessage,
      initiatedBy,
      smtpResponse: null,
    });
    return {
      success: false,
      errorCode: "CONFIG_INCOMPLETE",
      errorMessage,
      timestamp,
    };
  }

  if (!isValidSingleEmail(to)) {
    const errorMessage = "Ogiltig mottagaradress. Endast en giltig e-postadress tillåts.";
    recordDispatchLog({
      timestamp,
      messageType,
      deliveryStatus: "Fel",
      errorCode: "INVALID_RECIPIENT",
      errorMessage,
      initiatedBy,
      smtpResponse: null,
    });
    return {
      success: false,
      errorCode: "INVALID_RECIPIENT",
      errorMessage,
      timestamp,
    };
  }

  const fromEmail = extractAddressFromFromHeader(env.from);
  if (!fromEmail) {
    const errorMessage = "Avsändaradressen accepterades inte.";
    recordDispatchLog({
      timestamp,
      messageType,
      deliveryStatus: "Fel",
      errorCode: "INVALID_FROM",
      errorMessage,
      initiatedBy,
      smtpResponse: null,
    });
    return {
      success: false,
      errorCode: "INVALID_FROM",
      errorMessage,
      timestamp,
    };
  }

  if (env.host.toLowerCase().includes("gmail.com") && fromEmail.toLowerCase() !== env.user.toLowerCase()) {
    console.warn(`[SMTP] SMTP_FROM (${fromEmail}) differs from SMTP_USER; Gmail may rewrite or reject unverified aliases.`);
  }

  const cleanSubject = String(subject || "").replace(/[\r\n]+/g, " ").trim();
  if (!cleanSubject) {
    return {
      success: false,
      errorCode: "INVALID_SUBJECT",
      errorMessage: "Ämnesrad saknas.",
      timestamp,
    };
  }

  const transporter = createSmtpTransport(env);

  try {
    const info = await transporter.sendMail({
      from: env.from,
      to: to.trim(),
      subject: cleanSubject,
      text: text || "",
      html: html || undefined,
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted.map(String) : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected.map(String) : [];
    const smtpResponse = sanitizeSmtpString(info.response);

    if (rejected.length > 0 && accepted.length === 0) {
      const errorMessage = meta?.isTest
        ? "Testmeddelandet kunde inte skickas."
        : "E-postmeddelandet kunde inte skickas.";
      recordDispatchLog({
        timestamp,
        messageType,
        deliveryStatus: "Avvisad av SMTP-server",
        errorCode: "SMTP_REJECTED",
        errorMessage,
        initiatedBy,
        smtpResponse,
      });
      return {
        success: false,
        accepted,
        rejected,
        smtpResponse: smtpResponse || undefined,
        errorCode: "SMTP_REJECTED",
        errorMessage,
        timestamp,
      };
    }

    recordDispatchLog({
      timestamp,
      messageType,
      deliveryStatus: "Accepterad av SMTP-server",
      errorCode: null,
      errorMessage: null,
      initiatedBy,
      smtpResponse,
    });

    return {
      success: true,
      messageId: info.messageId,
      accepted,
      rejected,
      smtpResponse: smtpResponse || undefined,
      timestamp,
    };
  } catch (err: any) {
    const mapped = mapSmtpError(err);
    const smtpResponse = sanitizeSmtpString(err?.response || err?.message);
    const finalErrorMessage =
      meta?.isTest && mapped.category === "send"
        ? "Testmeddelandet kunde inte skickas."
        : mapped.errorMessage;

    console.error(`[SMTP] Dispatch failed (${messageType}, ${initiatedBy}): ${mapped.errorCode}`);

    recordDispatchLog({
      timestamp,
      messageType,
      deliveryStatus: "Fel",
      errorCode: mapped.errorCode,
      errorMessage: finalErrorMessage,
      initiatedBy,
      smtpResponse,
    });

    return {
      success: false,
      errorCode: mapped.errorCode,
      errorMessage: finalErrorMessage,
      smtpResponse: smtpResponse || undefined,
      timestamp,
    };
  } finally {
    transporter.close();
  }
}

export function checkTestEmailRateLimit(adminKey: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const last = lastTestEmailByAdmin.get(adminKey);
  if (last && now - last < 60_000) {
    const retryAfterSeconds = Math.ceil((60_000 - (now - last)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function markTestEmailSent(adminKey: string) {
  lastTestEmailByAdmin.set(adminKey, Date.now());
}

export async function runSmtpDiagnostics(params: {
  mode: "verify" | "send_test";
  testRecipient?: string;
  appName: string;
  adminIdentifier: string;
}): Promise<SmtpDiagnosticsResult> {
  const testedAt = new Date().toISOString();
  const env = getSmtpEnv();

  const result: SmtpDiagnosticsResult = {
    overallStatus: "Fel",
    testedAt,
    mode: params.mode,
    checks: {
      envVars: env.isComplete ? "OK" : "Fel",
      connection: "Fel",
      tls: "Fel",
      auth: "Fel",
      testEmail: "Ej testad",
    },
    errorMessage: null,
    errorCode: null,
    smtpResponse: null,
    deliveryNote: null,
    missingVars: env.missingVars,
  };

  // Step 1: Configuration check
  if (!env.isComplete) {
    result.errorCode = "CONFIG_INCOMPLETE";
    result.errorMessage = `SMTP-konfigurationen är ofullständig. Saknade variabler: ${env.missingVars.join(", ")}.`;
    recordDispatchLog({
      timestamp: testedAt,
      messageType: "smtp_test",
      deliveryStatus: "Fel",
      errorCode: "CONFIG_INCOMPLETE",
      errorMessage: "SMTP-konfigurationen är ofullständig.",
      initiatedBy: "AdminView:Testa SMTP",
      smtpResponse: null,
    });
    lastDiagnosticsResult = result;
    return result;
  }

  // Step 2a: TCP + TLS handshake check
  const tlsCheck = await checkTcpAndTlsConnectivity(env.host, env.port, env.secure);
  result.checks.connection = tlsCheck.connectionOk ? "OK" : "Fel";
  result.checks.tls = tlsCheck.tlsOk ? "OK" : "Fel";

  if (!tlsCheck.connectionOk || !tlsCheck.tlsOk) {
    result.errorCode = tlsCheck.errorCode || "CONNECTION_FAILED";
    result.errorMessage = tlsCheck.errorMessage || "SMTP-servern kan inte nås.";
    recordDispatchLog({
      timestamp: testedAt,
      messageType: "smtp_test",
      deliveryStatus: "Fel",
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      initiatedBy: "AdminView:Testa SMTP",
      smtpResponse: null,
    });
    lastDiagnosticsResult = result;
    return result;
  }

  // Step 2b: SMTP greeting & authentication check
  const transporter = createSmtpTransport(env);
  try {
    await transporter.verify();
    result.checks.auth = "OK";
    result.smtpResponse = "250 SMTP-anslutning, TLS och autentisering verifierade.";
  } catch (err: any) {
    const mapped = mapSmtpError(err);
    result.checks.auth = "Fel";
    if (mapped.category === "connection") result.checks.connection = "Fel";
    if (mapped.category === "tls") result.checks.tls = "Fel";
    result.errorCode = mapped.errorCode;
    result.errorMessage = mapped.errorMessage;
    result.smtpResponse = sanitizeSmtpString(err?.response || err?.message);
    recordDispatchLog({
      timestamp: testedAt,
      messageType: "smtp_test",
      deliveryStatus: "Fel",
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
      initiatedBy: "AdminView:Testa SMTP",
      smtpResponse: result.smtpResponse,
    });
    lastDiagnosticsResult = result;
    return result;
  } finally {
    transporter.close();
  }

  // If mode is verify only, we are done and everything verified OK
  if (params.mode === "verify") {
    result.overallStatus = "Fungerar";
    lastDiagnosticsResult = result;
    return result;
  }

  // Step 3: Send test email
  const recipient = (params.testRecipient || "").trim();
  if (!isValidSingleEmail(recipient)) {
    result.checks.testEmail = "Fel";
    result.errorCode = "INVALID_RECIPIENT";
    result.errorMessage = "Ange en giltig mottagaradress för testmeddelandet.";
    lastDiagnosticsResult = result;
    return result;
  }

  const formattedTime = new Date(testedAt).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const subject = `SMTP-test från ${params.appName}`;
  const textBody = [
    `Detta är ett automatiskt testmeddelande från ${params.appName}.`,
    "SMTP-konfigurationen har testats genom att skicka detta meddelande.",
    `Avsändare: ${env.from}`,
    `Tidpunkt: ${formattedTime}`,
    "Inga andra användare har fått detta testmeddelande.",
  ].join("\n");

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #222529; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e7dac5; border-radius: 8px; background: #ffffff;">
      <h2 style="color: #A33662; margin-top: 0;">SMTP-test från ${escapeHtml(params.appName)}</h2>
      <p>Detta är ett automatiskt testmeddelande från <strong>${escapeHtml(params.appName)}</strong>.</p>
      <p>SMTP-konfigurationen har testats genom att skicka detta meddelande.</p>
      <div style="background: #F9F6F1; border: 1px solid #E7DAC5; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 14px;">
        <div><strong>Avsändare:</strong> ${escapeHtml(env.from)}</div>
        <div><strong>Tidpunkt:</strong> ${escapeHtml(formattedTime)}</div>
      </div>
      <p style="font-size: 13px; color: #4D545C; margin-bottom: 0;">Inga andra användare har fått detta testmeddelande.</p>
    </div>
  `.trim();

  const sendRes = await sendEmail(recipient, subject, htmlBody, textBody, {
    messageType: "smtp_test",
    initiatedBy: `AdminView:Skicka testmeddelande (${params.adminIdentifier})`,
    isTest: true,
  });

  if (sendRes.success) {
    markTestEmailSent(params.adminIdentifier);
    result.overallStatus = "Fungerar";
    result.checks.testEmail = "Skickat";
    result.smtpResponse = sendRes.smtpResponse || "250 OK - Meddelandet accepterades av SMTP-servern.";
    result.deliveryNote =
      "SMTP-servern har accepterat testmeddelandet för överlämning. Observera att detta bekräftar att SMTP-servern tog emot utskicket, inte att det slutligen har hamnat i mottagarens inkorg.";
  } else {
    result.overallStatus = "Fel";
    result.checks.testEmail = "Fel";
    result.errorCode = sendRes.errorCode || "SEND_FAILED";
    result.errorMessage = sendRes.errorMessage || "Testmeddelandet kunde inte skickas.";
    result.smtpResponse = sendRes.smtpResponse || null;
  }

  lastDiagnosticsResult = result;
  return result;
}

export function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInvitationEmail(params: {
  appName: string;
  recipientName?: string;
  inviteCode: string;
  roleLabel: string;
  registrationUrl: string;
}) {
  const greeting = params.recipientName ? `Hej ${params.recipientName},` : "Hej,";
  const subject = `Inbjudan till ${params.appName}`;
  const text = [
    greeting,
    "",
    `Du har blivit inbjuden till ${params.appName} med behörigheten: ${params.roleLabel}.`,
    "",
    `Din inbjudningskod: ${params.inviteCode}`,
    `Registrera ditt konto här: ${params.registrationUrl}`,
    "",
    "Vänliga hälsningar,",
    params.appName,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222529; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e7dac5; border-radius: 8px; background: #ffffff;">
      <h2 style="color: #A33662; margin-top: 0;">Inbjudan till ${escapeHtml(params.appName)}</h2>
      <p>${escapeHtml(greeting)}</p>
      <p>Du har blivit inbjuden till <strong>${escapeHtml(params.appName)}</strong> med rollen <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
      <div style="background: #F9F6F1; border: 1px solid #E7DAC5; border-radius: 6px; padding: 14px 16px; margin: 18px 0;">
        <div style="font-size: 13px; color: #4D545C; margin-bottom: 4px;">Inbjudningskod:</div>
        <div style="font-family: monospace; font-size: 18px; font-weight: bold; color: #A33662;">${escapeHtml(params.inviteCode)}</div>
      </div>
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(params.registrationUrl)}" style="display: inline-block; background: #40775E; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 20px; border-radius: 6px;">Skapa konto</a>
      </p>
      <p style="font-size: 12px; color: #4D545C;">Om knappen inte fungerar kan du kopiera denna länk till din webbläsare:<br/>${escapeHtml(params.registrationUrl)}</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export function buildPasswordResetEmail(params: {
  appName: string;
  resetLink: string;
}) {
  const subject = `Återställ ditt lösenord för ${params.appName}`;
  const text = [
    "Hej,",
    "",
    `Vi har tagit emot en begäran om att återställa lösenordet för ditt konto i ${params.appName}.`,
    "",
    `Klicka på länken nedan för att välja ett nytt lösenord:`,
    params.resetLink,
    "",
    "Om du inte har begärt en lösenordsåterställning kan du ignorera detta meddelande.",
    "",
    "Vänliga hälsningar,",
    params.appName,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222529; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e7dac5; border-radius: 8px; background: #ffffff;">
      <h2 style="color: #A33662; margin-top: 0;">Återställ ditt lösenord</h2>
      <p>Hej,</p>
      <p>Vi har tagit emot en begäran om att återställa lösenordet för ditt konto i <strong>${escapeHtml(params.appName)}</strong>.</p>
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(params.resetLink)}" style="display: inline-block; background: #A33662; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 20px; border-radius: 6px;">Välj nytt lösenord</a>
      </p>
      <p style="font-size: 12px; color: #4D545C;">Om knappen inte fungerar kan du kopiera denna länk:<br/>${escapeHtml(params.resetLink)}</p>
      <p style="font-size: 12px; color: #4D545C; margin-bottom: 0;">Om du inte har begärt detta kan du tryggt bortse från detta e-postmeddelande.</p>
    </div>
  `.trim();

  return { subject, text, html };
}
