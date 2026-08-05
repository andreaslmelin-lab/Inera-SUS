import React, { useState } from 'react';
import { Copy, RefreshCw, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerSusMetricsSync } from '../services/syncService';
import { cn } from '../lib/utils';

const ApiView = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [jsonPayload, setJsonPayload] = useState(JSON.stringify({
    "source": "inera-sus",
    "timestamp": new Date().toISOString(),
    "metrics": {
      "score": 81.5,
      "evaluationsCount": 112,
      "responseRate": 72
    },
    "granularData": {
      "products": [
        {
          "productId": "prod-1177-tidbokning",
          "productName": "1177 Tidbokning",
          "susScore": 84,
          "responses": 45
        },
        {
          "productId": "prod-journalen",
          "productName": "1177 Journalen",
          "susScore": 79,
          "responses": 67
        }
      ]
    }
  }, null, 2));

  const [response, setResponse] = useState('');

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setResponse('');
    try {
      const ok = await triggerSusMetricsSync();
      if (ok) {
        setSyncStatus({ success: true, message: 'Data synkad med Inera UX Dashboard' });
        setResponse(JSON.stringify({ success: true, status: 'Synced successfully to Inera UX Dashboard' }, null, 2));
      } else {
        setSyncStatus({ success: false, message: 'Synkronisering misslyckades. Se konsolen för detaljer.' });
        setResponse(JSON.stringify({ success: false, error: 'Sync failed' }, null, 2));
      }
    } catch (err: any) {
      console.error("Fel vid manuell synk:", err);
      setSyncStatus({ success: false, message: 'Synkronisering misslyckades.' });
      setResponse(JSON.stringify({ error: err.message || 'Call failed' }, null, 2));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestPost = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const parsed = JSON.parse(jsonPayload);
      const res = await fetch('/api/sync-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
      if (res.ok) {
        setSyncStatus({ success: true, message: 'Data synkad med Inera UX Dashboard' });
      } else {
        console.error("API test error:", data);
        setSyncStatus({ success: false, message: 'Kunde inte synka. Se konsolen.' });
      }
    } catch (err: any) {
      console.error("Fel vid testanrop:", err);
      setResponse(JSON.stringify({ error: 'Failed to call API' }, null, 2));
      setSyncStatus({ success: false, message: 'Misslyckades vid anrop.' });
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
            <h2 className="text-xl font-bold font-display text-inera-neutral-10">Inera UX Dashboard Synkronisering</h2>
            <p className="text-sm text-inera-neutral-40 mt-1">Automatisk bakgrundssynkronisering av beräknade SUS-mätvärden till den centrala mätplattformen.</p>
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
                readOnly 
                value="https://inera-ux-dashboard.vercel.app/api/sync-metrics" 
                className="flex-grow p-2 border border-inera-secondary-90 rounded text-sm bg-inera-secondary-95 font-mono text-inera-neutral-10" 
              />
              <button 
                onClick={() => navigator.clipboard.writeText("https://inera-ux-dashboard.vercel.app/api/sync-metrics")}
                className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95 text-inera-neutral-20"
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
                readOnly 
                value="inera_ux_token_11am0nao" 
                className="flex-grow p-2 border border-inera-secondary-90 rounded text-sm bg-inera-secondary-95 font-mono text-inera-neutral-10" 
              />
              <button 
                onClick={() => navigator.clipboard.writeText("inera_ux_token_11am0nao")}
                className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95 text-inera-neutral-20"
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
        <h2 className="text-xl font-bold font-display text-inera-neutral-10 mb-2">REST POST Payload Format</h2>
        <p className="text-sm text-inera-neutral-40 mb-4">Struktur för JSON-payload som skickas vid synkronisering av SUS-mätvärden:</p>

        <textarea 
          value={jsonPayload}
          onChange={(e) => setJsonPayload(e.target.value)}
          className="w-full h-56 p-4 bg-inera-neutral-10 text-white font-mono text-sm rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-inera-primary-40/30"
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

