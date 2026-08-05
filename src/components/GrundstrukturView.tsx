// src/components/GrundstrukturView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, 
  Search, Edit2, Trash2, Plus, X, Check, ArrowUpDown 
} from 'lucide-react';
import { 
  GrundstrukturService, 
  parseGrundstrukturCsv, 
  IneraStructureProduct 
} from '../services/grundstrukturService';
import { triggerSusMetricsSync } from '../services/syncService';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';

export default function GrundstrukturView() {
  const [products, setProducts] = useState<IneraStructureProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Filtering states
  const [selectedTrain, setSelectedTrain] = useState('Alla');
  const [selectedTeam, setSelectedTeam] = useState('Alla');

  // Edit/Add Modal states
  const [editingProduct, setEditingProduct] = useState<Partial<IneraStructureProduct> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<IneraStructureProduct>>({
    id: '',
    name: '',
    teamId: 'team-omappat',
    teamName: 'Omappat team',
    trainId: 'train-omappade',
    trainName: 'Omappade',
    uxLead: '',
    rte: '',
    maturity: 0,
    susScore: undefined,
    idsVersion: '',
    comment: ''
  });

  // Subscribe to products list
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Only keep items that are parsed or have structural metadata
      setProducts(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Kunde inte läsa in produktkatalogen.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // CSV File Ingestion Handler
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        if (!text) throw new Error('Filen kunde inte läsas.');

        // Parse CSV to Product Structure
        const parsedProducts = parseGrundstrukturCsv(text);
        
        if (parsedProducts.length === 0) {
          throw new Error('Hittade inga giltiga produkter i CSV-filen.');
        }

        // Save to Firestore
        await GrundstrukturService.saveStructure(parsedProducts);
        
        setSuccessMsg(`Lyckades läsa in och uppdatera ${parsedProducts.length} produkter i grundstrukturen!`);
        
        // Trigger background sync to dashboard
        await triggerSusMetricsSync();
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Ett fel uppstod vid bearbetning av CSV-filen.');
      } finally {
        setIsUploading(false);
        // Reset file input value
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      setError('Ett fel uppstod vid inläsning av filen.');
      setIsUploading(false);
    };

    reader.readAsText(file, 'ISO-8859-1'); // Handles Swedish characters correctly
  };

  // Get unique Trains and Teams for filtering
  const trains = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.trainName) set.add(p.trainName);
    });
    return ['Alla', ...Array.from(set).sort()];
  }, [products]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.teamName) {
        if (selectedTrain === 'Alla' || p.trainName === selectedTrain) {
          set.add(p.teamName);
        }
      }
    });
    return ['Alla', ...Array.from(set).sort()];
  }, [products, selectedTrain]);

  // Filtered list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase()) ||
        (p.uxLead && p.uxLead.toLowerCase().includes(search.toLowerCase())) ||
        (p.teamName && p.teamName.toLowerCase().includes(search.toLowerCase()));
      
      const matchesTrain = selectedTrain === 'Alla' || p.trainName === selectedTrain;
      const matchesTeam = selectedTeam === 'Alla' || p.teamName === selectedTeam;

      return matchesSearch && matchesTrain && matchesTeam;
    });
  }, [products, search, selectedTrain, selectedTeam]);

  // Edit Submit Handler
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.id) return;

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await GrundstrukturService.saveProduct(editingProduct);
      setSuccessMsg(`Produkt "${editingProduct.name}" har sparats.`);
      setEditingProduct(null);
      // Background sync
      await triggerSusMetricsSync();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Kunde inte spara produkten.');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Submit Handler
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.id || !newProduct.name) {
      setError('ID och Namn är obligatoriska fält.');
      return;
    }

    // Ensure ID starts with prod-
    let cleanId = newProduct.id.trim().toLowerCase();
    if (!cleanId.startsWith('prod-')) {
      cleanId = `prod-${cleanId}`;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const productToAdd: IneraStructureProduct = {
        id: cleanId,
        name: newProduct.name.trim(),
        type: 'product',
        teamId: newProduct.teamId || 'team-omappat',
        teamName: newProduct.teamName || 'Omappat team',
        trainId: newProduct.trainId || 'train-omappade',
        trainName: newProduct.trainName || 'Omappade',
        uxLead: newProduct.uxLead || '',
        rte: newProduct.rte || '',
        maturity: newProduct.maturity ?? 0,
        susScore: newProduct.susScore,
        idsVersion: newProduct.idsVersion || '',
        comment: newProduct.comment || ''
      };

      await GrundstrukturService.saveProduct(productToAdd);
      setSuccessMsg(`Produkten "${productToAdd.name}" har skapats framgångsrikt.`);
      setShowAddForm(false);
      // Reset form
      setNewProduct({
        id: '',
        name: '',
        teamId: 'team-omappat',
        teamName: 'Omappat team',
        trainId: 'train-omappade',
        trainName: 'Omappade',
        uxLead: '',
        rte: '',
        maturity: 0,
        susScore: undefined,
        idsVersion: '',
        comment: ''
      });
      // Background sync
      await triggerSusMetricsSync();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Kunde inte lägga till produkten.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete product
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Är du säker på att du vill ta bort produkten "${name}" från grundstrukturen? Det raderar inte historiska mätningar men tar bort den från katalogen.`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);
    try {
      await GrundstrukturService.deleteProduct(id);
      setSuccessMsg(`Produkt "${name}" raderades.`);
      await triggerSusMetricsSync();
    } catch (err: any) {
      console.error(err);
      setError('Kunde inte radera produkten.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action block: Upload CSV & Manual creation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSV Ingestion Panel */}
        <div className="card p-6 shadow-sm border-inera-secondary-90 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-inera-primary-95 rounded-lg text-inera-primary-40">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-inera-neutral-10">Läs in Inera Grundstruktur (CSV)</h3>
              <p className="text-xs text-inera-neutral-40">Importera eller uppdatera tjänster, tåg, och team via officiella matris-CSV-filer.</p>
            </div>
          </div>

          <div className="relative border-2 border-dashed border-inera-secondary-90 rounded-xl p-6 text-center hover:border-inera-primary-40 transition-colors group cursor-pointer">
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleCsvUpload}
              disabled={isUploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="animate-spin text-inera-primary-40" size={28} />
                <p className="text-xs font-bold text-inera-neutral-30">Importerar och matchar relationer...</p>
              </div>
            ) : (
              <div className="py-2">
                <FileSpreadsheet className="mx-auto mb-2 text-inera-neutral-60 group-hover:text-inera-primary-40 transition-colors" size={32} />
                <p className="text-xs font-bold text-inera-neutral-20">Klicka eller dra hit CSV-fil</p>
                <p className="text-[10px] text-inera-neutral-40 mt-1">Semicolonseparerad, ISO-8859-1 encoding</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick info/help panel */}
        <div className="card p-6 shadow-sm border-inera-secondary-90 bg-[#fbf9f7]">
          <h3 className="text-xs font-black uppercase tracking-wider text-inera-primary-40 mb-3">Struktur & ID-matchning</h3>
          <div className="text-xs text-inera-neutral-25 space-y-2.5">
            <p>
              Genom att hålla denna produktkatalog uppdaterad matchas mätningar som kommer in med till exempel käll-id 
              <code className="bg-white px-1.5 py-0.5 rounded border border-inera-secondary-80 font-mono text-[10px] mx-1">prod-1177-journal</code>
              direkt utan att ni behöver konfigurera manuella mappningsregler.
            </p>
            <p>
              Varje produkt lagrar referens till sitt tåg, sitt team, sin mognadsnivå och sin SUS-poäng från grundstrukturen.
            </p>
            <div className="pt-1">
              <button 
                onClick={() => setShowAddForm(true)}
                className="btn btn--s btn--primary"
              >
                <Plus size={14} />
                Skapa produkt manuellt
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alert status blocks */}
      {error && (
        <div className="alert alert--error" role="status">
          <AlertCircle className="alert-icon" size={20} />
          <div className="alert-body">
            <div className="alert-title">Fel vid hantering</div>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="alert alert--success" role="status">
          <CheckCircle2 className="alert-icon" size={20} />
          <div className="alert-body">
            <div className="alert-title">Hantering utförd</div>
            <p className="text-xs">{successMsg}</p>
          </div>
        </div>
      )}

      {/* Filters and search box */}
      <div className="card p-4 shadow-sm border-inera-secondary-90 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-inera-neutral-60" size={16} />
            <input 
              type="text" 
              placeholder="Sök på produkt, id, ux ansvarig..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>

          {/* Train filter */}
          <div>
            <select 
              value={selectedTrain} 
              onChange={(e) => {
                setSelectedTrain(e.target.value);
                setSelectedTeam('Alla');
              }}
              className="select w-full"
            >
              <option value="Alla">Filtrera på Tåg: Alla</option>
              {trains.filter(t => t !== 'Alla').map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Team filter */}
          <div>
            <select 
              value={selectedTeam} 
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="select w-full"
            >
              <option value="Alla">Filtrera på Team: Alla</option>
              {teams.filter(t => t !== 'Alla').map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Base Structure Table */}
      <div className="card p-0 shadow-sm overflow-hidden border-inera-secondary-90 bg-white">
        <div className="p-4 border-b border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-between">
          <h3 className="text-sm font-bold text-inera-neutral-10 uppercase tracking-wide">
            Inläst Grundstruktur ({filteredProducts.length} tjänster)
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="animate-spin text-inera-primary-40 mx-auto mb-2" size={32} />
            <p className="text-xs text-inera-neutral-40">Läser in struktur från databasen...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-inera-neutral-40 text-xs">
            Inga produkter matchar sökningen eller filtren.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="border-b border-inera-secondary-90 text-[11px] uppercase tracking-wider font-bold text-inera-neutral-40 bg-[#faf9f7]/50">
                  <th className="py-3 px-4 font-bold">Produkt ID / Namn</th>
                  <th className="py-3 px-4 font-bold">Kopplat Tåg</th>
                  <th className="py-3 px-4 font-bold">Kopplat Team</th>
                  <th className="py-3 px-4 font-bold">UX Ansvarig / RTE</th>
                  <th className="py-3 px-4 font-bold text-center">Mognad (0-5)</th>
                  <th className="py-3 px-4 font-bold text-center">SUS Betyg</th>
                  <th className="py-3 px-4 font-bold">IDS Version</th>
                  <th className="py-3 px-4 font-bold text-right">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inera-secondary-95">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-inera-secondary-95/40 text-xs">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-inera-neutral-15">{p.name}</div>
                      <div className="font-mono text-[9px] text-inera-neutral-50 mt-0.5">{p.id}</div>
                    </td>
                    <td className="py-3.5 px-4 text-inera-neutral-25">
                      {p.trainName || <span className="text-inera-neutral-50 italic">Ingen</span>}
                    </td>
                    <td className="py-3.5 px-4 text-inera-neutral-25">
                      {p.teamName || <span className="text-inera-neutral-50 italic">Ingen</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.uxLead ? (
                        <div className="text-inera-neutral-15">{p.uxLead}</div>
                      ) : (
                        <span className="text-inera-neutral-60 italic text-[10px]">Ej angiven</span>
                      )}
                      {p.rte && <div className="text-[10px] text-inera-neutral-50 mt-0.5 font-mono">{p.rte}</div>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-1.5 py-0.5 bg-inera-secondary-90 text-inera-neutral-15 font-bold rounded">
                        {p.maturity ?? 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {p.susScore !== undefined && p.susScore !== null ? (
                        <span className={cn(
                          "px-1.5 py-0.5 font-bold rounded",
                          p.susScore >= 80 ? "bg-inera-success-95 text-inera-success-40" :
                          p.susScore >= 68 ? "bg-inera-info-95 text-inera-info-40" :
                          p.susScore >= 51 ? "bg-inera-attention-95 text-inera-attention-40" :
                          "bg-inera-error-95 text-inera-error-40"
                        )}>
                          {p.susScore}
                        </span>
                      ) : (
                        <span className="text-inera-neutral-60 italic text-[10px]">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-inera-neutral-30">
                      {p.idsVersion || <span className="text-inera-neutral-60 italic text-[10px]">-</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => setEditingProduct(p)}
                          className="p-1.5 text-inera-neutral-40 hover:text-inera-primary-40 hover:bg-inera-primary-95 rounded-lg transition-colors"
                          title="Redigera"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id, p.name)}
                          className="p-1.5 text-inera-neutral-40 hover:text-inera-error-40 hover:bg-inera-error-95 rounded-lg transition-colors"
                          title="Radera"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="card p-0 shadow-xl max-w-xl w-full overflow-hidden border-inera-secondary-90 bg-white">
            <div className="p-5 border-b border-inera-secondary-90 flex items-center justify-between bg-inera-secondary-95">
              <h3 className="font-bold text-inera-neutral-10">Redigera Tjänst i Grundstruktur</h3>
              <button 
                onClick={() => setEditingProduct(null)}
                className="p-1 hover:bg-inera-secondary-90 rounded-full text-inera-neutral-40"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Produkt ID (Kan ej ändras)</label>
                  <input 
                    type="text" 
                    value={editingProduct.id} 
                    disabled 
                    className="input w-full bg-inera-secondary-95 font-mono text-xs" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Namn *</label>
                    <input 
                      type="text" 
                      required
                      value={editingProduct.name || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">UX Ansvarig</label>
                    <input 
                      type="text" 
                      value={editingProduct.uxLead || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, uxLead: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Tåg Namn</label>
                    <input 
                      type="text" 
                      value={editingProduct.trainName || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, trainName: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Tåg ID</label>
                    <input 
                      type="text" 
                      value={editingProduct.trainId || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, trainId: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Team Namn</label>
                    <input 
                      type="text" 
                      value={editingProduct.teamName || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, teamName: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Team ID</label>
                    <input 
                      type="text" 
                      value={editingProduct.teamId || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, teamId: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">UX Mognadsnivå</label>
                    <input 
                      type="number" 
                      min="0"
                      max="5"
                      value={editingProduct.maturity ?? 0} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, maturity: parseInt(e.target.value, 10) || 0 })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">SUS Poäng</label>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      step="0.1"
                      value={editingProduct.susScore ?? ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, susScore: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">IDS Version</label>
                    <input 
                      type="text" 
                      value={editingProduct.idsVersion || ''} 
                      onChange={(e) => setEditingProduct({ ...editingProduct, idsVersion: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-inera-neutral-30 mb-1">RTE</label>
                  <input 
                    type="text" 
                    value={editingProduct.rte || ''} 
                    onChange={(e) => setEditingProduct({ ...editingProduct, rte: e.target.value })}
                    className="input w-full text-xs" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Kommentar</label>
                  <textarea 
                    rows={2}
                    value={editingProduct.comment || ''} 
                    onChange={(e) => setEditingProduct({ ...editingProduct, comment: e.target.value })}
                    className="textarea w-full text-xs" 
                  />
                </div>
              </div>

              <div className="p-4 border-t border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  disabled={isSaving}
                  className="btn btn--m btn--tertiary"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn--m btn--primary"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Spara ändringar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="card p-0 shadow-xl max-w-xl w-full overflow-hidden border-inera-secondary-90 bg-white">
            <div className="p-5 border-b border-inera-secondary-90 flex items-center justify-between bg-inera-secondary-95">
              <h3 className="font-bold text-inera-neutral-10">Lägg till ny produkt i Grundstrukturen</h3>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-inera-secondary-90 rounded-full text-inera-neutral-40"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Produkt ID *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="t.ex. prod-1177-journal"
                    value={newProduct.id || ''} 
                    onChange={(e) => setNewProduct({ ...newProduct, id: e.target.value })}
                    className="input w-full text-xs font-mono" 
                  />
                  <p className="text-[10px] text-inera-neutral-50 mt-1">ID sparas alltid med prefixet "prod-" i gemener.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Namn *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="t.ex. 1177 Journal"
                      value={newProduct.name || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">UX Ansvarig</label>
                    <input 
                      type="text" 
                      placeholder="t.ex. Sofia Lönnberg"
                      value={newProduct.uxLead || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, uxLead: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Tåg Namn</label>
                    <input 
                      type="text" 
                      placeholder="t.ex. 1177"
                      value={newProduct.trainName || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, trainName: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Tåg ID</label>
                    <input 
                      type="text" 
                      placeholder="t.ex. train-1177"
                      value={newProduct.trainId || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, trainId: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Team Namn</label>
                    <input 
                      type="text" 
                      placeholder="t.ex. K3 HLT"
                      value={newProduct.teamName || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, teamName: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Team ID</label>
                    <input 
                      type="text" 
                      placeholder="t.ex. team-k3-hlt"
                      value={newProduct.teamId || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, teamId: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">UX Mognadsnivå</label>
                    <input 
                      type="number" 
                      min="0"
                      max="5"
                      value={newProduct.maturity ?? 0} 
                      onChange={(e) => setNewProduct({ ...newProduct, maturity: parseInt(e.target.value, 10) || 0 })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">SUS Poäng</label>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="Betyg i grundstruktur"
                      value={newProduct.susScore ?? ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, susScore: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="input w-full text-xs" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-inera-neutral-30 mb-1">IDS Version</label>
                    <input 
                      type="text" 
                      placeholder="t.ex. Ej IDS"
                      value={newProduct.idsVersion || ''} 
                      onChange={(e) => setNewProduct({ ...newProduct, idsVersion: e.target.value })}
                      className="input w-full text-xs" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-inera-neutral-30 mb-1">RTE</label>
                  <input 
                    type="text" 
                    placeholder="rte-epost@inera.se"
                    value={newProduct.rte || ''} 
                    onChange={(e) => setNewProduct({ ...newProduct, rte: e.target.value })}
                    className="input w-full text-xs" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-inera-neutral-30 mb-1">Kommentar</label>
                  <textarea 
                    rows={2}
                    placeholder="Skriv kommentar eller anteckning..."
                    value={newProduct.comment || ''} 
                    onChange={(e) => setNewProduct({ ...newProduct, comment: e.target.value })}
                    className="textarea w-full text-xs" 
                  />
                </div>
              </div>

              <div className="p-4 border-t border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  disabled={isSaving}
                  className="btn btn--m btn--tertiary"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn--m btn--primary"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Skapa produkt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
