import React, { useState, useEffect } from 'react';
import { 
  Database, FileSpreadsheet, Loader2, CheckCircle2, 
  AlertCircle, Sparkles, Save, RefreshCw, ChevronDown 
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  loadMasterCatalog, saveMasterCatalog, parseMasterCatalogCsv, 
  loadProductMappings, saveProductMappings, autoMapProducts,
  DEFAULT_MASTER_PRODUCTS
} from '../services/catalogMappingService';
import { cn } from '../lib/utils';

export default function CatalogMappingView() {
  const [masterCatalog, setMasterCatalog] = useState<string[]>(DEFAULT_MASTER_PRODUCTS);
  const [internalProducts, setInternalProducts] = useState<{ name: string; count: number }[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [catalogData, mappingsData, responsesSnap] = await Promise.all([
          loadMasterCatalog(),
          loadProductMappings(),
          getDocs(collection(db, 'responses'))
        ]);

        setMasterCatalog(catalogData);
        setMappings(mappingsData);

        // Extract all unique variantName ("Produkt" in UI) and their response counts
        const countMap: Record<string, number> = {};
        responsesSnap.docs.forEach(doc => {
          const data = doc.data();
          const name = data.variantName || 'Övriga';
          const cleanName = name === 'Generell' || name === 'Other' || name === 'Övriga' ? 'Övriga' : name;
          countMap[cleanName] = (countMap[cleanName] || 0) + 1;
        });

        // Also add some common default variants if list is empty
        if (Object.keys(countMap).length === 0) {
          ['Inkorgen', 'Journalen', 'Tidbokning', 'Listning', 'Stöd och behandling (SOB)', 'NPÖ', 'Övriga'].forEach(v => {
            countMap[v] = 0;
          });
        }

        const items = Object.entries(countMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        setInternalProducts(items);
      } catch (err: any) {
        console.error("Fel vid laddning av produktmappning:", err);
        setStatusMessage({ type: 'error', text: 'Kunde inte hämta produktkatalog eller mappningar.' });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedProducts = parseMasterCatalogCsv(text);
      setMasterCatalog(parsedProducts);
      await saveMasterCatalog(parsedProducts);
      setStatusMessage({ 
        type: 'success', 
        text: `Grundkatalogen har uppdaterats med ${parsedProducts.length} officiella produkter från CSV-filen.` 
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: 'Fel vid inläsning av CSV-fil.' });
    }
  };

  const handleRunAutoMapping = () => {
    setAutoMapping(true);
    setTimeout(() => {
      const internalNames = internalProducts.map(p => p.name);
      const newMappings = autoMapProducts(internalNames, masterCatalog, mappings);
      setMappings(newMappings);
      setAutoMapping(false);
      setStatusMessage({ 
        type: 'success', 
        text: 'Automatmappning har körts! Granska matchningarna nedan och tryck Spara för att tillämpa.' 
      });
    }, 400);
  };

  const handleSaveMappings = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await saveProductMappings(mappings);
      setStatusMessage({ type: 'success', text: 'Produktmappningarna har sparats och används nu vid export och synkronisering.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Kunde inte spara mappningar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetCatalogToDefault = async () => {
    try {
      setMasterCatalog(DEFAULT_MASTER_PRODUCTS);
      await saveMasterCatalog(DEFAULT_MASTER_PRODUCTS);
      setStatusMessage({ type: 'success', text: `Grundkatalogen har återställts till standardkatalogen (${DEFAULT_MASTER_PRODUCTS.length} produkter).` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Kunde inte återställa grundkatalogen.' });
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="animate-spin text-inera-primary-40 mx-auto mb-3" size={32} />
        <p className="text-sm text-inera-neutral-40 font-medium">Laddar masterkatalog och produktmappningar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold font-display text-inera-neutral-10 flex items-center gap-2">
              <Database size={22} className="text-inera-primary-40" />
              Koppla Produkter mot Grundkatalog
            </h2>
            <p className="text-sm text-inera-neutral-40 mt-1">
              Automatisera eller justera hur applikationens interna produktnamn mappar mot Ineras officiella grundkatalog vid JSON-export.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunAutoMapping}
              disabled={autoMapping}
              className="btn btn--m btn--secondary border border-inera-secondary-90 hover:bg-inera-secondary-95 flex items-center gap-2"
            >
              {autoMapping ? <Loader2 size={16} className="animate-spin text-inera-primary-40" /> : <Sparkles size={16} className="text-inera-primary-40" />}
              Kör automatmappning
            </button>
            <button
              onClick={handleSaveMappings}
              disabled={saving}
              className="btn btn--m btn--primary flex items-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Spara ändringar
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={cn(
            "p-4 rounded-lg mb-4 flex items-center gap-3 border text-sm font-bold",
            statusMessage.type === 'success' 
              ? "bg-inera-success-95 border-inera-success-40 text-inera-success-10"
              : "bg-inera-error-95 border-inera-error-40 text-inera-error-10"
          )}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Catalog summary and CSV loader */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-inera-secondary-95 p-4 rounded-xl border border-inera-secondary-90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-inera-secondary-90 flex items-center justify-center text-inera-primary-40">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-inera-neutral-40 uppercase tracking-wider">Aktiv Grundkatalog</p>
              <p className="text-sm font-bold text-inera-neutral-10">
                {masterCatalog.length} officiella produkter inlästa
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <label className="btn btn--s btn--secondary border border-inera-secondary-90 hover:bg-white cursor-pointer flex items-center gap-1.5 text-xs">
              <FileSpreadsheet size={14} />
              Läs in CSV-grundkatalog
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleCsvFileUpload}
                className="hidden" 
              />
            </label>
            <button
              onClick={handleResetCatalogToDefault}
              className="btn btn--s btn--tertiary text-xs hover:text-inera-primary-40"
              title="Återställ till standardkatalogen (71 Inera-produkter)"
            >
              <RefreshCw size={14} />
              Återställ
            </button>
          </div>
        </div>
      </div>

      {/* Mapping table card */}
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-inera-neutral-10">Produktmappningar</h3>
          <span className="text-xs font-bold text-inera-neutral-40">
            {Object.keys(mappings).length} av {internalProducts.length} produkter mappade
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-inera-secondary-90 text-xs font-bold text-inera-neutral-40 uppercase tracking-wider">
                <th className="pb-3 px-3">Internt Produktnamn</th>
                <th className="pb-3 px-3">Antal Svar</th>
                <th className="pb-3 px-3">Mappa mot Officiell Produkt (Grundkatalog)</th>
                <th className="pb-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {internalProducts.map((item) => {
                const mappedValue = mappings[item.name] || '';
                const isMapped = Boolean(mappedValue && masterCatalog.includes(mappedValue));

                return (
                  <tr 
                    key={item.name} 
                    className="border-b border-inera-secondary-95 last:border-0 hover:bg-inera-secondary-95/40 transition-colors"
                  >
                    <td className="py-3 px-3 text-sm font-bold text-inera-neutral-10">
                      {item.name}
                    </td>
                    <td className="py-3 px-3 text-sm font-semibold text-inera-neutral-40">
                      {item.count} svar
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={mappedValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMappings(prev => {
                            const updated = { ...prev };
                            if (val) {
                              updated[item.name] = val;
                            } else {
                              delete updated[item.name];
                            }
                            return updated;
                          });
                        }}
                        className="w-full max-w-md px-3 py-1.5 bg-white border border-inera-secondary-90 rounded-lg text-sm font-semibold text-inera-neutral-10 focus:outline-none focus:ring-2 focus:ring-inera-primary-40/30"
                      >
                        <option value="">-- Ingen mappning (behåll internt namn) --</option>
                        {[...masterCatalog].sort((a, b) => a.localeCompare(b, 'sv')).map(masterProd => (
                          <option key={masterProd} value={masterProd}>
                            {masterProd}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      {isMapped ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-inera-success-95 text-inera-success-10 border border-inera-success-40">
                          <CheckCircle2 size={12} />
                          Mappad
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-inera-secondary-95 text-inera-neutral-40 border border-inera-secondary-90">
                          Ej mappad
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
