import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { SusSurvey, Product, SurveyRespondent, SusResponse } from '../types';
import { 
  Plus, AlertCircle, ChevronRight, ChevronLeft, Copy, Check, Trash2, Upload, 
  Users, Link2, Calendar, FileText, Download, RefreshCw, ExternalLink, BarChart2,
  CheckCircle2, Info, ArrowUpRight, ArrowDownRight, MessageSquare, Search, X
} from 'lucide-react';
import { getSusGrade, calculateMedian } from '../lib/utils';
import { loadMasterCatalog } from '../services/catalogMappingService';

export default function SusAdminView() {
  const [surveys, setSurveys] = useState<SusSurvey[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedSurvey, setSelectedSurvey] = useState<SusSurvey | null>(null);
  
  // Detail mode data
  const [respondents, setRespondents] = useState<SurveyRespondent[]>([]);
  const [responses, setResponses] = useState<SusResponse[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Create wizard states
  const [step, setStep] = useState(1);
  const [productFilter, setProductFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<SusSurvey>>({
    status: 'active',
    type: 'general',
    endCondition: 'date',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    introText: '',
    freeTextLabel: '',
    thankYouText: '',
    externalSurveyEnabled: false,
    externalSurveyUrl: '',
    externalSurveyBtnText: 'Fortsätt'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [surveySnap, productSnap, masterCatalogData] = await Promise.all([
        getDocs(collection(db, 'susSurveys')),
        getDocs(collection(db, 'products')),
        loadMasterCatalog()
      ]);

      setSurveys(surveySnap.docs.map(d => ({ ...d.data(), id: d.id } as SusSurvey)));
      
      const dbProducts = productSnap.docs.map(d => ({ ...d.data(), id: d.id } as Product));

      // Build a unified product list from both DB products and Master Catalog
      const productMap = new Map<string, Product>();

      // 1. Add DB products
      dbProducts.forEach(p => {
        if (p.name && p.name.trim()) {
          productMap.set(p.name.trim().toLowerCase(), p);
        }
      });

      // 2. Add Master Catalog products if not already present
      masterCatalogData.forEach(catName => {
        const cleanName = catName.trim();
        if (cleanName) {
          const key = cleanName.toLowerCase();
          if (!productMap.has(key)) {
            productMap.set(key, {
              id: cleanName,
              name: cleanName,
              teamId: 'team-inera'
            });
          }
        }
      });

      // 3. Sort all products alphabetically in Swedish locale (a-ö)
      const allProductsCombined = Array.from(productMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name, 'sv-SE', { sensitivity: 'base' })
      );

      setProducts(allProductsCombined);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError("Kunde inte hämta SUS-omgångar och produkter.");
    } finally {
      setLoading(false);
    }
  };

  const fetchSurveyDetails = async (surveyId: string) => {
    setLoadingDetails(true);
    try {
      // Hämta respondenter om unika länkar
      const qResp = query(collection(db, 'surveyRespondents'), where('surveyId', '==', surveyId));
      const respSnap = await getDocs(qResp);
      setRespondents(respSnap.docs.map(d => ({ ...d.data(), id: d.id } as SurveyRespondent)));

      // Hämta svar
      const qAns = query(collection(db, 'susResponses'), where('surveyId', '==', surveyId));
      const ansSnap = await getDocs(qAns);
      setResponses(ansSnap.docs.map(d => ({ ...d.data(), id: d.id } as SusResponse)));
    } catch (err) {
      console.error("Error fetching survey details:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const openSurvey = (survey: SusSurvey) => {
    setSelectedSurvey(survey);
    setMode('detail');
    fetchSurveyDetails(survey.id);
  };

  // Regel 5.3: Kontrollera om det finns en aktiv omgång för produkten
  const checkActiveSurveyForProduct = (productId: string, excludeSurveyId?: string) => {
    return surveys.find(s => s.productId === productId && s.status === 'active' && s.id !== excludeSurveyId);
  };

  const handleToggleStatus = async (survey: SusSurvey) => {
    try {
      const newStatus = survey.status === 'active' ? 'inactive' : 'active';
      
      if (newStatus === 'active') {
        const existingActive = checkActiveSurveyForProduct(survey.productId, survey.id);
        if (existingActive) {
          const prod = products.find(p => p.id === survey.productId);
          alert(`Produkten "${prod?.name || survey.productId}" har redan en aktiv omgång ("${existingActive.name}"). Inaktivera den befintliga omgången först.`);
          return;
        }
      }

      await updateDoc(doc(db, 'susSurveys', survey.id), { status: newStatus });
      setSurveys(prev => prev.map(s => s.id === survey.id ? { ...s, status: newStatus } : s));
      if (selectedSurvey?.id === survey.id) {
        setSelectedSurvey({ ...selectedSurvey, status: newStatus });
      }
    } catch (err) {
      console.error("Error updating survey status:", err);
    }
  };

  const handleDeleteSurvey = async (surveyId: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna SUS-omgång? Detta tar bort omgången och dess inställningar.")) return;
    try {
      await deleteDoc(doc(db, 'susSurveys', surveyId));
      setMode('list');
      setSelectedSurvey(null);
      fetchData();
    } catch (err) {
      console.error("Error deleting survey:", err);
    }
  };

  const importRespondents = async () => {
    if (!selectedSurvey || !importText.trim()) return;
    setIsImporting(true);
    setImportNotice(null);
    try {
      const rawList = importText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      const existingEmails = new Set(respondents.map(r => r.email.toLowerCase()));
      const validEmails: string[] = [];
      let duplicateCount = 0;
      let invalidCount = 0;

      for (const item of rawList) {
        if (!emailRegex.test(item)) {
          invalidCount++;
        } else if (existingEmails.has(item.toLowerCase())) {
          duplicateCount++;
        } else {
          validEmails.push(item);
          existingEmails.add(item.toLowerCase());
        }
      }

      if (validEmails.length === 0) {
        setImportNotice(`Inga nya giltiga e-postadresser att lägga till. (${duplicateCount} dubbletter, ${invalidCount} ogiltiga)`);
        setIsImporting(false);
        return;
      }

      for (const email of validEmails) {
        await addDoc(collection(db, 'surveyRespondents'), {
          surveyId: selectedSurvey.id,
          email,
          used: false,
          createdAt: new Date().toISOString()
        });
      }

      setImportText('');
      setImportNotice(`${validEmails.length} unika e-postadresser importerades. (${duplicateCount} dubbletter hoppades över)`);
      fetchSurveyDetails(selectedSurvey.id);
    } catch (err) {
      console.error("Error importing respondents:", err);
      setImportNotice("Ett fel uppstod vid importen.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleResetRespondent = async (respId: string) => {
    if (!confirm("Är du säker på att du vill återställa denna länk? Detta gör att länken kan användas igen.")) return;
    try {
      await updateDoc(doc(db, 'surveyRespondents', respId), {
        used: false,
        answeredAt: null
      });
      if (selectedSurvey) fetchSurveyDetails(selectedSurvey.id);
    } catch (err) {
      console.error("Error resetting respondent:", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setImportText(text);
      }
    };
    reader.readAsText(file);
  };

  const createSurvey = async () => {
    if (!formData.productId) {
      setError("Vänligen välj en produkt.");
      return;
    }

    // Check duplicate name or active survey
    const product = products.find(p => p.id === formData.productId);
    const mStr = String(formData.month || 1).padStart(2, '0');
    const name = `${product?.name || 'Produkt'}-${mStr}-${formData.year || new Date().getFullYear()}`;

    if (formData.status === 'active') {
      const activeExisting = checkActiveSurveyForProduct(formData.productId);
      if (activeExisting) {
        setError(`Produkten "${product?.name}" har redan en aktiv SUS-omgång (${activeExisting.name}). Inaktivera den aktiva omgången först.`);
        return;
      }
    }

    try {
      await addDoc(collection(db, 'susSurveys'), {
        productId: formData.productId,
        name,
        status: formData.status || 'active',
        type: formData.type || 'general',
        month: formData.month || new Date().getMonth() + 1,
        year: formData.year || new Date().getFullYear(),
        endCondition: formData.endCondition || 'date',
        endDate: formData.endDate || '',
        maxResponses: formData.maxResponses || null,
        introText: formData.introText || '',
        freeTextLabel: formData.freeTextLabel || '',
        thankYouText: formData.thankYouText || '',
        externalSurveyEnabled: formData.externalSurveyEnabled || false,
        externalSurveyUrl: formData.externalSurveyUrl || '',
        externalSurveyBtnText: formData.externalSurveyBtnText || 'Fortsätt',
        createdAt: new Date().toISOString()
      });

      setMode('list');
      setStep(1);
      setFormData({
        status: 'active',
        type: 'general',
        endCondition: 'date',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      });
      fetchData();
    } catch (err) {
      console.error("Error creating survey:", err);
      setError("Kunde inte skapa omgång.");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  // Export unique links list to CSV
  const exportUniqueLinksCsv = () => {
    if (!selectedSurvey) return;
    const headers = ["E-postadress", "Unik inbjudningslänk", "Omgång", "Svarsstatus", "Skapad datum", "Svarat datum"];
    const rows = respondents.map(r => [
      r.email,
      `${window.location.origin}/?sus_survey=${selectedSurvey.id}&respondent=${r.id}`,
      selectedSurvey.name,
      r.used ? 'Svarat' : 'Ej svarat',
      r.createdAt ? new Date(r.createdAt).toLocaleString('sv-SE') : '',
      r.answeredAt ? new Date(r.answeredAt).toLocaleString('sv-SE') : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(cell => `"${cell}"`).join(','))].join('\n');
    downloadCsv(csvContent, `Inera_SUS_Unika_Lankar_${selectedSurvey.name}.csv`);
  };

  // Export reminder list (ONLY unanswered emails)
  const exportReminderCsv = () => {
    if (!selectedSurvey) return;
    const unanswered = respondents.filter(r => !r.used);
    const headers = ["E-postadress", "Unik inbjudningslänk", "Omgång"];
    const rows = unanswered.map(r => [
      r.email,
      `${window.location.origin}/?sus_survey=${selectedSurvey.id}&respondent=${r.id}`,
      selectedSurvey.name
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(cell => `"${cell}"`).join(','))].join('\n');
    downloadCsv(csvContent, `Inera_SUS_Paminnelser_${selectedSurvey.name}.csv`);
  };

  // Export responses data (Anonymized without emails)
  const exportResponsesCsv = () => {
    if (!selectedSurvey) return;
    const headers = [
      "Omgång", "Produkt", "Inskickat datum", "SUS-poäng", 
      "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", 
      "Kommentar", "Länktyp", "Gick vidare"
    ];
    const product = products.find(p => p.id === selectedSurvey.productId);

    const rows = responses.map(res => [
      selectedSurvey.name,
      product?.name || selectedSurvey.productId,
      res.submittedAt ? new Date(res.submittedAt).toLocaleString('sv-SE') : '',
      res.susScore,
      ...(res.answers || Array(10).fill('')),
      res.comment || '',
      res.linkType || 'general',
      res.wentFurther || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(cell => `"${cell}"`).join(','))].join('\n');
    downloadCsv(csvContent, `Inera_SUS_Svar_Anonymiserad_${selectedSurvey.name}.csv`);
  };

  const downloadCsv = (content: string, fileName: string) => {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Detailed survey view mode
  if (mode === 'detail' && selectedSurvey) {
    const surveyProduct = products.find(p => p.id === selectedSurvey.productId);
    const surveyUrl = `${window.location.origin}/?sus_survey=${selectedSurvey.id}`;
    
    // Response analytics
    const completeResponses = responses.length;
    const susScores = responses.map(r => r.susScore);
    const avgSusScore = completeResponses > 0 ? Math.round((susScores.reduce((a, b) => a + b, 0) / completeResponses) * 10) / 10 : 0;
    const medianSusScore = completeResponses > 0 ? calculateMedian(susScores) : 0;
    const maxSusScore = completeResponses > 0 ? Math.max(...susScores) : 0;
    const minSusScore = completeResponses > 0 ? Math.min(...susScores) : 0;
    const gradeInfo = completeResponses > 0 ? getSusGrade(avgSusScore) : null;
    
    const wentFurtherCount = responses.filter(r => r.wentFurther === 1).length;
    const commentsList = responses.filter(r => r.comment && r.comment.trim().length > 0);

    return (
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-inera-secondary-90">
          <button className="btn btn--tertiary flex items-center gap-2 text-sm" onClick={() => setMode('list')}>
            <ChevronLeft size={16} /> Tillbaka till omgångslistan
          </button>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleToggleStatus(selectedSurvey)}
              className={`btn btn--s ${selectedSurvey.status === 'active' ? 'btn--secondary' : 'btn--primary'}`}
            >
              {selectedSurvey.status === 'active' ? 'Inaktivera omgång' : 'Aktivera omgång'}
            </button>
            <button 
              onClick={() => handleDeleteSurvey(selectedSurvey.id)}
              className="p-2 text-inera-error-40 hover:bg-inera-error-95 rounded-lg transition-colors"
              title="Ta bort omgång"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Survey Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold font-display text-inera-neutral-10">{selectedSurvey.name}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${selectedSurvey.status === 'active' ? 'bg-inera-success-95 text-inera-success-40 border border-inera-success-40' : 'bg-inera-secondary-95 text-inera-neutral-40 border border-inera-secondary-90'}`}>
              {selectedSurvey.status === 'active' ? 'Aktiv' : 'Inaktiv'}
            </span>
          </div>
          <p className="text-sm text-inera-neutral-30">
            Produkt: <span className="font-semibold text-inera-neutral-10">{surveyProduct?.name || selectedSurvey.productId}</span> | 
            Period: <span className="font-semibold text-inera-neutral-10">{selectedSurvey.month}/{selectedSurvey.year}</span>
          </p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-xl border border-inera-secondary-90 bg-inera-secondary-95/50 flex flex-col justify-between">
            <span className="text-xs font-bold text-inera-neutral-40 uppercase">Antal fullständiga svar</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-inera-neutral-10">{completeResponses}</span>
              <FileText size={20} className="text-inera-neutral-40" />
            </div>
            {selectedSurvey.type === 'unique' && (
              <span className="text-xs text-inera-neutral-40 mt-1">
                Svarsfrekvens: {respondents.length > 0 ? Math.round((completeResponses / respondents.length) * 100) : 0}% ({respondents.length} inbjudna)
              </span>
            )}
          </div>

          <div className="p-5 rounded-xl border border-inera-secondary-90 bg-inera-secondary-95/50 flex flex-col justify-between">
            <span className="text-xs font-bold text-inera-neutral-40 uppercase">Medelvärde (SUS)</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-inera-primary-40">{completeResponses > 0 ? avgSusScore : '-'}</span>
              {gradeInfo && (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-inera-primary-40/10 text-inera-primary-40">
                  Betyg {gradeInfo.grade}
                </span>
              )}
            </div>
            <span className="text-xs text-inera-neutral-40 mt-1">
              {gradeInfo ? gradeInfo.adjective : 'Inga svar än'}
            </span>
          </div>

          <div className="p-5 rounded-xl border border-inera-secondary-90 bg-inera-secondary-95/50 flex flex-col justify-between">
            <span className="text-xs font-bold text-inera-neutral-40 uppercase">Median (SUS)</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-inera-neutral-10">{completeResponses > 0 ? medianSusScore : '-'}</span>
              <span className="text-xs text-inera-neutral-40">Min: {minSusScore} | Max: {maxSusScore}</span>
            </div>
            <span className="text-xs text-inera-neutral-40 mt-1">
              {avgSusScore >= 74 ? 'Över Ineras mål (74)' : avgSusScore >= 68 ? 'Godkänt (över 68)' : 'Under miniminivå (68)'}
            </span>
          </div>

          <div className="p-5 rounded-xl border border-inera-secondary-90 bg-inera-secondary-95/50 flex flex-col justify-between">
            <span className="text-xs font-bold text-inera-neutral-40 uppercase">Vidareklick till ext. enkät</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-inera-neutral-10">{wentFurtherCount}</span>
              <ExternalLink size={20} className="text-inera-neutral-40" />
            </div>
            <span className="text-xs text-inera-neutral-40 mt-1">
              {completeResponses > 0 ? Math.round((wentFurtherCount / completeResponses) * 100) : 0}% av alla respondenter
            </span>
          </div>
        </div>

        {/* Action Buttons for Export */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8 p-4 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-inera-primary-40" />
            <span className="font-bold text-sm text-inera-neutral-10">Exportera omgångsdata</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportResponsesCsv} className="btn btn--secondary btn--s flex items-center gap-1.5" disabled={completeResponses === 0}>
              <Download size={14} /> Exportera svar (CSV)
            </button>
            {selectedSurvey.type === 'unique' && (
              <>
                <button onClick={exportUniqueLinksCsv} className="btn btn--secondary btn--s flex items-center gap-1.5" disabled={respondents.length === 0}>
                  <Download size={14} /> Exportera alla unika länkar (CSV)
                </button>
                <button onClick={exportReminderCsv} className="btn btn--primary btn--s flex items-center gap-1.5" disabled={respondents.filter(r => !r.used).length === 0}>
                  <Download size={14} /> Exportera påminnelseunderlag
                </button>
              </>
            )}
          </div>
        </div>

        {/* Enkätlänk distribution */}
        {selectedSurvey.type === 'general' ? (
          <div className="p-5 rounded-xl border border-inera-primary-40/20 bg-inera-primary-40/5 mb-8">
            <h3 className="font-bold text-inera-neutral-10 mb-2 flex items-center gap-2">
              <Link2 size={18} className="text-inera-primary-40" /> Generell enkätlänk
            </h3>
            <p className="text-sm text-inera-neutral-40 mb-3">Publicera eller dela denna länk för öppna insamlingar:</p>
            <div className="flex gap-2">
              <input 
                readOnly 
                value={surveyUrl} 
                className="flex-grow p-2.5 border border-inera-secondary-90 rounded-lg text-sm bg-white font-mono text-inera-neutral-10" 
              />
              <button 
                onClick={() => copyToClipboard(surveyUrl, 'gen_link')}
                className="btn btn--secondary flex items-center gap-2 shrink-0"
              >
                {copiedId === 'gen_link' ? <Check size={16} className="text-inera-success-40" /> : <Copy size={16} />}
                {copiedId === 'gen_link' ? 'Kopierad!' : 'Kopiera länk'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 mb-8">
            <div className="p-5 border border-inera-secondary-90 rounded-xl bg-white shadow-xs">
              <h3 className="font-bold text-inera-neutral-10 text-lg mb-2 flex items-center gap-2">
                <Users size={18} className="text-inera-accent-40" /> Importera respondenter (Unika länkar)
              </h3>
              <p className="text-sm text-inera-neutral-40 mb-4">
                Klistra in e-postadresser (en per rad eller separerade med kommatecken/semikolon) eller ladda upp en CSV.
              </p>

              {importNotice && (
                <div className="p-3 mb-4 rounded-lg bg-inera-primary-40/10 border border-inera-primary-40/30 text-sm font-medium text-inera-neutral-20">
                  {importNotice}
                </div>
              )}

              <textarea 
                className="input w-full h-28 mb-4 font-mono text-sm" 
                placeholder="anna.andersson@example.com&#10;erik.svensson@example.com"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <label className="btn btn--secondary btn--s flex items-center gap-2 cursor-pointer shrink-0">
                  <Upload size={16} /> Ladda upp CSV / textfil
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                </label>
                <button 
                  className="btn btn--primary btn--s flex items-center gap-2" 
                  onClick={importRespondents}
                  disabled={isImporting || !importText.trim()}
                >
                  <Users size={16} /> Importera & Generera unika länkar
                </button>
              </div>
            </div>

            {/* Respondent list */}
            <div className="border border-inera-secondary-90 rounded-xl p-5 bg-white">
              <h3 className="font-bold text-inera-neutral-10 text-lg mb-4 flex items-center justify-between">
                <span>Mottagare & Unika länkar ({respondents.length})</span>
              </h3>

              {loadingDetails ? (
                <p className="text-sm text-inera-neutral-40">Laddar respondenter...</p>
              ) : respondents.length === 0 ? (
                <p className="text-sm text-inera-neutral-40 italic">Inga respondenter har importerats än.</p>
              ) : (
                <div className="border border-inera-secondary-90 rounded-xl overflow-hidden divide-y divide-inera-secondary-90 max-h-80 overflow-y-auto">
                  {respondents.map(r => {
                    const uniqueLink = `${window.location.origin}/?sus_survey=${selectedSurvey.id}&respondent=${r.id}`;
                    return (
                      <div key={r.id} className="p-3 bg-white flex items-center justify-between gap-4 text-sm hover:bg-inera-secondary-95 transition-colors">
                        <div className="min-w-0">
                          <p className="font-medium text-inera-neutral-10 truncate">{r.email}</p>
                          <p className="text-xs text-inera-neutral-40 font-mono truncate">{uniqueLink}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.used ? 'bg-inera-secondary-95 text-inera-neutral-40' : 'bg-inera-success-95 text-inera-success-40'}`}>
                            {r.used ? 'Besvarad' : 'Ej besvarad'}
                          </span>
                          <button 
                            onClick={() => copyToClipboard(uniqueLink, r.id)}
                            className="p-1.5 border border-inera-secondary-90 rounded hover:bg-inera-secondary-90 text-inera-neutral-20"
                            title="Kopiera unika länk"
                          >
                            {copiedId === r.id ? <Check size={14} className="text-inera-success-40" /> : <Copy size={14} />}
                          </button>
                          {r.used && (
                            <button 
                              onClick={() => handleResetRespondent(r.id)}
                              className="p-1.5 border border-inera-secondary-90 rounded hover:bg-inera-error-95 text-inera-error-40"
                              title="Återställ länk"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Free text comments section */}
        {commentsList.length > 0 && (
          <div className="border border-inera-secondary-90 rounded-xl p-5 bg-white mb-8">
            <h3 className="font-bold text-inera-neutral-10 text-lg mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-inera-primary-40" /> Inkomna fritextkommentarer ({commentsList.length})
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {commentsList.map((res, i) => (
                <div key={i} className="p-4 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90 text-sm text-inera-neutral-10">
                  <p className="italic mb-2">"{res.comment}"</p>
                  <div className="flex items-center justify-between text-xs text-inera-neutral-40">
                    <span>SUS-poäng: <strong className="text-inera-primary-40">{res.susScore}</strong></span>
                    <span>{res.submittedAt ? new Date(res.submittedAt).toLocaleDateString('sv-SE') : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Create wizard mode
  if (mode === 'create') {
    const selectedProduct = products.find(p => p.id === formData.productId);
    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productFilter.toLowerCase()));

    return (
      <div className="card p-6 shadow-md border-inera-secondary-90 bg-white max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-inera-secondary-90">
          <h2 className="text-xl font-bold font-display text-inera-neutral-10">Skapa ny SUS-omgång</h2>
          <span className="text-xs font-bold text-inera-neutral-40 uppercase bg-inera-secondary-95 px-3 py-1 rounded-full">Steg {step} av 3</span>
        </div>

        {error && (
          <div className="bg-inera-error-95 text-inera-error-40 border border-inera-error-40 p-4 rounded-lg text-sm mb-6 flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Product & Period */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-inera-neutral-20">
                  1. Välj produkt ({products.length} tillgängliga)
                </label>
                {productFilter && (
                  <span className="text-xs text-inera-neutral-40">
                    Visar {filteredProducts.length} av {products.length}
                  </span>
                )}
              </div>

              {/* Sökruta längst upp */}
              <div className="relative mb-3">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-inera-neutral-40 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Sök bland alla 73+ produkter i alfabetisk ordning..." 
                  className="input w-full pl-10 pr-9 py-2.5 text-sm" 
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)} 
                />
                {productFilter && (
                  <button 
                    type="button"
                    onClick={() => setProductFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-inera-neutral-40 hover:text-inera-neutral-10 rounded-full"
                    title="Rensa sökning"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Interaktiv produktlista i alfabetisk ordning */}
              <div className="border border-inera-secondary-90 rounded-xl overflow-hidden bg-white max-h-64 overflow-y-auto divide-y divide-inera-secondary-90/60 shadow-xs">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-inera-neutral-40 italic">
                    Ingen produkt matchar "{productFilter}"
                  </div>
                ) : (
                  filteredProducts.map(p => {
                    const isSelected = formData.productId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, productId: p.id });
                          setError('');
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                          isSelected 
                            ? 'bg-inera-accent-40/10 text-inera-accent-40 font-bold' 
                            : 'hover:bg-inera-secondary-95 text-inera-neutral-10 font-medium'
                        }`}
                      >
                        <span>{p.name}</span>
                        {isSelected && <Check size={18} className="text-inera-accent-40 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              {selectedProduct ? (
                <div className="mt-3 p-3 bg-inera-accent-40/10 border border-inera-accent-40/30 rounded-lg flex items-center justify-between text-xs font-bold text-inera-accent-40">
                  <span>Vald produkt: {selectedProduct.name}</span>
                  <Check size={16} />
                </div>
              ) : (
                <p className="text-xs text-inera-neutral-40 mt-2 italic">Välj en produkt ur listan ovan för att gå vidare.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-inera-neutral-20 mb-2">2. Välj mätperiod</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-inera-neutral-40 mb-1">Månad (1-12)</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={12} 
                    className="input w-full" 
                    value={formData.month || 1} 
                    onChange={(e) => setFormData({...formData, month: parseInt(e.target.value) || 1})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-inera-neutral-40 mb-1">År</label>
                  <input 
                    type="number" 
                    className="input w-full" 
                    value={formData.year || new Date().getFullYear()} 
                    onChange={(e) => setFormData({...formData, year: parseInt(e.target.value) || new Date().getFullYear()})} 
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Slutvillkor & Anpassade texter */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-inera-neutral-20 mb-2">Slutvillkor för omgången</label>
              
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 p-3 border border-inera-secondary-90 rounded-lg cursor-pointer hover:bg-inera-secondary-95 transition-colors">
                  <input 
                    type="radio" 
                    name="endCondition" 
                    value="date" 
                    checked={formData.endCondition === 'date'} 
                    onChange={() => setFormData({...formData, endCondition: 'date'})} 
                  />
                  <div>
                    <span className="font-bold text-sm text-inera-neutral-10">Fast slutdatum</span>
                    <p className="text-xs text-inera-neutral-40">Enkäten är öppen fram till ett valt datum.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-inera-secondary-90 rounded-lg cursor-pointer hover:bg-inera-secondary-95 transition-colors">
                  <input 
                    type="radio" 
                    name="endCondition" 
                    value="maxResponses" 
                    checked={formData.endCondition === 'maxResponses'} 
                    onChange={() => setFormData({...formData, endCondition: 'maxResponses'})} 
                  />
                  <div>
                    <span className="font-bold text-sm text-inera-neutral-10">Maximalt antal svar</span>
                    <p className="text-xs text-inera-neutral-40">Enkäten stängs automatiskt när målantalet svar har nåtts.</p>
                  </div>
                </label>
              </div>

              {formData.endCondition === 'date' ? (
                <div>
                  <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Välj slutdatum</label>
                  <input 
                    type="date" 
                    className="input w-full" 
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})} 
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Maximalt antal svar (t.ex. 100)</label>
                  <input 
                    type="number" 
                    placeholder="Målantal svar..." 
                    className="input w-full" 
                    value={formData.maxResponses || ''} 
                    onChange={(e) => setFormData({...formData, maxResponses: parseInt(e.target.value) || undefined})} 
                  />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-inera-secondary-90 space-y-4">
              <label className="block text-sm font-bold text-inera-neutral-20">Anpassa redigerbara enkättexter (Valfritt)</label>
              
              <div>
                <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Inledningstext (använd [Produkten] som platshållare)</label>
                <textarea 
                  className="input w-full text-sm h-20" 
                  placeholder={`Vi vill veta hur du upplevde att använda [Produkten]. Enkäten består av tio påståenden och tar cirka två minuter...`}
                  value={formData.introText || ''}
                  onChange={(e) => setFormData({...formData, introText: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Fritextfråga etikett</label>
                <input 
                  type="text" 
                  className="input w-full text-sm" 
                  placeholder={`Har du något mer du vill berätta om din upplevelse av [Produkten]?`}
                  value={formData.freeTextLabel || ''}
                  onChange={(e) => setFormData({...formData, freeTextLabel: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Tacktext efter inskick</label>
                <input 
                  type="text" 
                  className="input w-full text-sm" 
                  placeholder={`Tack för att du tog dig tid att svara. Dina synpunkter hjälper oss...`}
                  value={formData.thankYouText || ''}
                  onChange={(e) => setFormData({...formData, thankYouText: e.target.value})}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Distribution & Extern enkät */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-inera-neutral-20 mb-2">1. Distributionssätt</label>
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 p-3 border border-inera-secondary-90 rounded-lg cursor-pointer hover:bg-inera-secondary-95 transition-colors">
                  <input 
                    type="radio" 
                    name="surveyType" 
                    value="general" 
                    checked={formData.type === 'general'} 
                    onChange={() => setFormData({...formData, type: 'general'})} 
                  />
                  <div>
                    <span className="font-bold text-sm text-inera-neutral-10">Generell länk</span>
                    <p className="text-xs text-inera-neutral-40">Öppen länk som kan delas fritt och tar emot obegränsat antal svar.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-inera-secondary-90 rounded-lg cursor-pointer hover:bg-inera-secondary-95 transition-colors">
                  <input 
                    type="radio" 
                    name="surveyType" 
                    value="unique" 
                    checked={formData.type === 'unique'} 
                    onChange={() => setFormData({...formData, type: 'unique'})} 
                  />
                  <div>
                    <span className="font-bold text-sm text-inera-neutral-10">Unika länkar per respondent</span>
                    <p className="text-xs text-inera-neutral-40">Personliga engångslänkar kopplade till e-postadresser.</p>
                  </div>
                </label>
              </div>

              {/* Extern enkät vidarebefordran */}
              <div className="pt-4 border-t border-inera-secondary-90 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.externalSurveyEnabled || false} 
                    onChange={(e) => setFormData({...formData, externalSurveyEnabled: e.target.checked})} 
                  />
                  <span className="text-sm font-bold text-inera-neutral-20">Erbjud respondenten att gå vidare till ytterligare frågor</span>
                </label>

                {formData.externalSurveyEnabled && (
                  <div className="space-y-3 pl-6 border-l-2 border-inera-primary-40/30">
                    <div>
                      <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Mål-URL (extern undersökning)</label>
                      <input 
                        type="url" 
                        placeholder="https://forms.office.com/e/..." 
                        className="input w-full text-sm" 
                        value={formData.externalSurveyUrl || ''} 
                        onChange={(e) => setFormData({...formData, externalSurveyUrl: e.target.value})} 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-inera-neutral-40 mb-1">Knapptext</label>
                      <input 
                        type="text" 
                        placeholder="Fortsätt" 
                        className="input w-full text-sm" 
                        value={formData.externalSurveyBtnText || 'Fortsätt'} 
                        onChange={(e) => setFormData({...formData, externalSurveyBtnText: e.target.value})} 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Summary Preview */}
              <div className="p-4 bg-inera-secondary-95 border border-inera-secondary-90 rounded-xl space-y-2 text-sm mt-6">
                <p className="font-bold text-inera-neutral-10">Sammanfattning:</p>
                <p><span className="text-inera-neutral-40">Produkt:</span> {selectedProduct?.name || 'Ej vald'}</p>
                <p><span className="text-inera-neutral-40">Omgångsnamn:</span> {selectedProduct?.name || 'Produkt'}-{String(formData.month || 1).padStart(2, '0')}-{formData.year || new Date().getFullYear()}</p>
                <p><span className="text-inera-neutral-40">Slutvillkor:</span> {formData.endCondition === 'date' ? `Slutdatum ${formData.endDate || 'Ej satt'}` : `Max ${formData.maxResponses || 0} svar`}</p>
                <p><span className="text-inera-neutral-40">Typ:</span> {formData.type === 'general' ? 'Generell länk' : 'Unika länkar'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-8 pt-4 border-t border-inera-secondary-90">
          <button 
            className="btn btn--tertiary flex items-center gap-2" 
            onClick={() => step > 1 ? setStep(step - 1) : setMode('list')}
          >
            <ChevronLeft size={16} /> Tillbaka
          </button>
          
          {step < 3 ? (
            <button 
              className="btn btn--primary flex items-center gap-2" 
              onClick={() => {
                if (step === 1 && !formData.productId) {
                  setError("Du måste välja en produkt.");
                  return;
                }
                setError('');
                setStep(step + 1);
              }}
            >
              Nästa <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn btn--primary" onClick={createSurvey}>
              Skapa och aktivera omgång
            </button>
          )}
        </div>
      </div>
    );
  }

  // Main List View
  return (
    <div className="card p-6 shadow-md border-inera-secondary-90 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold font-display text-inera-neutral-10">SUS-modul - Omgångar</h2>
          <p className="text-sm text-inera-neutral-40 mt-1">Skapa, distribuera och analysera standardiserade SUS-mätningar för Ineras produkter.</p>
        </div>
        <button onClick={() => setMode('create')} className="btn btn--s btn--primary flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <Plus size={16} />
          Skapa ny SUS-omgång
        </button>
      </div>

      {error && (
        <div className="bg-inera-error-95 text-inera-error-40 border border-inera-error-40 p-4 rounded-lg text-sm mb-6 flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-inera-neutral-40">Laddar SUS-omgångar...</div>
      ) : surveys.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-inera-secondary-90 rounded-xl">
          <FileText size={32} className="mx-auto text-inera-neutral-40 mb-3" />
          <p className="text-inera-neutral-30 font-medium mb-1">Inga aktiva eller historiska SUS-omgångar</p>
          <p className="text-xs text-inera-neutral-40 mb-4">Klicka på knappen nedan för att skapa din första mätomgång.</p>
          <button onClick={() => setMode('create')} className="btn btn--s btn--primary">
            Skapa ny SUS-omgång
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {surveys.map(survey => {
            const surveyProduct = products.find(p => p.id === survey.productId);
            return (
              <div 
                key={survey.id} 
                onClick={() => openSurvey(survey)}
                className="border border-inera-secondary-90 hover:border-inera-primary-40 p-5 rounded-xl bg-white hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${survey.status === 'active' ? 'bg-inera-success-95 text-inera-success-40 border border-inera-success-40' : 'bg-inera-secondary-95 text-inera-neutral-40 border border-inera-secondary-90'}`}>
                      {survey.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <span className="text-xs font-semibold text-inera-neutral-40 uppercase">
                      {survey.type === 'general' ? 'Generell' : 'Unik'}
                    </span>
                  </div>

                  <h3 className="font-bold text-lg text-inera-neutral-10 mb-1">{survey.name}</h3>
                  <p className="text-sm text-inera-neutral-30 mb-4">
                    Produkt: <span className="font-semibold">{surveyProduct?.name || survey.productId}</span>
                  </p>
                </div>

                <div className="pt-3 border-t border-inera-secondary-90 flex items-center justify-between text-xs text-inera-neutral-40">
                  <span>Period: {survey.month}/{survey.year}</span>
                  <span className="text-inera-primary-40 font-bold flex items-center gap-1">
                    Visa detaljer <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
