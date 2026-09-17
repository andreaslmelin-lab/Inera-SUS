import React, { useState, useEffect } from 'react';
import { Copy, RefreshCw, CheckCircle2, AlertCircle, Send, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { 
  triggerSusMetricsSync, 
  generateSusMetricsPayload, 
  DEFAULT_INERA_SUS_TOKEN, 
  DEFAULT_INERA_SUS_ENDPOINT 
} from '../services/syncService';
import { cn } from '../lib/utils';

const ApiView = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [endpoint, setEndpoint] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('inera_sus_sync_endpoint')?.trim() : null;
    return (saved && saved !== 'undefined' && saved !== 'null') ? saved : DEFAULT_INERA_SUS_ENDPOINT;
  });
  const [apiToken, setApiToken] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('inera_sus_sync_token')?.trim() : null;
    return (saved && saved !== 'undefined' && saved !== 'null') ? saved : DEFAULT_INERA_SUS_TOKEN;
  });

  const [jsonPayload, setJsonPayload] = useState('');
  const [loadingPayload, setLoadingPayload] = useState(true);

  useEffect(() => {
    localStorage.setItem('inera_sus_sync_endpoint', endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem('inera_sus_sync_token', apiToken);
  }, [apiToken]);

  const handleResetToken = () => {
    setApiToken(DEFAULT_INERA_SUS_TOKEN);
    localStorage.setItem('inera_sus_sync_token', DEFAULT_INERA_SUS_TOKEN);
  };

  const handleResetEndpoint = () => {
    setEndpoint(DEFAULT_INERA_SUS_ENDPOINT);
    localStorage.setItem('inera_sus_sync_endpoint', DEFAULT_INERA_SUS_ENDPOINT);
  };

  const fetchLivePayload = async () => {
    setLoadingPayload(true);
    try {
      const payload = await generateSusMetricsPayload();
      setJsonPayload(JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("Fel vid laddning av levande JSON payload:", e);
    } finally {
      setLoadingPayload(false);
    }
  };

  useEffect(() => {
    fetchLivePayload();
  }, []);

  const [response, setResponse] = useState('');

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setResponse('');
    try {
      const sanitizedToken = apiToken.trim() || DEFAULT_INERA_SUS_TOKEN;
      if (apiToken !== sanitizedToken) {
        setApiToken(sanitizedToken);
      }
      const res = await triggerSusMetricsSync();
      
      // Update displayed token if service self-healed
      const updatedSavedToken = localStorage.getItem('inera_sus_sync_token');
      if (updatedSavedToken && updatedSavedToken !== apiToken) {
        setApiToken(updatedSavedToken);
      }

      if (res.success) {
        setSyncStatus({ success: true, message: 'Data synkad med Inera UX Dashboard' });
        setResponse(JSON.stringify(res.data || { success: true }, null, 2));
      } else {
        const errMsg = res.error || 'Synkronisering misslyckades.';
        setSyncStatus({ success: false, message: `Synkronisering misslyckades: ${errMsg}` });
        setResponse(JSON.stringify(res.details || { success: false, error: errMsg }, null, 2));
      }
    } catch (err: any) {
      console.error("Fel vid manuell synk:", err);
      const errMsg = err.message || 'Kommunikationsfel vid synk.';
      setSyncStatus({ success: false, message: `Synkronisering misslyckades: ${errMsg}` });
      setResponse(JSON.stringify({ error: errMsg }, null, 2));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestPost = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setResponse('');
    try {
      const parsed = JSON.parse(jsonPayload);
      const tokenToUse = apiToken.trim() || DEFAULT_INERA_SUS_TOKEN;
      const endpointToUse = endpoint.trim() || DEFAULT_INERA_SUS_ENDPOINT;
      
      let data: any = {};
      let isSuccess = false;
      let proxyFailed = false;
      
      try {
        const res = await fetch('/api/sync-metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Token': tokenToUse,
            'X-Sync-Endpoint': endpointToUse
          },
          body: JSON.stringify(parsed)
        });
        const responseText = await res.text();
        try {
          data = JSON.parse(responseText);
          isSuccess = res.ok && data.success !== false;
        } catch {
          proxyFailed = true;
        }
      } catch (e) {
        proxyFailed = true;
      }

      if (proxyFailed) {
        try {
          const directRes = await fetch(endpointToUse, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Token': tokenToUse
            },
            body: JSON.stringify(parsed)
          });
          const directText = await directRes.text();
          try {
            data = JSON.parse(directText);
            isSuccess = directRes.ok && data.success !== false;
          } catch {
            data = { error: 'Kunde inte läsa svar från mottagande server (ej giltig JSON).' };
            isSuccess = false;
          }
        } catch (directErr: any) {
          data = { error: 'Misslyckades att synka. Det direkta anropet blockerades.' };
          isSuccess = false;
        }
      }

      // If token failed, auto-heal if different from default
      if (!isSuccess && (data.error?.includes('Unauthorized') || data.error?.includes('X-API-Token')) && tokenToUse !== DEFAULT_INERA_SUS_TOKEN) {
        handleResetToken();
      }

      setResponse(JSON.stringify(data, null, 2));

      if (isSuccess) {
        setSyncStatus({ success: true, message: 'Data synkad med Inera UX Dashboard' });
      } else {
        const errMsg = data.error || data.message || `Fel vid synkronisering`;
        console.error("API test error:", data);
        setSyncStatus({ success: false, message: `Synkronisering misslyckades: ${errMsg}` });
      }
    } catch (err: any) {
      console.error("Fel vid testanrop:", err);
      const errMsg = err.message || 'Misslyckades vid anrop.';
      setResponse(JSON.stringify({ error: errMsg }, null, 2));
      setSyncStatus({ success: false, message: `Synkronisering misslyckades: ${errMsg}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const isAuthError = syncStatus && !syncStatus.success && (
    syncStatus.message?.includes('Unauthorized') || 
    syncStatus.message?.includes('X-API-Token')
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-8"
    >
      {/* Top Sync Card */}
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold font-display text-inera-neutral-10">Inera UX Dashboard Synkronisering (PUSH)</h2>
            <p className="text-sm text-inera-neutral-40 mt-1">
              Aktiv PUSH-integration: Vid sparande av nya SUS-mätvärden görs automatiska HTTP POST-anrop med nyckeltal till Inera UX Dashboard.
            </p>
          </div>
          <button 
            onClick={handleManualSync}
            disabled={isSyncing}
            className="btn btn--m btn--primary flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            Synka till Inera UX Dashboard
          </button>
        </div>

        {syncStatus && (
          <div className={cn(
            "p-3 rounded-lg text-sm font-semibold transition-all mb-6",
            syncStatus.success ? "bg-inera-success-95 text-inera-success-40 border border-inera-success-40" : "bg-inera-error-95 text-inera-error-40 border border-inera-error-40"
          )}>
            <div className="flex items-center gap-2">
              {syncStatus.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{syncStatus.message}</span>
            </div>
            {isAuthError && (
              <div className="mt-3 pt-3 border-t border-inera-error-40/30 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-normal text-inera-error-40">
                  Felaktig eller saknad token. Återställ till Inera UX Dashboards standardtoken:
                </span>
                <button 
                  onClick={() => {
                    handleResetToken();
                    setTimeout(() => handleManualSync(), 100);
                  }}
                  className="btn btn--xs btn--primary shrink-0 flex items-center gap-1"
                >
                  <RotateCcw size={14} />
                  Återställ standardtoken & synka nu
                </button>
              </div>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-inera-neutral-40">SYNC API ENDPOINT (POST)</label>
              {endpoint !== DEFAULT_INERA_SUS_ENDPOINT && (
                <button 
                  onClick={handleResetEndpoint}
                  className="text-xs text-inera-primary-40 hover:underline flex items-center gap-1"
                  title="Återställ till standard-URL"
                >
                  <RotateCcw size={12} />
                  Återställ URL
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={endpoint} 
                onChange={(e) => setEndpoint(e.target.value)}
                className="flex-grow p-2 border border-inera-secondary-90 rounded text-sm bg-inera-secondary-95 font-mono text-inera-neutral-10 focus:outline-none focus:ring-1 focus:ring-inera-primary-40" 
              />
              <button 
                onClick={() => navigator.clipboard.writeText(endpoint)}
                className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95 text-inera-neutral-20 shrink-0"
                title="Kopiera URL"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-inera-neutral-40">X-API-TOKEN (HEADER)</label>
              {apiToken !== DEFAULT_INERA_SUS_TOKEN && (
                <button 
                  onClick={handleResetToken}
                  className="text-xs text-inera-primary-40 hover:underline flex items-center gap-1"
                  title="Återställ till standardtoken"
                >
                  <RotateCcw size={12} />
                  Återställ standardtoken
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={apiToken} 
                onChange={(e) => setApiToken(e.target.value)}
                className={cn(
                  "flex-grow p-2 border rounded text-sm font-mono text-inera-neutral-10 focus:outline-none focus:ring-1 focus:ring-inera-primary-40",
                  apiToken !== DEFAULT_INERA_SUS_TOKEN 
                    ? "bg-inera-warning-95/40 border-inera-warning-40/50" 
                    : "bg-inera-secondary-95 border-inera-secondary-90"
                )}
              />
              <button 
                onClick={handleResetToken}
                className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95 text-inera-neutral-20 shrink-0"
                title="Återställ till standardtoken (inera_ux_token_11am0nao)"
              >
                <RotateCcw size={16} />
              </button>
              <button 
                onClick={() => navigator.clipboard.writeText(apiToken)}
                className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95 text-inera-neutral-20 shrink-0"
                title="Kopiera Token"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="text-xs text-inera-neutral-40 mt-1">
              Standard: <code className="font-mono text-inera-neutral-20">{DEFAULT_INERA_SUS_TOKEN}</code>
            </p>
          </div>
        </div>
      </div>

      {/* JSON Payload Spec & Test */}
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white">
        <h2 className="text-xl font-bold font-display text-inera-neutral-10 mb-2">Rådata / JSON Payload</h2>
        <p className="text-sm text-inera-neutral-40 mb-4">Levande JSON-payload som skickas via HTTP POST till Inera UX Dashboard (source: "inera-sus"):</p>

        <textarea 
          value={jsonPayload}
          onChange={(e) => setJsonPayload(e.target.value)}
          className="w-full h-64 p-4 bg-inera-neutral-10 text-white font-mono text-sm rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-inera-primary-40/30"
        />

        <div className="flex gap-3">
          <button 
            onClick={handleTestPost} 
            disabled={isSyncing} 
            className="btn btn--m btn--secondary flex items-center gap-2"
          >
            <Send size={16} />
            Skicka testpayload
          </button>
        </div>

        {response && (
          <div className="mt-4 p-4 bg-inera-secondary-95 border border-inera-secondary-90 rounded text-sm font-mono text-inera-neutral-20 overflow-x-auto">
            {response}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ApiView;


