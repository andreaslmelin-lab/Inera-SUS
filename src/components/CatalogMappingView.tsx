import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, FileSpreadsheet, Loader2, CheckCircle2, 
  AlertCircle, Sparkles, Save, RefreshCw, ChevronDown,
  Search, X, Check
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
          {(() => {
            const mappedCount = Object.keys(mappings).filter(k => Boolean(mappings[k] && masterCatalog.includes(mappings[k]))).length;
            const activeResponsesCount = internalProducts.filter(p => p.count > 0).length;
            return (
              <span className="text-xs font-bold text-inera-neutral-40">
                {mappedCount} av {masterCatalog.length} produkter mappade, {activeResponsesCount} med aktiva svar
              </span>
            );
          })()}
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
                      <SearchableDropdown
                        value={mappedValue}
                        options={masterCatalog}
                        onChange={(val) => {
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
                        placeholder="-- Sök och välj produkt --"
                      />
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

// ===============================================================
// SearchableDropdown Component (A-Ö sorted, search-enabled)
// ===============================================================
interface SearchableDropdownProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

function SearchableDropdown({ value, options, onChange, placeholder = "-- Välj produkt --" }: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter and sort options A-Ö (Swedish sorting 'sv')
  const sortedFilteredOptions = [...options]
    .sort((a, b) => a.localeCompare(b, 'sv'))
    .filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative w-full max-w-md" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchTerm(''); // Clear search when opening
        }}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 bg-white border rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-inera-primary-40/30 text-left",
          value ? "border-inera-secondary-90 text-inera-neutral-10" : "border-inera-secondary-90 text-inera-neutral-40"
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation(); // Prevent opening dropdown
                onChange('');
              }}
              className="p-0.5 rounded-full hover:bg-inera-secondary-95 text-inera-neutral-40 hover:text-inera-neutral-20 transition-colors"
              title="Rensa val"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className={cn("text-inera-neutral-40 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 bg-white border border-inera-secondary-90 rounded-lg shadow-xl max-h-64 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Input Box */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-inera-secondary-95 bg-inera-secondary-95/30 shrink-0">
            <Search size={14} className="text-inera-neutral-40 shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent border-0 p-0 text-sm font-medium text-inera-neutral-10 focus:outline-none focus:ring-0 placeholder-inera-neutral-40"
              placeholder="Sök i grundkatalogen (A-Ö)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()} // Stop propagation to avoid closing dropdown
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                }}
                className="p-0.5 rounded-full hover:bg-inera-secondary-95 text-inera-neutral-40"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="overflow-y-auto flex-1 py-1 max-h-48 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-xs font-bold transition-colors hover:bg-inera-secondary-95 border-b border-inera-secondary-95/50",
                !value ? "text-inera-primary-40 bg-inera-primary-40/5" : "text-inera-neutral-40"
              )}
            >
              -- Ingen mappning (behåll internt namn) --
            </button>

            {sortedFilteredOptions.length > 0 ? (
              sortedFilteredOptions.map((opt) => {
                const isSelected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm font-semibold transition-colors flex items-center justify-between",
                      isSelected 
                        ? "text-inera-primary-40 bg-inera-primary-40/5 font-bold" 
                        : "text-inera-neutral-10 hover:bg-inera-secondary-95/80"
                    )}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && <Check size={14} className="text-inera-primary-40 shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-xs text-center text-inera-neutral-40 font-medium">
                Hittade inga produkter
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
