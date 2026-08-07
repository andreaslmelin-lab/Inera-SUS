import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Measurement, ResponseData } from '../services';
import { getSusGrade, calculateMedian } from '../lib/utils';
import { motion } from 'motion/react';
import { Download, Code2, Link, Copy, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { triggerSusMetricsSync, pushMetricsToAdminDashboard } from '../services/syncService';
import { loadProductMappings } from '../services/catalogMappingService';

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
        const csvResponses = responsesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ResponseData));

        const susResponsesSnap = await getDocs(collection(db, 'susResponses'));
        const susResponses = susResponsesSnap.docs.map(d => {
          const data = d.data();
          const subDate = data.createdAt ? new Date(data.createdAt) : (data.completedAt ? new Date(data.completedAt) : new Date());
          
          let pName = data.variantName;
          const targetPId = data.productId;
          const matchedP = products.find(p => 
            p.id === targetPId || 
            p.name === targetPId || 
            (targetPId && (
              targetPId.toLowerCase().includes(p.id.toLowerCase()) || 
              p.id.toLowerCase().includes(targetPId.toLowerCase()) ||
              targetPId.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p.name.toLowerCase().replace(/[^a-z0-9]/g, '')) ||
              p.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(targetPId.toLowerCase().replace(/[^a-z0-9]/g, ''))
            ))
          );

          if (!pName || pName.startsWith('Egna')) {
            pName = matchedP ? matchedP.name : (targetPId || 'Övriga');
          }

          return {
            id: d.id,
            measurementId: data.surveyId || 'survey-round',
            productId: matchedP ? matchedP.id : (targetPId || 'prod-general'),
            variantName: pName,
            susScore: Number(data.susScore) || 0,
            answers: data.answers || [],
            comment: data.comment || '',
            submitDate: isNaN(subDate.getTime()) ? new Date() : subDate
          } as ResponseData;
        });

        const responses = [...csvResponses, ...susResponses];

        let totalScoreSum = 0;
        responses.forEach(r => {
          totalScoreSum += r.susScore;
        });
        const overallScore = responses.length > 0 ? Math.round(totalScoreSum / responses.length) : 0;

        const mappings = await loadProductMappings();

        // Group responses by variantName mapped to official master catalog product names
        const variantMetricsMap: Record<string, { totalScore: number; count: number }> = {};
        responses.forEach(r => {
          const rawName = r.variantName === 'Generell' || r.variantName === 'Other' || r.variantName === 'Övriga' || r.variantName?.startsWith('Egna') ? 'Övriga' : (r.variantName || 'Övriga');
          const mappedName = mappings[rawName] || rawName;
          if (!variantMetricsMap[mappedName]) {
            variantMetricsMap[mappedName] = { totalScore: 0, count: 0 };
          }
          variantMetricsMap[mappedName].totalScore += r.susScore;
          variantMetricsMap[mappedName].count++;
        });

        const productMetrics = Object.entries(variantMetricsMap).map(([name, data]) => ({
          name,
          score: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
          responses: data.count
        }));

        // Product hierarchy export
        const exportProducts = products.map(product => {
           const prodResponses = responses.filter(r => 
             r.productId === product.id || 
             r.productId === product.name ||
             r.variantName === product.name ||
             (r.productId && (
               r.productId.toLowerCase().includes(product.id.toLowerCase()) || 
               product.id.toLowerCase().includes(r.productId.toLowerCase()) ||
               r.productId.toLowerCase().replace(/[^a-z0-9]/g, '').includes(product.name.toLowerCase().replace(/[^a-z0-9]/g, '')) ||
               product.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(r.productId.toLowerCase().replace(/[^a-z0-9]/g, ''))
             ))
           );
           const prodTotalScore = prodResponses.reduce((sum, r) => sum + r.susScore, 0);
           const prodCount = prodResponses.length;
           return {
             productId: product.id,
             productName: product.name,
             teamId: product.teamId || 'team-unassigned',
             teamName: product.teamName || 'Omappat team',
             trainId: product.trainId || 'train-unassigned',
             trainName: product.trainName || 'Omappade',
             susScore: prodCount > 0 ? Math.round(prodTotalScore / prodCount) : (product.susScore || 0),
             responsesCount: prodCount
           };
        });

        const events = responses.map(r => {
           let dateIso = new Date().toISOString();
           if (r.submitDate) {
             if ((r.submitDate as any).toDate) {
               dateIso = (r.submitDate as any).toDate().toISOString();
             } else if (r.submitDate instanceof Date) {
               dateIso = r.submitDate.toISOString();
             } else if (typeof r.submitDate === 'string') {
               dateIso = new Date(r.submitDate).toISOString();
             }
           }

           const matchedP = products.find(p => 
             p.id === r.productId || 
             p.name === r.productId || 
             p.name === r.variantName ||
             (r.productId && (
               r.productId.toLowerCase().includes(p.id.toLowerCase()) || 
               p.id.toLowerCase().includes(r.productId.toLowerCase()) ||
               r.productId.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p.name.toLowerCase().replace(/[^a-z0-9]/g, '')) ||
               p.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(r.productId.toLowerCase().replace(/[^a-z0-9]/g, ''))
             ))
           );

           const rawName = r.variantName === 'Generell' || r.variantName === 'Other' || r.variantName === 'Övriga' || r.variantName?.startsWith('Egna') ? 'Övriga' : (r.variantName || 'Övriga');
           const finalProdName = matchedP ? matchedP.name : (mappings[rawName] || rawName);
           const finalProdId = matchedP ? matchedP.id : (r.productId || 'prod-general');

           return {
             eventId: r.id,
             timestamp: dateIso,
             eventType: "SUS_SURVEY_COMPLETED",
             targetProductId: finalProdId,
             productName: finalProdName,
             scoreGiven: r.susScore
           };
        });

        const payload = {
          "$schema": "https://inera-admin.se/schemas/ux-bigdata-v1.json",
          "source": "inera-sus",
          "sourceKey": "inera-sus",
          "timestamp": new Date().toISOString(),
          "organization": "Inera AB",
          "metrics": {
            "score": overallScore,
            "grade": getSusGrade(overallScore),
            "evaluationsCount": measurements.length + susResponses.length,
            "responseRate": 100,
            "productsCount": productMetrics.length,
            "products": productMetrics
          },
          "granularData": {
            "individuals": [],
            "teams": [],
            "products": exportProducts,
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
      const res = await triggerSusMetricsSync();
      if (res.success) {
        setSyncResult({ success: true, message: "Datasynkronisering till Inera Admin Dashboard lyckades!" });
      } else {
        setSyncResult({ success: false, message: `Kunde inte synkronisera: ${res.error || 'Okänt fel'}` });
      }
    } catch (error: any) {
      setSyncResult({ success: false, message: `Ett fel uppstod: ${error.message || 'Synkfel'}` });
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
            <button onClick={handleDownload} className="btn btn--m btn--primary font-semibold shadow-sm">
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

