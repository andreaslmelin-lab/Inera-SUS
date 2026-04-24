import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, Cell, PieChart, Pie
} from 'recharts';
import { 
  Upload, LayoutDashboard, Database, LogOut, ChevronRight, 
  TrendingUp, Users, MessageSquare, Filter, FileSpreadsheet,
  AlertCircle, CheckCircle2, Loader2, Search, ArrowLeft,
  Info, Calendar, ArrowUpRight, ArrowDownRight, Trash2, Settings
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, User, db } from './firebase';
import { Product, ProductService, Measurement, MeasurementService, ResponseData, Variant } from './services';
import { cn, getSusGrade, calculateMedian, getMedianExplanation } from './lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2.5 rounded text-sm font-semibold transition-colors duration-150 border",
      active 
        ? "bg-white text-inera-primary-40 border-inera-secondary-90 shadow-sm" 
        : "text-inera-primary-30 border-transparent hover:bg-inera-secondary-90"
    )}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, subValue, color, trend }: any) => (
  <div className="card p-6 shadow-sm flex items-start gap-4 border-inera-secondary-90">
    <div className={cn("p-3 rounded-lg", color)}>
      <Icon size={24} className="text-white" />
    </div>
    <div className="flex-1">
      <p className="text-sm text-inera-neutral-40 font-medium">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-bold text-inera-neutral-10 mt-1">{value}</h3>
        {trend && (
          <span className={cn(
            "text-xs font-bold flex items-center gap-0.5",
            trend > 0 ? "text-inera-success-40" : "text-inera-error-40"
          )}>
            {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      {subValue && <p className="text-xs text-inera-neutral-60 mt-1">{subValue}</p>}
    </div>
  </div>
);

const SusLegend = () => (
  <div className="card shadow-sm flex flex-wrap gap-6 items-center justify-between text-sm border-inera-secondary-90 py-3">
    <div className="flex flex-wrap gap-6 items-center">
      <span className="font-bold text-inera-neutral-20">SUS Betygsskala:</span>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-success-50"></span>≥ 80.3 (Utmärkt)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-info-50"></span>68 - 80.2 (Bra)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-attention-50"></span>51 - 67.9 (Godkänd)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-error-50"></span>&lt; 51 (Underkänd)</div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload'>('dashboard');
  const [view, setView] = useState<'company' | 'product'>('company');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string>('Alla');
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [latestMeasurements, setLatestMeasurements] = useState<Measurement[]>([]);
  const [allMeasurements, setAllMeasurements] = useState<Measurement[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>('all');
  const [uploadProductId, setUploadProductId] = useState<string>('');
  
  // Advanced Filters
  const [susRange, setSusRange] = useState<{ min: number; max: number }>({ min: 0, max: 100 });
  const [categoryFilter, setCategoryFilter] = useState<string>('Alla');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'score'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [variantSort, setVariantSort] = useState<{ key: 'name' | 'score'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [distributionView, setDistributionView] = useState<'bar' | 'box'>('bar');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [measurementToDelete, setMeasurementToDelete] = useState<Measurement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const overallLatestDate = useMemo(() => {
    if (products.length === 0) return undefined;
    const dates = products
      .map(p => p.latest?.date)
      .filter(Boolean) as Date[];
    if (dates.length === 0) return undefined;
    return format(new Date(Math.max(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
  }, [products]);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: 'user'
          });
        }
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Initial Data
  useEffect(() => {
    if (user) {
      const unsubProducts = ProductService.getAllProducts(setProducts);
      const unsubMeasurements = MeasurementService.getAllMeasurements(setAllMeasurements);
      return () => {
        unsubProducts();
        unsubMeasurements();
      };
    }
  }, [user]);

  // Measurements for selected product
  useEffect(() => {
    if (selectedProductId) {
      const unsub = MeasurementService.getMeasurements(selectedProductId, setMeasurements);
      ProductService.getVariants(selectedProductId).then(vars => {
        // Map "Generell" to "Övriga" and ensure unique names
        const mapped = vars.map(v => ({
          ...v,
          name: v.name === 'Generell' || v.name === 'Other' ? 'Övriga' : v.name
        }));
        const unique = Array.from(new Map(mapped.map(v => [v.name, v])).values());
        setVariants(unique);
      });
      return unsub;
    }
  }, [selectedProductId]);

  // Responses for selected measurement
  useEffect(() => {
    if (selectedMeasurementId === 'all' && selectedProductId) {
      const unsub = MeasurementService.getResponsesByProduct(selectedProductId, setResponses);
      return unsub;
    }

    let mId = '';
    if (selectedMeasurementId !== 'latest' && selectedMeasurementId !== 'all') {
      mId = selectedMeasurementId;
    } else if (measurements.length > 0) {
      mId = measurements[0].id;
    }

    if (mId) {
      const unsub = MeasurementService.getResponses(mId, setResponses);
      return unsub;
    } else {
      setResponses([]);
    }
  }, [measurements, selectedMeasurementId, selectedProductId]);

  // Company Stats
  useEffect(() => {
    if (user && view === 'company') {
      if (selectedMeasurementId === 'latest') {
        MeasurementService.getLatestMeasurementsForAllProducts().then(setLatestMeasurements);
      } else if (selectedMeasurementId === 'all') {
        setLatestMeasurements(allMeasurements);
      } else {
        const m = allMeasurements.find(m => m.id === selectedMeasurementId);
        if (m) {
          setLatestMeasurements([m]);
        }
      }
    }
  }, [user, view, products, selectedMeasurementId, allMeasurements]);

  const companyStats = useMemo(() => {
    if (latestMeasurements.length === 0) return { avg: 0, totalResponses: 0 };
    
    if (selectedMeasurementId === 'all') {
      // Group by product to get the average of product averages
      const productGroups: Record<string, { sum: number, count: number, totalResponses: number }> = {};
      latestMeasurements.forEach(m => {
        if (!productGroups[m.productId]) productGroups[m.productId] = { sum: 0, count: 0, totalResponses: 0 };
        productGroups[m.productId].sum += m.averageScore;
        productGroups[m.productId].count++;
        productGroups[m.productId].totalResponses += m.responseCount;
      });
      
      const productAverages = Object.values(productGroups).map(g => g.sum / g.count);
      const totalResponses = Object.values(productGroups).reduce((acc, g) => acc + g.totalResponses, 0);
      const avg = productAverages.length > 0 ? productAverages.reduce((acc, v) => acc + v, 0) / productAverages.length : 0;
      
      return {
        avg: Math.round(avg * 10) / 10,
        totalResponses
      };
    } else {
      const totalResponses = latestMeasurements.reduce((acc, m) => acc + m.responseCount, 0);
      const sumOfAverages = latestMeasurements.reduce((acc, m) => acc + m.averageScore, 0);
      return { 
        avg: Math.round((sumOfAverages / latestMeasurements.length) * 10) / 10, 
        totalResponses 
      };
    }
  }, [latestMeasurements, selectedMeasurementId]);

  const boxStats = useMemo(() => {
    if (responses.length === 0) return null;
    
    const calculateStats = (data: ResponseData[]) => {
      const scores = data.map(r => r.susScore).sort((a, b) => a - b);
      const n = scores.length;
      const median = n % 2 !== 0 ? scores[Math.floor(n / 2)] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
      const q1 = scores[Math.floor(n / 4)];
      const q3 = scores[Math.floor(3 * n / 4)];
      return {
        name: selectedVariant === 'Alla' ? 'Hela produkten' : selectedVariant,
        min: scores[0],
        max: scores[n - 1],
        median,
        q1,
        q3,
        q1_diff: q1 - scores[0],
        median_diff: median - q1,
        q3_diff: q3 - median,
        max_diff: scores[n - 1] - q3
      };
    };

    if (selectedVariant === 'Alla') {
      return calculateStats(responses);
    } else {
      const variantResponses = responses.filter(r => r.variantName === selectedVariant);
      if (variantResponses.length === 0) return null;
      return calculateStats(variantResponses);
    }
  }, [responses, selectedVariant]);
  const handleLogin = () => signInWithPopup(auth, googleProvider);
  const handleLogout = () => auth.signOut();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    const pId = uploadProductId || '1177';

    setIsUploading(true);
    setUploadStatus(null);
    try {
      const finalPId = await ProductService.ensureProduct(pId);
      await MeasurementService.uploadCsv(file, finalPId, user.uid);
      setUploadStatus({ type: 'success', msg: 'Mätningen har laddats upp!' });
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: err.message || 'Ett fel uppstod vid uppladdning.' });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredResponses = useMemo(() => {
    if (selectedVariant === 'Alla') return responses;
    return responses.filter(r => {
      const mappedName = r.variantName === 'Generell' || r.variantName === 'Other' ? 'Övriga' : r.variantName;
      return mappedName === selectedVariant;
    });
  }, [responses, selectedVariant]);

  const averageSus = useMemo(() => {
    if (filteredResponses.length === 0) return 0;
    return filteredResponses.reduce((acc, r) => acc + r.susScore, 0) / filteredResponses.length;
  }, [filteredResponses]);

  const trendData = useMemo(() => {
    return [...measurements].reverse().map(m => ({
      date: format(m.date, 'MMM yyyy', { locale: sv }),
      score: Math.round(m.averageScore * 10) / 10
    }));
  }, [measurements]);

  const distributionData = useMemo(() => {
    const bins = [
      { name: '< 51 (F)', count: 0, color: '#ef4444' },
      { name: '51-67 (C)', count: 0, color: '#eab308' },
      { name: '68-80 (B)', count: 0, color: '#3b82f6' },
      { name: '≥ 81 (A)', count: 0, color: '#10b981' },
    ];
    filteredResponses.forEach(r => {
      if (r.susScore < 51) bins[0].count++;
      else if (r.susScore < 68) bins[1].count++;
      else if (r.susScore < 80.3) bins[2].count++;
      else bins[3].count++;
    });
    return bins;
  }, [filteredResponses]);

  const filteredProducts = useMemo(() => {
    let result = products.map(p => {
      if (selectedMeasurementId === 'all') {
        const productMeasurements = allMeasurements.filter(m => m.productId === p.id);
        if (productMeasurements.length === 0) return { ...p, latest: undefined };
        
        const totalResponses = productMeasurements.reduce((acc, m) => acc + m.responseCount, 0);
        const avgScore = productMeasurements.reduce((acc, m) => acc + (m.averageScore * m.responseCount), 0) / totalResponses;
        
        return { 
          ...p, 
          latest: { 
            averageScore: avgScore, 
            responseCount: totalResponses,
            date: productMeasurements[0].date 
          } 
        } as any;
      } else {
        const latest = latestMeasurements.find(m => m.productId === p.id);
        return { ...p, latest };
      }
    });

    // Search term
    if (searchTerm) {
      result = result.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Category filter (simple implementation: name contains category)
    if (categoryFilter !== 'Alla') {
      result = result.filter(p => p.name.includes(categoryFilter));
    }

    // SUS Range filter
    result = result.filter(p => {
      const score = p.latest?.averageScore ?? -1;
      if (score === -1) return susRange.min === 0; // Show products without data only if min is 0
      return score >= susRange.min && score <= susRange.max;
    });

    // Date Range filter
    if (dateRange.start || dateRange.end) {
      result = result.filter(p => {
        if (!p.latest) return false;
        const mDate = p.latest.date.toISOString().split('T')[0];
        if (dateRange.start && mDate < dateRange.start) return false;
        if (dateRange.end && mDate > dateRange.end) return false;
        return true;
      });
    }

    // Sorting
    result.sort((a, b) => {
      if (sortConfig.key === 'name') {
        return sortConfig.direction === 'asc' 
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else {
        const scoreA = a.latest?.averageScore ?? 0;
        const scoreB = b.latest?.averageScore ?? 0;
        return sortConfig.direction === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      }
    });

    return result;
  }, [products, searchTerm, latestMeasurements, susRange, categoryFilter, dateRange, sortConfig]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      const parts = p.name.split(' ');
      if (parts[0]) cats.add(parts[0]);
    });
    return ['Alla', ...Array.from(cats)];
  }, [products]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-inera-secondary-95">
        <Loader2 className="animate-spin text-inera-primary-40" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-inera-secondary-95 p-4">
        <div className="card p-8 shadow-xl max-w-md w-full text-center border-inera-secondary-90">
          <div className="bg-inera-primary-40 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-inera-primary-70">
            <Database className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-inera-neutral-10 mb-2">Inera SUS Tracker</h1>
          <p className="text-inera-neutral-40 mb-8">Logga in för att hantera och visualisera SUS-mätningar för Ineras produkter.</p>
          <button
            onClick={handleLogin}
            className="w-full btn btn--l btn--secondary border-inera-neutral-70 shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Logga in med Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-12">
      {/* Header */}
      <header className="bg-inera-primary-30 text-white px-6 py-8 border-b-4 border-inera-secondary-95">
        <div className="max-w-[80rem] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
              <Database className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display leading-tight text-white">Inera SUS</h1>
              <p className="text-white text-sm mt-1">Hantera och visualisera System Usability Scale-mätningar</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
               <p className="text-sm font-bold text-white">{user.displayName}</p>
               <p className="text-xs text-white">{user.email}</p>
             </div>
             <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=A33662&color=fff`} alt="" className="w-10 h-10 rounded-full border-2 border-inera-secondary-40" />
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="max-w-[80rem] mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-8 items-start">
        
        {/* Sidebar Nav */}
        <aside className="bg-inera-secondary-95 border border-inera-neutral-90 rounded-lg p-4 sticky top-8 space-y-6">
          <nav className="space-y-1">
            <h2 className="text-xs uppercase tracking-widest text-inera-neutral-40 font-bold mb-3 pl-2">Sektioner</h2>
            <SidebarItem 
              icon={LayoutDashboard} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => { setActiveTab('dashboard'); setView('company'); }} 
            />
            <SidebarItem 
              icon={Upload} 
              label="Ladda upp data" 
              active={activeTab === 'upload'} 
              onClick={() => setActiveTab('upload')} 
            />
          </nav>

          <div className="pt-4 border-t border-inera-secondary-90 space-y-2">
            {user.email === 'andreas.l.melin@gmail.com' && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full btn btn--s justify-start btn--destructive"
              >
                <Trash2 size={16} />
                Nollställ Katalog
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full btn btn--s justify-start btn--tertiary text-inera-neutral-40 hover:text-inera-error-40 hover:bg-inera-error-95"
            >
              <LogOut size={16} />
              Logga ut
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0">
          {activeTab === 'dashboard' && (
            <div className="bg-inera-secondary-95 border border-inera-neutral-90 rounded-lg p-4 mb-8 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-bold font-display text-inera-neutral-10">
                Dashboard
              </h2>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="label mb-0 whitespace-nowrap !text-sm">Mätning:</label>
                  <select 
                    value={selectedMeasurementId}
                    onChange={(e) => {
                      const mId = e.target.value;
                      setSelectedMeasurementId(mId);
                      if (mId !== 'latest' && mId !== 'all') {
                        const m = allMeasurements.find(am => am.id === mId);
                        if (m) {
                          setSelectedProductId(m.productId);
                          setView('product');
                        }
                      }
                    }}
                    className="select !h-8 !py-1 !text-sm w-auto min-w-[180px]"
                  >
                    <option value="all">Alla mätningar (Aggregerat)</option>
                    <option value="latest">Senaste mätning per produkt</option>
                    {allMeasurements.map(m => (
                      <option key={m.id} value={m.id}>
                        {format(m.date, 'yyyy-MM-dd HH:mm')} - {products.find(p => p.id === m.productId)?.name || m.productId}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="label mb-0 whitespace-nowrap !text-sm">Produkt:</label>
                  <select 
                    value={view === 'company' ? 'Alla' : selectedProductId || 'Alla'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'Alla') {
                        setView('company');
                        setSelectedProductId(null);
                        setSelectedVariant('Alla');
                        setSelectedMeasurementId('all');
                      } else {
                        setView('product');
                        setSelectedProductId(val);
                        setSelectedVariant('Alla');
                        if (selectedMeasurementId !== 'latest' && selectedMeasurementId !== 'all') {
                          const sm = allMeasurements.find(m => m.id === selectedMeasurementId);
                          if (sm && sm.productId !== val) {
                            setSelectedMeasurementId('latest');
                          }
                        }
                      }
                    }}
                    className="select !h-8 !py-1 !text-sm w-auto min-w-[150px]"
                  >
                    <option value="Alla">Alla produkter</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {view === 'product' && (
                  <div className="flex items-center gap-2">
                    <label className="label mb-0 whitespace-nowrap !text-sm">Variant:</label>
                    <select 
                      value={selectedVariant}
                      onChange={(e) => setSelectedVariant(e.target.value)}
                      className="select !h-8 !py-1 !text-sm w-auto min-w-[150px]"
                    >
                      <option value="Alla">Hela produkten</option>
                      {variants.map(v => (
                        <option key={v.id} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            {activeTab === 'dashboard' ? (
            <div className="space-y-8">
              {view === 'company' ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard 
                      icon={Database} 
                      label="Produkter" 
                      value={products.length} 
                      subValue="Aktiva i katalogen"
                      color="bg-inera-primary-40" 
                    />
                    <StatCard 
                      icon={TrendingUp} 
                      label="Inera Snitt" 
                      value={companyStats.avg || '-'} 
                      subValue={companyStats.avg ? getSusGrade(companyStats.avg).label : 'Ingen data'}
                      color="bg-inera-accent-40" 
                    />
                    <StatCard 
                      icon={Users} 
                      label="Totala svar" 
                      value={companyStats.totalResponses || '-'} 
                      subValue="Samtliga mätningar"
                      color="bg-inera-success-40" 
                    />
                  </div>

                  <SusLegend />

                  <div className="card p-0 shadow-sm overflow-hidden border-inera-secondary-90">
                    <div className="p-6 border-b border-inera-secondary-90 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-inera-neutral-10">Produktkatalog</h3>
                      <div className="text-xs text-inera-neutral-40 font-medium uppercase tracking-wider">
                        Visar {filteredProducts.length} av {products.length}
                      </div>
                    </div>
                    <div className="p-6 space-y-6">
                      {filteredProducts.map(p => (
                        <div key={p.id} className="space-y-3">
                          {/* Product Bar */}
                          <div 
                            className="flex items-center gap-4 cursor-pointer group"
                            onClick={() => { setSelectedProductId(p.id); setView('product'); }}
                          >
                            <div className="w-48 text-sm font-bold text-inera-neutral-10 truncate group-hover:text-inera-primary-40 transition-colors">
                              {p.name}
                            </div>
                            <div className="flex-1 h-8 bg-inera-secondary-90 rounded-full overflow-hidden relative">
                              {p.latest ? (
                                <>
                                  <div 
                                    className={cn("h-full transition-all duration-500", getSusGrade(p.latest.averageScore).bgClass)} 
                                    style={{ width: `${p.latest.averageScore}%` }} 
                                  />
                                  {/* Median marker */}
                                  {p.latest.medianScore !== undefined && (
                                    <div 
                                      className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.3)] z-10 rounded-full h-4 my-auto"
                                      style={{ left: `${p.latest.medianScore}%`, transform: 'translateX(-50%)' }}
                                      title={`Median: ${Math.round(p.latest.medianScore)}${getMedianExplanation(p.latest.averageScore, p.latest.medianScore) ? '\n\n' + getMedianExplanation(p.latest.averageScore, p.latest.medianScore) : ''}`}
                                    />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                    <span className="text-xs font-bold text-white drop-shadow-md">
                                      {Math.round(p.latest.averageScore)} SUS (Medel)
                                    </span>
                                    {p.latest.medianScore !== undefined && (
                                      <span 
                                        className="text-xs font-bold text-white drop-shadow-md opacity-90 pointer-events-auto cursor-help"
                                        title={getMedianExplanation(p.latest.averageScore, p.latest.medianScore)}
                                      >
                                        {Math.round(p.latest.medianScore)} (Median)
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="absolute inset-0 flex items-center px-3">
                                  <span className="text-xs font-bold text-inera-neutral-40 italic">Ingen mätning</span>
                                </div>
                              )}
                            </div>
                            <div className="w-16 text-right text-xs text-inera-neutral-40 font-bold">
                              {p.latest ? `${p.latest.responseCount} svar` : '-'}
                            </div>
                          </div>
                          
                          {/* Variant Bars */}
                          {p.latest?.variantScores && Object.keys(p.latest.variantScores).length > 0 && (
                            <div className="space-y-2 pl-6 border-l-2 border-inera-secondary-90 ml-2">
                              {Object.entries(
                                Object.entries(p.latest.variantScores).reduce((acc, [vName, vData]: [string, any]) => {
                                  const mappedName = vName === 'Generell' || vName === 'Other' ? 'Övriga' : vName;
                                  if (!acc[mappedName]) {
                                    acc[mappedName] = { ...vData };
                                  } else {
                                    const totalCount = acc[mappedName].count + vData.count;
                                    acc[mappedName].score = (acc[mappedName].score * acc[mappedName].count + vData.score * vData.count) / totalCount;
                                    acc[mappedName].count = totalCount;
                                  }
                                  return acc;
                                }, {} as Record<string, any>)
                              ).map(([vName, vData]: [string, any]) => (
                                <div key={vName} className="flex items-center gap-4">
                                  <div className="w-40 text-xs text-inera-neutral-40 truncate">
                                    {vName}
                                  </div>
                                  <div className="flex-1 h-5 bg-inera-secondary-90 rounded-full overflow-hidden relative">
                                    <div 
                                      className={cn("h-full transition-all duration-500", getSusGrade(vData.score).bgClass)} 
                                      style={{ width: `${vData.score}%` }} 
                                    />
                                    {/* Median marker */}
                                    {vData.median !== undefined && (
                                      <div 
                                        className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_2px_rgba(0,0,0,0.3)] z-10 rounded-full h-3 my-auto"
                                        style={{ left: `${vData.median}%`, transform: 'translateX(-50%)' }}
                                        title={`Median: ${Math.round(vData.median)}${getMedianExplanation(vData.score, vData.median) ? '\n\n' + getMedianExplanation(vData.score, vData.median) : ''}`}
                                      />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                                      <span className="text-[10px] font-bold text-white drop-shadow-md">
                                        {Math.round(vData.score)}
                                      </span>
                                      {vData.median !== undefined && (
                                        <span 
                                          className="text-[10px] font-bold text-white drop-shadow-md opacity-90 pointer-events-auto cursor-help"
                                          title={getMedianExplanation(vData.score, vData.median)}
                                        >
                                          Med: {Math.round(vData.median)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="w-16 text-right text-[10px] text-inera-neutral-40 font-bold">
                                    {vData.count} svar
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredProducts.length === 0 && (
                        <div className="py-12 text-center text-inera-neutral-40">
                          Inga produkter hittades.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Product View Content (existing) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard 
                      icon={TrendingUp} 
                      label="Snitt SUS" 
                      value={Math.round(averageSus * 10) / 10} 
                      subValue={`${getSusGrade(averageSus).label} • Median: ${Math.round(calculateMedian(filteredResponses.map(r => r.susScore)))}`}
                      color="bg-inera-primary-40" 
                      trend={measurements.length > 1 ? Math.round((measurements[0].averageScore - measurements[1].averageScore) * 10) / 10 : null}
                    />
                    <StatCard 
                      icon={Users} 
                      label="Antal svar" 
                      value={filteredResponses.length} 
                      subValue="Senaste mätningen"
                      color="bg-inera-accent-40" 
                    />
                    <StatCard 
                      icon={Filter} 
                      label="Variant" 
                      value={selectedVariant} 
                      subValue={`${variants.length} tillgängliga`}
                      color="bg-inera-success-40" 
                    />
                    <StatCard 
                      icon={FileSpreadsheet} 
                      label="Mätningar" 
                      value={measurements.length} 
                      subValue="Totalt i historiken"
                      color="bg-inera-info-40" 
                    />
                  </div>

                  <SusLegend />
                  {measurements[0]?.variantScores && Object.keys(measurements[0].variantScores).length > 0 && selectedVariant === 'Alla' && (
                    <div className="card p-6 shadow-sm border-inera-secondary-90">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-inera-neutral-10 flex items-center gap-2">
                          <Filter size={20} className="text-inera-success-40" />
                          SUS per Variant (Senaste mätningen)
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-inera-neutral-40 uppercase">Sortera:</span>
                          <select 
                            value={`${variantSort.key}-${variantSort.direction}`}
                            onChange={(e) => {
                              const [key, direction] = e.target.value.split('-') as [any, any];
                              setVariantSort({ key, direction });
                            }}
                            className="bg-inera-secondary-95 border border-inera-secondary-90 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                          >
                            <option value="name-asc">Namn A-Ö</option>
                            <option value="name-desc">Namn Ö-A</option>
                            <option value="score-desc">Högst poäng</option>
                            <option value="score-asc">Lägst poäng</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {Object.entries(
                          Object.entries(measurements[0].variantScores).reduce((acc, [vName, vData]: [string, any]) => {
                            const mappedName = vName === 'Generell' || vName === 'Other' ? 'Övriga' : vName;
                            if (!acc[mappedName]) {
                              acc[mappedName] = { ...vData };
                            } else {
                              const totalCount = acc[mappedName].count + vData.count;
                              acc[mappedName].score = (acc[mappedName].score * acc[mappedName].count + vData.score * vData.count) / totalCount;
                              acc[mappedName].count = totalCount;
                            }
                            return acc;
                          }, {} as Record<string, any>)
                        )
                          .sort(([aName, aData], [bName, bData]) => {
                            const a = aData as { score: number };
                            const b = bData as { score: number };
                            if (variantSort.key === 'name') {
                              return variantSort.direction === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
                            } else {
                              return variantSort.direction === 'asc' ? a.score - b.score : b.score - a.score;
                            }
                          })
                          .map(([vName, vData]: [string, any]) => {
                            const grade = getSusGrade(vData.score);
                            return (
                              <div key={vName} className={cn("p-4 rounded-xl border relative overflow-hidden group", grade.color)}>
                                <div className="relative z-10">
                                  <p className="text-xs font-bold uppercase tracking-wider mb-1 truncate" title={vName}>{vName}</p>
                                  <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-2xl font-black">{Math.round(vData.score)}</span>
                                    <span className="text-[10px] font-bold opacity-75">{vData.count} svar</span>
                                  </div>
                                  {vData.median !== undefined && (
                                    <div 
                                      className="text-[10px] font-bold opacity-90 flex items-center gap-1 cursor-help"
                                      title={getMedianExplanation(vData.score, vData.median)}
                                    >
                                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                      Median: {Math.round(vData.median)}
                                    </div>
                                  )}
                                </div>
                                {/* Visual score indicator background */}
                                <div 
                                  className="absolute bottom-0 left-0 h-3 bg-current opacity-60 transition-all duration-500" 
                                  style={{ width: `${vData.score}%` }} 
                                />
                                {vData.median !== undefined && (
                                  <div 
                                    className="absolute bottom-0 h-4 w-2.5 bg-white border-2 border-current shadow-[0_0_6px_rgba(0,0,0,0.4)] z-20 rounded-t-full" 
                                    style={{ left: `${vData.median}%`, transform: 'translateX(-50%)' }} 
                                    title={`Median: ${Math.round(vData.median)}${getMedianExplanation(vData.score, vData.median) ? '\n\n' + getMedianExplanation(vData.score, vData.median) : ''}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Charts Row 1 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="card p-6 shadow-sm border-inera-secondary-90">
                      <h3 className="text-lg font-bold text-inera-neutral-10 mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-inera-primary-40" />
                        SUS Utveckling över tid
                      </h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f6f1e9" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#A33662" 
                              strokeWidth={3} 
                              dot={{ r: 6, fill: '#A33662', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 8 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="card p-6 shadow-sm border-inera-secondary-90">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-inera-neutral-10 flex items-center gap-2">
                          <Users size={20} className="text-inera-accent-40" />
                          SUS Fördelning
                        </h3>
                        <div className="flex bg-inera-secondary-95 p-1 rounded-lg">
                          <button 
                            onClick={() => setDistributionView('bar')}
                            className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", distributionView === 'bar' ? "bg-white shadow-sm text-inera-primary-40" : "text-inera-neutral-40 hover:text-inera-neutral-20")}
                          >
                            Stapel
                          </button>
                          <button 
                            onClick={() => setDistributionView('box')}
                            className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", distributionView === 'box' ? "bg-white shadow-sm text-inera-primary-40" : "text-inera-neutral-40 hover:text-inera-neutral-20")}
                          >
                            Box-plot
                          </button>
                        </div>
                      </div>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          {distributionView === 'bar' ? (
                            <BarChart data={distributionData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f6f1e9" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                              <YAxis axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                              <Tooltip 
                                cursor={{fill: '#f9f6f1'}}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              />
                              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {distributionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          ) : (
                            <BarChart 
                              data={boxStats ? [boxStats] : []}
                              layout="vertical"
                            >
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f6f1e9" />
                              <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                              <YAxis type="category" dataKey="name" hide />
                              <Tooltip 
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="card p-4 shadow-xl border-inera-secondary-90 text-xs">
                                        <p className="font-bold mb-2 text-inera-neutral-10">{data.name}</p>
                                        <div className="space-y-1">
                                          <div className="flex justify-between gap-4"><span>Max:</span><span className="font-bold">{Math.round(data.max)}</span></div>
                                          <div className="flex justify-between gap-4"><span>Q3:</span><span className="font-bold">{Math.round(data.q3)}</span></div>
                                          <div className="flex justify-between gap-4 text-inera-primary-40"><span>Median:</span><span className="font-bold">{Math.round(data.median)}</span></div>
                                          {getMedianExplanation(averageSus, data.median) && (
                                            <p className="mt-2 text-[10px] text-inera-primary-40 leading-relaxed italic bg-inera-primary-70/10 p-2 rounded">
                                              {getMedianExplanation(averageSus, data.median)}
                                            </p>
                                          )}
                                          <div className="flex justify-between gap-4 pt-1 border-t border-inera-secondary-90 mt-1"><span>Q1:</span><span className="font-bold">{Math.round(data.q1)}</span></div>
                                          <div className="flex justify-between gap-4"><span>Min:</span><span className="font-bold">{Math.round(data.min)}</span></div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              {/* Box Plot visualization using stacked bars */}
                              <Bar dataKey="min" stackId="a" fill="transparent" />
                              <Bar dataKey="q1_diff" stackId="a" fill="#e5e7eb" />
                              <Bar dataKey="median_diff" stackId="a" fill="#A33662" />
                              <Bar dataKey="q3_diff" stackId="a" fill="#A33662" opacity={0.8} />
                              <Bar dataKey="max_diff" stackId="a" fill="#e5e7eb" />
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="card p-0 shadow-sm overflow-hidden border-inera-secondary-90">
                    <div className="p-6 border-b border-inera-secondary-90 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-inera-neutral-10 flex items-center gap-2">
                        <MessageSquare size={20} className="text-inera-primary-40" />
                        Användarkommentarer
                      </h3>
                      <span className="badge badge--secondary">
                        {filteredResponses.filter(r => r.comment).length} kommentarer
                      </span>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto p-6 space-y-8">
                      {(() => {
                        const commentsWithText = filteredResponses.filter(r => r.comment);
                        if (commentsWithText.length === 0) {
                          return (
                            <div className="text-center text-inera-neutral-40 py-12">
                              Inga kommentarer för detta urval.
                            </div>
                          );
                        }

                        // Group by variant
                        const byVariant: Record<string, ResponseData[]> = {};
                        commentsWithText.forEach(r => {
                          if (!byVariant[r.variantName]) byVariant[r.variantName] = [];
                          byVariant[r.variantName].push(r);
                        });

                        return Object.entries(byVariant).map(([vName, responses]) => {
                          const positive = responses.filter(r => r.susScore >= 68).length;
                          const negative = responses.filter(r => r.susScore < 68).length;
                          
                          return (
                            <div key={vName} className="space-y-4">
                              <div className="flex items-center justify-between border-b border-inera-secondary-90 pb-2">
                                <h4 className="font-bold text-inera-primary-40 uppercase tracking-wider text-sm">{vName}</h4>
                                <div className="flex items-center gap-3 text-xs font-bold">
                                  <span className="text-inera-success-40">{positive} Positiva</span>
                                  <span className="text-inera-error-40">{negative} Negativa</span>
                                </div>
                              </div>
                              <div className="space-y-3">
                                {responses.map(r => {
                                  const isPositive = r.susScore >= 68;
                                  return (
                                    <div key={r.id} className="bg-inera-secondary-95 p-4 rounded-xl border border-inera-secondary-90">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", isPositive ? "bg-inera-success-95 text-inera-success-50 border border-inera-success-40" : "bg-inera-error-95 text-inera-error-50 border border-inera-error-40")}>
                                          {isPositive ? 'Positiv' : 'Negativ'} (SUS: {Math.round(r.susScore)})
                                        </div>
                                        <span className="text-[10px] text-inera-neutral-60">{format(r.submitDate, 'yyyy-MM-dd HH:mm')}</span>
                                      </div>
                                      <p className="text-inera-neutral-20 leading-relaxed italic text-sm">"{r.comment}"</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="card p-8 shadow-sm border-inera-secondary-90">
                <div className="flex items-center gap-4 mb-8">
                  <div className="bg-inera-secondary-95 p-3 rounded-xl">
                    <Upload className="text-inera-primary-40" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-inera-neutral-10">Ladda upp mätning</h3>
                    <p className="text-sm text-inera-neutral-40">Välj produkt och ladda upp CSV-fil.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="label">Välj produkt</label>
                    <div className="flex gap-2">
                      <select 
                        value={uploadProductId}
                        onChange={(e) => setUploadProductId(e.target.value)}
                        className="select flex-1"
                      >
                        <option value="">-- Välj befintlig produkt --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center px-3 text-inera-neutral-60 font-bold">ELLER</div>
                      <input 
                        type="text" 
                        placeholder="Ny produkt..." 
                        value={uploadProductId}
                        onChange={(e) => setUploadProductId(e.target.value)}
                        className="input flex-1"
                      />
                    </div>
                    <p className="text-[10px] text-inera-neutral-60 italic">Tips: Skriv namnet om produkten inte finns i listan.</p>
                  </div>

                  <div className="p-6 border-2 border-dashed border-inera-secondary-90 rounded-xl hover:border-inera-primary-60 transition-colors group relative">
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleFileUpload}
                      disabled={isUploading || !uploadProductId}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="text-center">
                      {isUploading ? (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="animate-spin text-inera-primary-40" size={32} />
                          <p className="text-sm font-medium text-inera-neutral-40">Bearbetar fil...</p>
                        </div>
                      ) : (
                        <>
                          <FileSpreadsheet className={cn("mx-auto mb-4 transition-colors", !uploadProductId ? "text-inera-neutral-90" : "text-inera-neutral-60 group-hover:text-inera-primary-40")} size={40} />
                          <p className={cn("text-sm font-bold", !uploadProductId ? "text-inera-neutral-60" : "text-inera-neutral-10")}>
                            {!uploadProductId ? 'Välj produkt först' : 'Klicka eller dra hit CSV-fil'}
                          </p>
                          <p className="text-xs text-inera-neutral-40 mt-1">Stöd för Ineras standardexport</p>
                        </>
                      )}
                    </div>
                  </div>

                  {uploadStatus && (
                    <div className={cn(
                      "alert mt-4",
                      uploadStatus.type === 'success' ? "alert--success" : "alert--error"
                    )} role="status">
                      {uploadStatus.type === 'success' ? <CheckCircle2 className="alert-icon" size={20} /> : <AlertCircle className="alert-icon" size={20} />}
                      <div className="alert-body">
                        <div className="alert-title">{uploadStatus.type === 'success' ? 'Klart!' : 'Fel'}</div>
                        <p>{uploadStatus.msg}</p>
                      </div>
                    </div>
                  )}

                  <div className="alert alert--info" role="status">
                    <AlertCircle className="alert-icon" size={20} />
                    <div className="alert-body">
                      <div className="alert-title">Instruktioner för filformat</div>
                      <ul className="text-xs space-y-1 list-disc pl-4 mt-2">
                        <li>Använd semikolon (;) som avgränsare.</li>
                        <li>Kolumn 3 (C) bör innehålla variantnamn (t.ex. Journal).</li>
                        <li>Kolumn 5-14 (E-N) bör innehålla SUS-svar (1-5).</li>
                        <li>Kolumn 15 (O) bör innehålla fritextkommentarer.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* History */}
              {user?.email === 'andreas.l.melin@gmail.com' && (
                <div className="mt-8">
                  <h3 className="text-lg font-bold text-inera-neutral-10 mb-4">Senaste uppladdningar</h3>
                  <div className="space-y-3">
                    {measurements.slice(0, 10).map(m => (
                      <div key={m.id} className="card flex items-center justify-between group py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-inera-secondary-95 p-2 rounded-lg">
                            <FileSpreadsheet size={18} className="text-inera-neutral-40" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-inera-neutral-10">{m.fileName}</p>
                            <p className="text-xs text-inera-neutral-60">{format(m.date, 'yyyy-MM-dd HH:mm')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm font-bold text-inera-primary-40">{Math.round(m.averageScore * 10) / 10} SUS</p>
                            <p className="text-xs text-inera-neutral-40">{m.responseCount} svar</p>
                          </div>
                          <button 
                            onClick={() => setMeasurementToDelete(m)}
                            className="p-2 text-inera-neutral-80 hover:text-inera-error-40 hover:bg-inera-error-95 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Ta bort mätning"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-0 shadow-xl max-w-md w-full overflow-hidden border-inera-secondary-90">
            <div className="p-6 border-b border-inera-secondary-90 flex items-center gap-3 bg-inera-error-95">
              <div className="bg-inera-error-40 p-2 rounded-lg text-white">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-inera-error-20">Nollställ Katalog</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-inera-neutral-20 font-medium">
                Är du säker på att du vill nollställa hela katalogen?
              </p>
              <p className="text-sm text-inera-neutral-40">
                Detta kommer att permanent radera alla produkter, varianter, mätningar och svar från databasen. Denna åtgärd går inte att ångra.
              </p>
              {resetError && (
                <div className="p-3 bg-inera-error-95 text-inera-error-40 text-sm font-bold rounded-lg border border-inera-error-90">
                  {resetError}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  setResetError(null);
                }}
                disabled={isResetting}
                className="btn btn--m btn--tertiary border border-transparent disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={async () => {
                  setIsResetting(true);
                  setResetError(null);
                  try {
                    await MeasurementService.resetCatalog();
                    // Reset local view states
                    setView('company');
                    setSelectedProductId(null);
                    setSelectedVariant('Alla');
                    setSelectedMeasurementId('all');
                    setShowResetConfirm(false);
                    setIsResetting(false);
                  } catch (e: any) {
                    console.error(e);
                    setResetError(e.message || 'Ett fel uppstod vid nollställning.');
                    setIsResetting(false);
                  }
                }}
                disabled={isResetting}
                className="btn btn--m btn--destructive disabled:opacity-50"
              >
                {isResetting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Ja, nollställ allt
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Measurement Confirmation Modal */}
      {measurementToDelete && (
        <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-0 shadow-xl max-w-md w-full overflow-hidden border-inera-secondary-90">
            <div className="p-6 border-b border-inera-secondary-90 flex items-center gap-3 bg-inera-error-95">
              <div className="bg-inera-error-40 p-2 rounded-lg text-white">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-inera-error-20">Ta bort mätning</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-inera-neutral-20 font-medium">
                Är du säker på att du vill ta bort mätningen för <span className="text-inera-primary-40 font-bold">{products.find(p => p.id === measurementToDelete.productId)?.name || measurementToDelete.productId}</span>?
              </p>
              <div className="bg-inera-secondary-95 p-3 rounded-lg border border-inera-secondary-90">
                <p className="text-xs text-inera-neutral-40 uppercase font-bold tracking-wider mb-1">Mätning</p>
                <p className="text-sm font-bold text-inera-neutral-10">{measurementToDelete.fileName}</p>
                <p className="text-xs text-inera-neutral-60">{format(measurementToDelete.date, 'yyyy-MM-dd HH:mm')}</p>
              </div>
              <p className="text-sm text-inera-neutral-40">
                Detta kommer att permanent radera mätningen och alla tillhörande svar. Denna åtgärd går inte att ångra.
              </p>
            </div>
            <div className="p-6 border-t border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-end gap-3">
              <button
                onClick={() => setMeasurementToDelete(null)}
                disabled={isDeleting}
                className="btn btn--m btn--tertiary border border-transparent disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await MeasurementService.deleteMeasurement(measurementToDelete.id);
                    setMeasurementToDelete(null);
                  } catch (e) {
                    console.error('Delete failed', e);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="btn btn--m btn--destructive shadow-sm disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Tar bort...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Ta bort permanent
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
