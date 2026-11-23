import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  RefreshCw,
  Server,
  Lock,
  Info,
  Clock,
  Activity,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { cn } from '../lib/utils';

interface SmtpConfigSummary {
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

interface SmtpDiagnosticsResult {
  overallStatus: 'Fungerar' | 'Fel' | 'Ej testad';
  testedAt: string;
  mode: 'verify' | 'send_test';
  checks: {
    envVars: 'OK' | 'Fel' | 'Ej testad';
    connection: 'OK' | 'Fel' | 'Ej testad';
    tls: 'OK' | 'Fel' | 'Ej testad';
    auth: 'OK' | 'Fel' | 'Ej testad';
    testEmail: 'Skickat' | 'Fel' | 'Ej testad';
  };
  errorMessage: string | null;
  errorCode: string | null;
  smtpResponse: string | null;
  deliveryNote: string | null;
  missingVars: string[];
}

interface EmailDispatchLog {
  id: string;
  timestamp: string;
  messageType: string;
  deliveryStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  initiatedBy: string;
  smtpResponse: string | null;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  smtp_test: 'SMTP-testmeddelande',
  password_reset: 'Lösenordsåterställning',
  user_invitation: 'Användarinbjudan',
  notification: 'Notifikation',
  reminder: 'Påminnelse',
  system: 'Systemmeddelande',
};

const SmtpSettingsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<SmtpConfigSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<SmtpDiagnosticsResult | null>(null);
  const [logs, setLogs] = useState<EmailDispatchLog[]>([]);
  const [appName, setAppName] = useState('Inera SUS Tracker');

  const [testRecipient, setTestRecipient] = useState('andreas.l.melin@gmail.com');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadSmtpStatus = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setActionError('Du måste vara inloggad som administratör för att visa SMTP-status.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/admin/smtp/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        const contentType = res.headers.get('content-type') || 'okänd';
        throw new Error(
          `Kunde inte läsa JSON-svar från /api/admin/smtp/status (HTTP ${res.status}, ${contentType}). Kontrollera att backend-API:t körs korrekt och har deployats.`
        );
      }
      if (!res.ok) {
        throw new Error(data?.error || 'Kunde inte hämta SMTP-konfiguration.');
      }

      setConfig(data.config);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      if (data.appName) setAppName(data.appName);

