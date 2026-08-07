import React, { useState, useEffect } from 'react';
import { Copy, RefreshCw, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerSusMetricsSync } from '../services/syncService';
import { cn } from '../lib/utils';

const ApiView = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [endpoint, setEndpoint] = useState('https://inera-ux-dashboard.vercel.app/api/sync-metrics');
  const [apiToken, setApiToken] = useState('inera_ux_token_11am0nao');

  const [jsonPayload, setJsonPayload] = useState('');
  const [loadingPayload, setLoadingPayload] = useState(true);

  const fetchLivePayload = async () => {
    setLoadingPayload(true);
    try {
      // Mock push to inspect body structure
      const res = await triggerSusMetricsSync();
      if (res && res.data) {
        setJsonPayload(JSON.stringify(res.data, null, 2));
      }
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
      const res = await triggerSusMetricsSync();
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
      const res = await fetch('/api/sync-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': apiToken,
        },
        body: JSON.stringify(parsed)
      });
      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      setResponse(JSON.stringify(data, null, 2));

      if (res.ok && data.success !== false) {
        setSyncStatus({ success: true, message: 'Data synkad med Inera UX Dashboard' });
      } else {
        const errMsg = data.error || data.message || `HTTP ${res.status} ${res.statusText}`;
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
            "p-3 rounded-lg text-sm font-semibold flex items-center gap-2 mb-6 transition-all",
            syncStatus.success ? "bg-inera-success-95 text-inera-success-40 border border-inera-success-40" : "bg-inera-error-95 text-inera-error-40 border border-inera-error-40"
          )}>
            {syncStatus.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{syncStatus.message}</span>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-inera-neutral-40 mb-1">SYNC API ENDPOINT (POST)</label>
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
            <label className="block text-xs font-bold text-inera-neutral-40 mb-1">X-API-TOKEN (HEADER)</label>
            <div className="flex gap-2">
              <input 
                type="text"
                value={apiToken} 
                onChange={(e) => setApiToken(e.target.value)}
                className="flex-grow p-2 border border-inera-secondary-90 rounded text-sm bg-inera-secondary-95 font-mono text-inera-neutral-10 focus:outline-none focus:ring-1 focus:ring-inera-primary-40" 
              />
              <button 
                onClick={() => navigator.clipboard.writeText(apiToken)}
                className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95 text-inera-neutral-20 shrink-0"
                title="Kopiera Token"
              >
                <Copy size={16} />
              </button>
            </div>
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


