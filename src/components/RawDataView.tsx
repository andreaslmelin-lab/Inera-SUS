import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Measurement, ResponseData } from '../services';
import { getSusGrade, calculateMedian } from '../lib/utils';
import { motion } from 'motion/react';
import { Download, Code2, Link, Copy, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { triggerSusMetricsSync, pushMetricsToAdminDashboard } from '../services/syncService';

const RawDataView = () => {
  const [exportPayload, setExportPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const generatePayload = async () => {
      try {
        const productsSnap = await getDocs(collection(db, 'products'));
        const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));

        const measurementsSnap = await getDocs(collection(db, 'measurements'));
        const measurements = measurementsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Measurement));

        const responsesSnap = await getDocs(collection(db, 'responses'));
        const responses = responsesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ResponseData));

        let totalScore = 0;
        let totalCount = 0;
        let responseRateAvg = 100;

        const productMetrics = products.map(product => {
          const prodMeasurements = measurements.filter(m => m.productId === product.id);
          
          let pTotalScore = 0;
          let pCount = 0;
          prodMeasurements.forEach(m => {
             if (m.averageScore) {
               pTotalScore += m.averageScore * m.responseCount;
               pCount += m.responseCount;
             }
          });
          const pScore = pCount > 0 ? Math.round(pTotalScore / pCount) : 0;
          
          if(pCount > 0) {
            totalScore += pTotalScore;
            totalCount += pCount;
          }

          return {
            name: product.name,
            score: pScore,
            responses: pCount
          };
        });

        const overallScore = totalCount > 0 ? Math.round(totalScore / totalCount) : 0;
        
        const services = products.map(product => {
           const pMetrics = productMetrics.find(p => p.name === product.name);
           return {
             serviceId: product.id,
             serviceName: product.name,
             susScore: pMetrics?.score || 0,
             responsesCount: pMetrics?.responses || 0,
             wcagPassRate: null,
             criticalWcagErrors: null
           };
        });

        const events = responses.map(r => {
           return {
             eventId: r.id,
             timestamp: r.submitDate ? (r.submitDate as any).toDate().toISOString() : new Date().toISOString(),
             eventType: "SUS_SURVEY_COMPLETED",
             targetServiceId: r.productId,
             scoreGiven: r.susScore
           };
        });

        const payload = {
          "$schema": "https://inera-admin.se/schemas/ux-bigdata-v1.json",
          "source": "inera-sus",
          "timestamp": new Date().toISOString(),
          "organization": "Inera AB",
          "metrics": {
            "score": overallScore,
            "grade": getSusGrade(overallScore),
            "evaluationsCount": measurements.length,
            "responseRate": responseRateAvg,
            "productsCount": products.length,
            "products": productMetrics
          },
          "granularData": {
            "individuals": [],
            "teams": [],
            "services": services,
            "events": events
          }
        };

        setExportPayload(payload);

        // Auto sync payload to Inera Admin Dashboard
        triggerSusMetricsSync().catch(err => console.error("Auto sync failed:", err));
      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    generatePayload();
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const ok = await triggerSusMetricsSync();
      if (ok) {
        setSyncResult({ success: true, message: "Datasynkronisering till Inera Admin Dashboard lyckades!" });
      } else {
        setSyncResult({ success: false, message: "Kunde inte synkronisera data till Inera Admin Dashboard." });
      }
    } catch (error) {
      setSyncResult({ success: false, message: "Ett fel uppstod vid synkroniseringen." });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
     return <div className="p-8 text-center text-inera-neutral-40">Laddar exportdata...</div>;
  }

  const handleDownload = () => {
    if (!exportPayload) return;
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inera-sus-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display text-inera-neutral-10 mb-2">Rådata Export & Synkronisering</h2>
          <p className="text-inera-neutral-40">Datan synkroniseras automatiskt till Inera Admin UX Big Data Dashboard viaklientsynk (`pushMetricsToAdminDashboard`).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
            <button 
              onClick={handleManualSync} 
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-inera-primary-40 text-white rounded-lg hover:bg-inera-primary-30 transition-colors shadow-sm font-semibold disabled:opacity-50"
            >
                <Send size={18} /> {syncing ? 'Synkar...' : 'Synka nu till Dashboard'}
            </button>
            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-accent-40 text-white rounded-lg hover:bg-accent-30 transition-colors shadow-md font-semibold">
                <Download size={18} /> Ladda ner JSON-fil
            </button>
        </div>
      </div>

      {syncResult && (
        <div className={`p-4 rounded-lg flex items-center gap-3 border ${syncResult.success ? 'bg-inera-success-95 border-inera-success-40 text-inera-success-30' : 'bg-inera-error-95 border-inera-error-40 text-inera-error-30'}`}>
          {syncResult.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{syncResult.message}</span>
        </div>
      )}

      <div className="card p-0 shadow-sm border border-inera-secondary-90 rounded-lg bg-white overflow-hidden">
        <div className="bg-inera-neutral-10 text-inera-secondary-95 p-3 px-4 flex justify-between items-center text-sm">
            <div className="flex items-center gap-2 font-mono text-inera-secondary-90">
                <Code2 size={16} />
                JSON Payload (Inera Big Data Schema v1)
            </div>
            <button 
              onClick={() => {
                if (exportPayload) navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
              }}
              className="text-inera-secondary-90 hover:text-white transition-colors flex items-center gap-1 text-xs"
            >
                <Copy size={16} /> Kopiera JSON
            </button>
        </div>
        <div className="p-6 overflow-x-auto bg-[#fafafa]">
            <pre className="text-[13px] font-mono leading-relaxed text-inera-neutral-30">
            {JSON.stringify(exportPayload, null, 2)}
            </pre>
        </div>
      </div>
    </motion.div>
  );
};

export default RawDataView;