      if (data.lastTest) {
        setDiagnostics(data.lastTest);
      } else {
        // Load last persisted non-sensitive status snapshot from Firestore if server restarted
        try {
          const snap = await getDoc(doc(db, 'settings', 'smtp_status'));
          if (snap.exists()) {
            setDiagnostics(snap.data() as SmtpDiagnosticsResult);
          }
        } catch {
          // Ignore if no snapshot exists yet
        }
      }
    } catch (err: any) {
      setActionError(err?.message || 'Kunde inte ladda SMTP-inställningar från servern.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSmtpStatus();
  }, [loadSmtpStatus]);

  const persistNonSensitiveDiagnostics = async (diag: SmtpDiagnosticsResult) => {
    try {
      // Strictly NO secrets, NO passwords, NO PII / email addresses stored
      await setDoc(doc(db, 'settings', 'smtp_status'), {
        overallStatus: diag.overallStatus,
        testedAt: diag.testedAt,
        mode: diag.mode,
        checks: diag.checks,
        errorMessage: diag.errorMessage,
        errorCode: diag.errorCode,
        smtpResponse: diag.smtpResponse,
        deliveryNote: diag.deliveryNote,
        missingVars: diag.missingVars,
      });
    } catch {
      // Non-blocking snapshot persistence
    }
  };

  const handleRunDiagnostics = async (mode: 'verify' | 'send_test') => {
    setActionError(null);
    setActionSuccess(null);

    if (mode === 'verify') {
      setIsTestingConnection(true);
    } else {
      if (!testRecipient.trim()) {
        setActionError('Ange en mottagaradress för testmeddelandet.');
        return;
      }
      setIsSendingTest(true);
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Din session har gått ut. Logga in igen.');
      }

      const res = await fetch('/api/admin/smtp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          recipient: mode === 'send_test' ? testRecipient.trim() : undefined,
        }),
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        const contentType = res.headers.get('content-type') || 'okänd';
        throw new Error(
          `Kunde inte läsa JSON-svar från /api/admin/smtp/test (HTTP ${res.status}, ${contentType}). Kontrollera att backend-API:t körs korrekt och har deployats.`
        );
      }
      if (!res.ok) {
        throw new Error(data?.error || 'Kunde inte genomföra SMTP-testet.');
      }

      if (data.config) setConfig(data.config);
      if (Array.isArray(data.logs)) setLogs(data.logs);

      if (data.diagnostics) {
        const diag: SmtpDiagnosticsResult = data.diagnostics;
        setDiagnostics(diag);
        await persistNonSensitiveDiagnostics(diag);

        if (diag.overallStatus === 'Fungerar') {
          setActionSuccess(
            mode === 'send_test'
              ? `Testmeddelande accepterades av SMTP-servern (${diag.smtpResponse || '250 OK'}).`
              : 'SMTP-anslutning, TLS och autentisering fungerar korrekt.'
          );
        } else {
          setActionError(diag.errorMessage || 'SMTP-testet misslyckades.');
        }
      }
    } catch (err: any) {
      setActionError(err?.message || 'Ett fel uppstod vid SMTP-testet.');
    } finally {
      setIsTestingConnection(false);
      setIsSendingTest(false);
    }
  };

  const renderStatusBadge = (value: string) => {
    if (value === 'OK' || value === 'Skickat' || value === 'Fungerar' || value === 'Konfigurerat' || value === 'Accepterad av SMTP-server') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-inera-success-95 text-inera-success-40 border border-inera-success-40/40">
          <CheckCircle2 size={12} />
          {value}
        </span>
      );
    }
    if (value === 'Fel' || value === 'Saknas' || value === 'Avvisad av SMTP-server') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-inera-error-95 text-inera-error-40 border border-inera-error-40/40">
          <AlertCircle size={12} />
          {value}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-inera-secondary-95 text-inera-neutral-40 border border-inera-secondary-90">
        <Clock size={12} />
        {value}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="card p-8 text-center bg-white border-inera-secondary-90 shadow-md">
        <Loader2 className="animate-spin text-inera-primary-40 mx-auto mb-2" size={28} />
        <p className="text-sm text-inera-neutral-40">Läser in SMTP-status från servern...</p>
      </div>
    );
  }

  const overallStatus = diagnostics?.overallStatus || 'Ej testad';

  return (
    <div className="space-y-6">
      {/* Main Header & Config Card */}
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-inera-secondary-90">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-inera-primary-40/10 text-inera-primary-40 shrink-0">
              <Mail size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-inera-neutral-10">E-post och SMTP</h2>
              <p className="text-xs text-inera-neutral-40 mt-0.5">
                Central utgående e-posthantering via Gmail SMTP. Alla autentiseringsuppgifter läses enbart på serversidan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadSmtpStatus}
              className="btn btn--s btn--secondary flex items-center gap-1.5"
              title="Uppdatera status"
            >
              <RefreshCw size={14} />
              <span>Uppdatera</span>
            </button>
            <button
              type="button"
              onClick={() => handleRunDiagnostics('verify')}
              disabled={isTestingConnection || isSendingTest}
              className="btn btn--s btn--primary flex items-center gap-1.5"
            >
              {isTestingConnection ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
              <span>Testa SMTP</span>
            </button>
          </div>
        </div>

        {/* Missing Env Vars Alert */}
        {config && !config.configured && (
          <div className="bg-inera-attention-95 border border-inera-attention-40 text-inera-neutral-20 p-4 rounded-xl text-sm space-y-2">
            <div className="flex items-center gap-2 font-bold text-inera-attention-40">
              <AlertCircle size={18} />
              <span>SMTP-konfigurationen är ofullständig</span>
            </div>
            <p className="text-xs leading-relaxed">
              Följande miljövariabler saknas eller är ogiltiga på serversidan:{' '}
              <span className="font-mono font-bold">
                {config.missingVars.join(', ')}
              </span>
              .
            </p>
            <p className="text-xs text-inera-neutral-40 leading-relaxed">
              Ange dessa som säkra miljövariabler (Secrets) i servermiljön: <code className="font-mono">SMTP_HOST=smtp.gmail.com</code>,{' '}
              <code className="font-mono">SMTP_PORT=465</code>, <code className="font-mono">SMTP_USER=andreas.l.melin@gmail.com</code>,{' '}
              <code className="font-mono">SMTP_PASS</code> (Google App-lösenord), <code className="font-mono">SMTP_FROM</code> samt{' '}
              <code className="font-mono">SMTP_SECURE=true</code>. Lösenord hanteras aldrig i webbläsaren.
            </p>
          </div>
        )}

        {actionError && (
          <div className="bg-inera-error-95 border border-inera-error-40 text-inera-error-40 p-4 rounded-xl text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-inera-success-95 border border-inera-success-40 text-inera-success-40 p-4 rounded-xl text-sm flex items-start gap-2">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Configuration Table */}
        <div>
          <h3 className="text-sm font-bold text-inera-neutral-10 mb-3 flex items-center gap-2">
            <Server size={16} className="text-inera-primary-40" />
            <span>Aktuell SMTP-konfiguration</span>
          </h3>
          <div className="overflow-x-auto border border-inera-secondary-90 rounded-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-inera-secondary-95 border-b border-inera-secondary-90 text-xs font-bold text-inera-neutral-40 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Inställning</th>
                  <th className="py-2.5 px-4">Visning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inera-secondary-95">
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">SMTP-server</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-inera-neutral-10">{config?.host || 'Saknas'}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Port</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-inera-neutral-10">{config?.port ?? 465}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Användarkonto</td>
                  <td className="py-2.5 px-4 text-xs text-inera-neutral-10">
                    {config?.userConfigured ? config.userDisplay : renderStatusBadge('Saknas')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Avsändare</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-inera-neutral-10">
                    {config?.fromValue && config.fromValue !== 'Saknas'
                      ? config.fromValue
                      : renderStatusBadge('Saknas')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Kryptering</td>
                  <td className="py-2.5 px-4 text-xs text-inera-neutral-10 flex items-center gap-1.5">
                    <Lock size={13} className="text-inera-accent-40" />
                    <span>{config?.encryptionLabel || 'SSL/TLS'}</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">SMTP-lösenord</td>
                  <td className="py-2.5 px-4">
                    {renderStatusBadge(config?.passwordConfigured ? 'Konfigurerat' : 'Saknas')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Status</td>
                  <td className="py-2.5 px-4">{renderStatusBadge(overallStatus)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Step 3: Send Test Email */}
        <div className="p-5 rounded-xl bg-inera-secondary-95/70 border border-inera-secondary-90 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-inera-neutral-10 flex items-center gap-2">
              <Send size={16} className="text-inera-primary-40" />
              <span>Skicka testmeddelande</span>
            </h3>
            <p className="text-xs text-inera-neutral-40 mt-0.5">
              Skickar ett enskilt verifieringsmejl från <span className="font-semibold">{appName}</span>. Begränsat till högst ett utskick per minut per administratör.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1">
              <label htmlFor="smtp-test-recipient" className="block text-xs font-bold text-inera-neutral-20">
                Mottagare för testmeddelande
              </label>
              <input
                id="smtp-test-recipient"
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="andreas.l.melin@gmail.com"
                className="input bg-white text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => handleRunDiagnostics('send_test')}
              disabled={isSendingTest || isTestingConnection}
              className="btn btn--m btn--primary flex items-center justify-center gap-2 shrink-0"
            >
              {isSendingTest ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span>Skicka testmeddelande</span>
            </button>
          </div>
        </div>

        {/* Step 4: Test Results Table */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-inera-neutral-10 flex items-center gap-2">
              <ShieldCheck size={16} className="text-inera-accent-40" />
              <span>Senaste testresultat</span>
            </h3>
            {diagnostics?.testedAt && (
              <span className="text-xs text-inera-neutral-40">
                Senaste test: {new Date(diagnostics.testedAt).toLocaleString('sv-SE')}
              </span>
            )}
          </div>

          <div className="overflow-x-auto border border-inera-secondary-90 rounded-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-inera-secondary-95 border-b border-inera-secondary-90 text-xs font-bold text-inera-neutral-40 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Kontroll</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inera-secondary-95">
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Miljövariabler</td>
                  <td className="py-2.5 px-4">{renderStatusBadge(diagnostics?.checks.envVars || 'Ej testad')}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">SMTP-anslutning</td>
                  <td className="py-2.5 px-4">{renderStatusBadge(diagnostics?.checks.connection || 'Ej testad')}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">TLS</td>
                  <td className="py-2.5 px-4">{renderStatusBadge(diagnostics?.checks.tls || 'Ej testad')}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Autentisering</td>
                  <td className="py-2.5 px-4">{renderStatusBadge(diagnostics?.checks.auth || 'Ej testad')}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-inera-neutral-20">Testmeddelande</td>
                  <td className="py-2.5 px-4">{renderStatusBadge(diagnostics?.checks.testEmail || 'Ej testad')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {diagnostics?.errorMessage && (
            <div className="p-3.5 rounded-lg bg-inera-error-95 border border-inera-error-40/30 text-xs text-inera-error-40 space-y-1">
              <div className="font-bold">Felmeddelande {diagnostics.errorCode ? `(${diagnostics.errorCode})` : ''}:</div>
              <div>{diagnostics.errorMessage}</div>
            </div>
          )}

          {diagnostics?.smtpResponse && (
            <div className="p-3.5 rounded-lg bg-inera-secondary-95 border border-inera-secondary-90 text-xs text-inera-neutral-20 space-y-1">
              <div className="font-bold text-inera-neutral-10">SMTP-serverns svar:</div>
              <div className="font-mono break-all">{diagnostics.smtpResponse}</div>
            </div>
          )}

          <div className="p-3.5 rounded-lg bg-inera-info-95 border border-inera-info-40/30 text-xs text-inera-neutral-20 flex items-start gap-2">
            <Info size={16} className="text-inera-info-40 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Viktig skillnad vid leveranskontroll:</strong> Att SMTP-servern accepterar ett meddelande (t.ex.{' '}
              <code className="font-mono">250 2.0.0 OK</code>) innebär att servern tagit emot det för vidarebefordran. Slutlig leverans till
              mottagarens inkorg beror på mottagande e-postservers skräppost- och säkerhetsfilter.
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Info & Dispatch Logs */}
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white space-y-4">
        <div>
          <h3 className="text-base font-bold font-display text-inera-neutral-10">Loggning och felsökning av e-postutskick</h3>
          <p className="text-xs text-inera-neutral-40 mt-0.5">
            Registrerar tidpunkt, typ av meddelande, SMTP-serverns svarsstatus, eventuell felkod och initierande funktion. Inga lösenord eller
            personuppgifter lagras i loggen.
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-inera-secondary-90 rounded-xl text-xs text-inera-neutral-40">
            Inga e-postutskick eller SMTP-tester har loggats i denna serverinstans ännu.
          </div>
        ) : (
          <div className="overflow-x-auto border border-inera-secondary-90 rounded-xl">
            <table className="w-full text-left border-collapse text-xs min-w-[680px]">
              <thead>
                <tr className="bg-inera-secondary-95 border-b border-inera-secondary-90 font-bold text-inera-neutral-40 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Tidpunkt</th>
                  <th className="py-2.5 px-3">Typ av meddelande</th>
                  <th className="py-2.5 px-3">Leveransstatus</th>
                  <th className="py-2.5 px-3">Felkod</th>
                  <th className="py-2.5 px-3">Initierad av</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inera-secondary-95">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-inera-secondary-95/50">
                    <td className="py-2.5 px-3 font-mono text-inera-neutral-30 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('sv-SE')}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-inera-neutral-10">
                      {MESSAGE_TYPE_LABELS[log.messageType] || log.messageType}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="space-y-1">
                        {renderStatusBadge(log.deliveryStatus)}
                        {log.smtpResponse && (
                          <div className="font-mono text-[11px] text-inera-neutral-40 truncate max-w-[260px]" title={log.smtpResponse}>
                            {log.smtpResponse}
                          </div>
                        )}
                        {log.errorMessage && (
                          <div className="text-[11px] text-inera-error-40">{log.errorMessage}</div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-inera-neutral-30">
                      {log.errorCode || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-inera-neutral-30">{log.initiatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmtpSettingsView;
