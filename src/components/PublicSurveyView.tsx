import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { SusSurvey, SurveyRespondent, Product, SurveyTheme } from '../types';
import { 
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Mail, Send, ExternalLink, 
  HelpCircle, ShieldCheck, Sparkles, Building2, Stethoscope, Users as UsersIcon, Heart
} from 'lucide-react';
import { triggerSusMetricsSync } from '../services/syncService';
import { getSurveyTheme, SURVEY_THEMES } from '../utils/surveyThemes';

const SUS_QUESTIONS = [
  "Jag tror att jag skulle vilja använda det här systemet ofta.",
  "Jag upplevde systemet som onödigt komplext.",
  "Jag tyckte att systemet var lätt att använda.",
  "Jag tror att jag skulle behöva hjälp av en teknisk person för att kunna använda systemet.",
  "Jag tyckte att de olika funktionerna i systemet var väl integrerade.",
  "Jag tyckte att det fanns för mycket inkonsekvens i systemet.",
  "Jag kan föreställa mig att de flesta skulle lära sig att använda systemet mycket snabbt.",
  "Jag upplevde systemet som mycket otympligt att använda.",
  "Jag kände mig mycket säker när jag använde systemet.",
  "Jag behövde lära mig många saker innan jag kunde komma igång med systemet."
];

interface Props {
  surveyId?: string;
  respondentId?: string;
  previewSurvey?: Partial<SusSurvey>;
  previewTheme?: SurveyTheme;
  onClosePreview?: () => void;
}

export default function PublicSurveyView({ 
  surveyId, 
  respondentId, 
  previewSurvey,
  previewTheme,
  onClosePreview 
}: Props) {
  const isPreview = Boolean(previewSurvey || previewTheme);

  const [survey, setSurvey] = useState<SusSurvey | null>(
    (previewSurvey as SusSurvey) || null
  );
  const [product, setProduct] = useState<Product | null>(null);
  const [respondent, setRespondent] = useState<SurveyRespondent | null>(null);
  const [loading, setLoading] = useState(!isPreview);
  const [statusState, setStatusState] = useState<'active' | 'invalid' | 'closed' | 'already_used'>('active');
  
  // Enkätsteg: 0 = Intro, 1..10 = SUS-frågor, 11 = Fritext & Granskning, 12 = Tack
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(10).fill(0));
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdResponseId, setCreatedResponseId] = useState<string | null>(null);

  // Active theme configuration
  const activeThemeKey = previewTheme || survey?.theme || '1177_invanare';
  const themeMeta = getSurveyTheme(activeThemeKey);

  // Helper to determine the actual product name cleanly
  const getProductName = (): string => {
    if (product?.name) return product.name;
    
    // Fallback if product is not fetched/found
    if (survey?.productId && survey.productId !== 'general') {
      const pId = survey.productId;
      if (pId.startsWith('prod-')) {
        const clean = pId.replace('prod-', '').replace(/[-_]+/g, ' ');
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      }
      const clean = pId.replace(/[-_]+/g, ' ');
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    
    if (survey?.name) {
      const parts = survey.name.split('-');
      if (parts.length >= 3) {
        const candidate = parts.slice(0, parts.length - 2).join(' ').trim();
        if (candidate) return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
      return survey.name;
    }
    return 'Tjänsten / Systemet';
  };

  useEffect(() => {
    if (isPreview) {
      if (previewSurvey) {
        setSurvey(previewSurvey as SusSurvey);
      }
      setLoading(false);
      return;
    }
    if (surveyId) {
      loadSurveyData();
    }
  }, [surveyId, respondentId, isPreview, previewSurvey]);

  const loadSurveyData = async () => {
    if (!surveyId) return;
    setLoading(true);
    try {
      // 1. Hämta enkäten
      const surveyDoc = await getDoc(doc(db, 'susSurveys', surveyId));
      if (!surveyDoc.exists()) {
        setStatusState('invalid');
        setLoading(false);
        return;
      }

      const surveyData = { ...surveyDoc.data(), id: surveyDoc.id } as SusSurvey;
      setSurvey(surveyData);

      // 2. Kontrollera status
      if (surveyData.status !== 'active') {
        setStatusState('closed');
        setLoading(false);
        return;
      }

      // 3. Kontrollera slutdatum
      if (surveyData.endCondition === 'date' && surveyData.endDate) {
        const today = new Date().toISOString().split('T')[0];
        if (surveyData.endDate < today) {
          await updateDoc(doc(db, 'susSurveys', surveyId), { status: 'inactive' });
          setStatusState('closed');
          setLoading(false);
          return;
        }
      }

      // 4. Kontrollera max antal svar
      if (surveyData.endCondition === 'maxResponses' && surveyData.maxResponses) {
        const qResponses = query(collection(db, 'susResponses'), where('surveyId', '==', surveyId));
        const snap = await getDocs(qResponses);
        if (snap.size >= surveyData.maxResponses) {
          await updateDoc(doc(db, 'susSurveys', surveyId), { status: 'inactive' });
          setStatusState('closed');
          setLoading(false);
          return;
        }
      }

      // 5. Hämta produktnamn (med robust matchning)
      if (surveyData.productId) {
        const prodDoc = await getDoc(doc(db, 'products', surveyData.productId));
        if (prodDoc.exists()) {
          setProduct({ ...prodDoc.data(), id: prodDoc.id } as Product);
        } else {
          try {
            const productsSnap = await getDocs(collection(db, 'products'));
            const productsList = productsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
            
            let matched = productsList.find(p => p.id.toLowerCase() === surveyData.productId.toLowerCase());
            if (!matched) {
              matched = productsList.find(p => p.name.toLowerCase().trim() === surveyData.productId.toLowerCase().trim());
            }
            if (matched) {
              setProduct(matched);
            }
          } catch (err) {
            console.error("Fel vid produktmatchning:", err);
          }
        }
      }

      // 6. Hämta respondent om unik länk
      if (respondentId) {
        const respDoc = await getDoc(doc(db, 'surveyRespondents', respondentId));
        if (!respDoc.exists()) {
          setStatusState('invalid');
          setLoading(false);
          return;
        }
        const respData = { ...respDoc.data(), id: respDoc.id } as SurveyRespondent;
        if (respData.surveyId !== surveyId) {
          setStatusState('invalid');
          setLoading(false);
          return;
        }
        if (respData.used) {
          setStatusState('already_used');
          setLoading(false);
          return;
        }
        setRespondent(respData);
      }

      setStatusState('active');
    } catch (err) {
      console.error("Fel vid laddning av enkät:", err);
      setStatusState('invalid');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (questionIdx: number, value: number) => {
    const updated = [...answers];
    updated[questionIdx] = value;
    setAnswers(updated);

    // Automatisk navigering till nästa fråga efter val
    setTimeout(() => {
      if (step < 10) {
        setStep(step + 1);
      } else {
        setStep(11); // Fritext / Sammanfattning
      }
    }, 220);
  };

  const calculateSusScore = (scores: number[]) => {
    let rawSum = 0;
    for (let i = 0; i < 10; i++) {
      const val = scores[i];
      if (i % 2 === 0) {
        rawSum += (val - 1);
      } else {
        rawSum += (5 - val);
      }
    }
    return Math.round(rawSum * 2.5 * 10) / 10;
  };

  const handleSubmitSurvey = async () => {
    if (isPreview) {
      setStep(12);
      return;
    }
    if (!survey) return;
    setSubmitting(true);
    try {
      const susScore = calculateSusScore(answers);
      const nowIso = new Date().toISOString();

      const productId = survey.productId || 'prod-general';
      const respondentVal = respondentId || null;
      const commentVal = (comment || '').trim();

      const respRef = await addDoc(collection(db, 'susResponses'), {
        surveyId: survey.id,
        productId: productId,
        answers: answers || Array(10).fill(3),
        comment: commentVal,
        susScore,
        submittedAt: nowIso,
        linkType: respondentId ? 'unique' : 'general',
        respondentId: respondentVal,
        wentFurther: 0,
        createdAt: serverTimestamp()
      });

      setCreatedResponseId(respRef.id);

      if (respondentId) {
        try {
          await updateDoc(doc(db, 'surveyRespondents', respondentId), {
            used: true,
            answeredAt: nowIso
          });
        } catch (respErr) {
          console.warn("Kunde inte uppdatera respondent-status:", respErr);
        }
      }

      if (survey.endCondition === 'maxResponses' && survey.maxResponses) {
        try {
          const qResponses = query(collection(db, 'susResponses'), where('surveyId', '==', survey.id));
          const snap = await getDocs(qResponses);
          if (snap.size >= survey.maxResponses) {
            await updateDoc(doc(db, 'susSurveys', survey.id), { status: 'inactive' });
          }
        } catch (maxErr) {
          console.warn("Kunde inte kontrollera max-svar:", maxErr);
        }
      }

      triggerSusMetricsSync().catch(console.error);
      setStep(12);
    } catch (err: any) {
      console.error("Fel vid inskick av enkät:", err);
      alert("Kunde inte skicka in svaret. Försök igen.");
    } finally {
      setSubmitting(false);
    }
  };

  const ensureAbsoluteUrl = (url: string) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleExternalClick = async () => {
    if (createdResponseId && !isPreview) {
      try {
        await updateDoc(doc(db, 'susResponses', createdResponseId), {
          wentFurther: 1
        });
      } catch (err) {
        console.error("Error updating wentFurther:", err);
      }
    }
    if (survey?.externalSurveyUrl) {
      const targetUrl = ensureAbsoluteUrl(survey.externalSurveyUrl);
      window.location.href = targetUrl;
    }
  };

  // Header branding bar customized per graphical form
  const renderHeader = () => {
    const pName = getProductName();
    const titleText = `Utvärdering av ${pName}`;

    // Theme 1: 1177 Invånare (Classic white bar, 1177 logo/red dot, 1177 primary blue)
    if (themeMeta.id === '1177_invanare') {
      return (
        <header className="bg-white border-b-2 border-[#004b87] py-3.5 px-4 sm:px-6 shadow-xs">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center tracking-tight">
                <span className="font-extrabold text-2xl text-[#004b87] tracking-tighter">1177</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#c8102e] inline-block ml-1 -translate-y-1"></span>
              </div>
              <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block"></div>
              <span className="text-xs sm:text-sm font-bold text-[#004b87] hidden sm:inline-block">
                Vårdguiden
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#e6f1f8] text-[#004b87] border border-[#d0e3f0]">
                Invånare
              </span>
            </div>
          </div>
        </header>
      );
    }

    // Theme 2: 1177 Vårdpersonal (Clinical slate/navy header, petrol/cyan badge)
    if (themeMeta.id === '1177_vardpersonal') {
      return (
        <header className="bg-[#0e3a53] border-b border-[#007c91] py-3.5 px-4 sm:px-6 shadow-md text-white">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center tracking-tight">
                <span className="font-extrabold text-2xl text-white tracking-tighter">1177</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#007c91] inline-block ml-1 -translate-y-1"></span>
              </div>
              <div className="h-5 w-px bg-white/20 mx-1 hidden sm:block"></div>
              <span className="text-xs sm:text-sm font-semibold tracking-wide text-white/90 hidden sm:inline-flex items-center gap-1.5">
                <Stethoscope size={16} className="text-[#00c0d8]" />
                För vårdpersonal
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-[#007c91] text-white">
                Kliniskt Stöd
              </span>
            </div>
          </div>
        </header>
      );
    }

    // Theme 3: Inera B2B (Inera Plum #800040, Gold/sand accents, Corporate branding)
    if (themeMeta.id === 'inera_b2b') {
      return (
        <header className="bg-[#800040] border-b border-[#5e002e] py-3.5 px-4 sm:px-6 shadow-md text-white">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center font-bold text-white tracking-tighter text-sm border border-white/20">
                IN
              </div>
              <div>
                <span className="font-bold text-lg text-white tracking-wide block leading-none">INERA</span>
                <span className="text-[10px] text-white/80 uppercase tracking-widest block mt-0.5">Digital Välfärd</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-white/15 text-white border border-white/20">
                B2B & Organisation
              </span>
            </div>
          </div>
        </header>
      );
    }

    // Theme 4: Inera Invånare / Indra (Modern civic forest green, fresh mint accents)
    return (
      <header className="bg-white border-b-2 border-[#0c5a48] py-3.5 px-4 sm:px-6 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0c5a48] flex items-center justify-center text-white font-bold text-sm shadow-xs">
              <Sparkles size={16} />
            </div>
            <div>
              <span className="font-bold text-base sm:text-lg text-[#0c5a48] block leading-none">
                Inera Invånartjänster
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                Digitala medborgartjänster
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#eef8f4] text-[#0c5a48] border border-[#cde4d9]">
              Invånare (Indra)
            </span>
          </div>
        </div>
      </header>
    );
  };

  // Preview Floating Banner (if previewing from Admin)
  const renderPreviewBanner = () => {
    if (!isPreview) return null;
    return (
      <div className="sticky top-0 z-50 bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Förhandsgranskningsläge: Grafisk form <strong>"{themeMeta.name}"</strong> ({themeMeta.sourceLabel})</span>
        </div>
        {onClosePreview && (
          <button 
            onClick={onClosePreview}
            className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors"
          >
            Stäng förhandsgranskning
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors"
        style={{ backgroundColor: themeMeta.colors.bg, color: themeMeta.colors.text }}
      >
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: themeMeta.colors.primaryLight, color: themeMeta.colors.primary }}
          >
            <HelpCircle size={24} className="animate-spin" />
          </div>
          <p className="font-medium" style={{ color: themeMeta.colors.textMuted }}>Laddar enkät...</p>
        </div>
      </div>
    );
  }

  // Sida för inaktiv / avslutad enkät
  if (statusState === 'closed') {
    return (
      <div 
        className="min-h-screen flex flex-col justify-between"
        style={{ backgroundColor: themeMeta.colors.bg, color: themeMeta.colors.text }}
      >
        <div>
          {renderPreviewBanner()}
          {renderHeader()}
          <main className="max-w-xl mx-auto px-4 py-8">
            <div 
              className={`p-8 shadow-md text-center border ${themeMeta.ui.borderRadius}`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              <div 
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: themeMeta.colors.primaryLight, color: themeMeta.colors.textMuted }}
              >
                <AlertCircle size={32} />
              </div>
              <h1 className="text-2xl font-bold mb-3" style={{ color: themeMeta.colors.text }}>
                Mätningen är avslutad
              </h1>
              <p className="leading-relaxed mb-6" style={{ color: themeMeta.colors.textMuted }}>
                Den här mätningen är nu avslutad. Tack för ditt intresse.
              </p>
            </div>
          </main>
        </div>
        <footer 
          className="py-4 px-6 text-center text-xs border-t"
          style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border, color: themeMeta.colors.textMuted }}
        >
          {themeMeta.ui.footerText}
        </footer>
      </div>
    );
  }

  // Sida för redan använd unik länk
  if (statusState === 'already_used' && survey) {
    const pName = getProductName();
    const mailtoSubject = encodeURIComponent(`SUS-mätning ${survey?.name || pName}`);
    const mailtoUrl = `mailto:ux@inera.se?subject=${mailtoSubject}`;

    const defaultAlreadyUsedText = `Denna länk har redan använts för att registrera en utvärdering för [ProductName] och kan inte användas fler gånger.`;
    const rawAlreadyUsedText = survey.alreadyAnsweredText || defaultAlreadyUsedText;
    const displayAlreadyUsedText = rawAlreadyUsedText.replaceAll('[ProductName]', pName);

    return (
      <div 
        className="min-h-screen flex flex-col justify-between"
        style={{ backgroundColor: themeMeta.colors.bg, color: themeMeta.colors.text }}
      >
        <div>
          {renderPreviewBanner()}
          {renderHeader()}
          <main className="max-w-2xl mx-auto px-4 pb-12 pt-4">
            <div 
              className={`p-8 shadow-lg border ${themeMeta.ui.borderRadius}`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              <h1 className="text-3xl font-bold mb-4" style={{ color: themeMeta.colors.text }}>
                Utvärdering av {pName}
              </h1>

              <div className="leading-relaxed space-y-4 mb-8 text-base" style={{ color: themeMeta.colors.textMuted }}>
                <p>{displayAlreadyUsedText}</p>
              </div>

              <div 
                className="p-4 rounded-xl border flex items-center justify-between text-sm"
                style={{ backgroundColor: themeMeta.colors.primaryLight, borderColor: themeMeta.colors.border }}
              >
                <span style={{ color: themeMeta.colors.textMuted }}>Frågor eller funderingar?</span>
                <a 
                  href={mailtoUrl}
                  className="inline-flex items-center gap-2 font-bold hover:underline"
                  style={{ color: themeMeta.colors.primary }}
                >
                  <Mail size={16} /> ux@inera.se
                </a>
              </div>
            </div>
          </main>
        </div>
        <footer 
          className="py-4 px-6 text-center text-xs border-t"
          style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border, color: themeMeta.colors.textMuted }}
        >
          {themeMeta.ui.footerText}
        </footer>
      </div>
    );
  }

  // Sida för ogiltig länk
  if (statusState === 'invalid' || (!survey && !isPreview)) {
    return (
      <div 
        className="min-h-screen flex flex-col justify-between"
        style={{ backgroundColor: themeMeta.colors.bg, color: themeMeta.colors.text }}
      >
        <div>
          {renderPreviewBanner()}
          {renderHeader()}
          <main className="max-w-xl mx-auto px-4 py-8">
            <div 
              className={`p-8 shadow-md text-center border ${themeMeta.ui.borderRadius}`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 mx-auto mb-4 flex items-center justify-center">
                <AlertCircle size={32} />
              </div>
              <h1 className="text-2xl font-bold mb-3" style={{ color: themeMeta.colors.text }}>
                Ogiltig enkätlänk
              </h1>
              <p className="leading-relaxed mb-6" style={{ color: themeMeta.colors.textMuted }}>
                Länken du använde verkar vara ogiltig eller så har enkäten tagits bort. Kontrollera adressen och försök igen.
              </p>
            </div>
          </main>
        </div>
        <footer 
          className="py-4 px-6 text-center text-xs border-t"
          style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border, color: themeMeta.colors.textMuted }}
        >
          {themeMeta.ui.footerText}
        </footer>
      </div>
    );
  }

  const productName = getProductName();
  const mailtoSubject = encodeURIComponent(`SUS-mätning ${survey?.name || productName}`);
  const mailtoUrl = `mailto:ux@inera.se?subject=${mailtoSubject}`;

  const defaultIntro = `Vi vill veta hur du upplevde att använda ${productName}. Enkäten består av tio påståenden och tar cirka två minuter att besvara. Utgå från din senaste användning av produkten när du svarar.`;
  const displayIntro = survey?.introText
    ? survey.introText.replaceAll('[Produkten]', productName)
    : defaultIntro;

  const defaultFreeLabel = `Har du något mer du vill berätta om din upplevelse av ${productName}?`;
  const displayFreeLabel = survey?.freeTextLabel
    ? survey.freeTextLabel.replaceAll('[Produkten]', productName)
    : defaultFreeLabel;

  const defaultThankYou = `Tack för att du tog dig tid att svara. Dina synpunkter hjälper oss att förbättra produkten.`;
  const displayThankYou = survey?.thankYouText || defaultThankYou;

  return (
    <div 
      className="min-h-screen flex flex-col justify-between transition-colors duration-200"
      style={{ backgroundColor: themeMeta.colors.bg, color: themeMeta.colors.text }}
    >
      <div>
        {renderPreviewBanner()}
        {renderHeader()}

        <main className="max-w-2xl mx-auto px-4 pb-12 pt-2">
          {/* Steg 0: Inledning */}
          {step === 0 && (
            <div 
              className={`p-6 sm:p-10 shadow-lg border ${themeMeta.ui.borderRadius} transition-all`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span 
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: themeMeta.colors.badgeBg, color: themeMeta.colors.badgeText }}
                >
                  {themeMeta.shortLabel}
                </span>
                <span className="text-xs" style={{ color: themeMeta.colors.textMuted }}>• Cirka 2 minuter</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: themeMeta.colors.text }}>
                Utvärdering av {productName}
              </h1>

              <div className="leading-relaxed space-y-4 mb-8 text-base" style={{ color: themeMeta.colors.textMuted }}>
                <p>{displayIntro}</p>
              </div>

              <div 
                className="p-4 rounded-xl border mb-8 flex items-center justify-between text-sm"
                style={{ backgroundColor: themeMeta.colors.primaryLight, borderColor: themeMeta.colors.border }}
              >
                <span style={{ color: themeMeta.colors.textMuted }}>Frågor eller funderingar?</span>
                <a 
                  href={mailtoUrl}
                  className="inline-flex items-center gap-2 font-bold hover:underline"
                  style={{ color: themeMeta.colors.primary }}
                >
                  <Mail size={16} /> ux@inera.se
                </a>
              </div>

              <button 
                onClick={() => setStep(1)}
                className="w-full py-4 text-base font-bold text-white shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 rounded-xl cursor-pointer hover:opacity-95"
                style={{ backgroundColor: themeMeta.colors.primary }}
              >
                Starta enkäten <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Steg 1-10: SUS Frågor */}
          {step >= 1 && step <= 10 && (
            <div 
              className={`p-6 sm:p-8 shadow-lg border ${themeMeta.ui.borderRadius} transition-all`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              {/* Progress & counter */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2" style={{ color: themeMeta.colors.textMuted }}>
                  <span>Fråga {step} av 10</span>
                  <span>{Math.round((step / 10) * 100)}%</span>
                </div>
                <div 
                  className="w-full h-2.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: themeMeta.colors.primaryLight }}
                >
                  <div 
                    className="h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: `${(step / 10) * 100}%`,
                      backgroundColor: themeMeta.colors.primary 
                    }}
                  ></div>
                </div>
              </div>

              {/* Question Text */}
              <h2 className="text-xl sm:text-2xl font-bold mb-8 min-h-[4rem] flex items-center" style={{ color: themeMeta.colors.text }}>
                {SUS_QUESTIONS[step - 1]}
              </h2>

              {/* 5-point Likert Scale styled per graphical form */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between text-xs font-bold px-1 mb-1" style={{ color: themeMeta.colors.textMuted }}>
                  <span>1 = Instämmer inte alls</span>
                  <span>5 = Instämmer helt</span>
                </div>

                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                  {[1, 2, 3, 4, 5].map((val) => {
                    const isSelected = answers[step - 1] === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleSelectOption(step - 1, val)}
                        className={`py-4 sm:py-5 border-2 font-bold text-lg sm:text-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          themeMeta.ui.scaleStyle === 'fresh-circles' 
                            ? 'rounded-full aspect-square' 
                            : themeMeta.ui.scaleStyle === 'structured-tiles'
                            ? 'rounded-lg'
                            : 'rounded-xl'
                        }`}
                        style={{
                          borderColor: isSelected ? themeMeta.colors.primary : themeMeta.colors.border,
                          backgroundColor: isSelected ? themeMeta.colors.primary : themeMeta.colors.cardBg,
                          color: isSelected ? '#ffffff' : themeMeta.colors.text,
                          boxShadow: isSelected ? `0 4px 12px ${themeMeta.colors.primary}40` : undefined,
                          transform: isSelected ? 'scale(1.04)' : 'scale(1)'
                        }}
                      >
                        <span>{val}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation Controls */}
              <div 
                className="flex items-center justify-between pt-4 border-t"
                style={{ borderColor: themeMeta.colors.border }}
              >
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={step === 1}
                  className="px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 disabled:opacity-40 hover:bg-black/5 transition-colors cursor-pointer"
                  style={{ color: themeMeta.colors.textMuted }}
                >
                  <ChevronLeft size={16} /> Föregående
                </button>

                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={answers[step - 1] === 0}
                  className="px-5 py-2.5 rounded-lg text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow-xs hover:opacity-95 transition-all cursor-pointer"
                  style={{ backgroundColor: themeMeta.colors.primary }}
                >
                  Nästa <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Steg 11: Fritextfråga & Granskning */}
          {step === 11 && (
            <div 
              className={`p-6 sm:p-8 shadow-lg border ${themeMeta.ui.borderRadius} transition-all`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              <h2 className="text-2xl font-bold mb-2" style={{ color: themeMeta.colors.text }}>
                Frivillig kommentar & Inskick
              </h2>
              <p className="text-sm mb-6" style={{ color: themeMeta.colors.textMuted }}>
                Du har besvarat alla 10 påståenden. Du kan lämna en valfri kommentar nedan innan du skickar in.
              </p>

              <div className="mb-6">
                <label className="block text-sm font-bold mb-2" style={{ color: themeMeta.colors.text }}>
                  {displayFreeLabel}
                </label>
                <textarea
                  className="w-full h-32 p-3 border rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{ 
                    borderColor: themeMeta.colors.border,
                    backgroundColor: themeMeta.colors.cardBg,
                    color: themeMeta.colors.text
                  }}
                  placeholder="Skriv dina tankar här (valfritt)..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              {/* Visual review summary */}
              <div 
                className="p-4 rounded-xl border mb-8"
                style={{ backgroundColor: themeMeta.colors.primaryLight, borderColor: themeMeta.colors.border }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-xs uppercase" style={{ color: themeMeta.colors.textMuted }}>
                    Dina svar (10 av 10 besvarade)
                  </span>
                  <button 
                    onClick={() => setStep(1)} 
                    className="text-xs font-bold hover:underline cursor-pointer"
                    style={{ color: themeMeta.colors.primary }}
                  >
                    Ändra svar
                  </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {answers.map((ans, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => setStep(idx + 1)}
                      className="p-2 text-center rounded bg-white border hover:shadow-xs transition-colors cursor-pointer"
                      style={{ borderColor: themeMeta.colors.border }}
                      title={`Fråga ${idx + 1}: Val ${ans}`}
                    >
                      <div className="text-[10px] font-bold" style={{ color: themeMeta.colors.textMuted }}>F{idx + 1}</div>
                      <div className="text-sm font-bold" style={{ color: themeMeta.colors.primary }}>{ans}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div 
                className="flex items-center justify-between pt-4 border-t"
                style={{ borderColor: themeMeta.colors.border }}
              >
                <button
                  type="button"
                  onClick={() => setStep(10)}
                  className="px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 hover:bg-black/5 transition-colors cursor-pointer"
                  style={{ color: themeMeta.colors.textMuted }}
                >
                  <ChevronLeft size={16} /> Tillbaka till frågorna
                </button>

                <button
                  type="button"
                  onClick={handleSubmitSurvey}
                  disabled={submitting}
                  className="py-3 px-6 text-base font-bold text-white rounded-xl flex items-center gap-2 shadow-md hover:opacity-95 transition-all cursor-pointer"
                  style={{ backgroundColor: themeMeta.colors.primary }}
                >
                  <Send size={18} /> {submitting ? 'Skickar in...' : 'Skicka in enkät'}
                </button>
              </div>
            </div>
          )}

          {/* Steg 12: Tackskärm */}
          {step === 12 && (
            <div 
              className={`p-8 sm:p-10 shadow-xl border text-center ${themeMeta.ui.borderRadius}`}
              style={{ backgroundColor: themeMeta.colors.cardBg, borderColor: themeMeta.colors.border }}
            >
              <div 
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center border"
                style={{ 
                  backgroundColor: themeMeta.colors.primaryLight, 
                  color: themeMeta.colors.primary,
                  borderColor: themeMeta.colors.primary
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: themeMeta.colors.text }}>
                Tack för ditt svar!
              </h2>

              <p className="text-base leading-relaxed mb-8 max-w-lg mx-auto" style={{ color: themeMeta.colors.textMuted }}>
                {displayThankYou}
              </p>

              {/* Option to proceed to external survey */}
              {survey?.externalSurveyEnabled && survey?.externalSurveyUrl && (
                <div 
                  className="p-6 rounded-2xl border max-w-md mx-auto mt-6"
                  style={{ backgroundColor: themeMeta.colors.primaryLight, borderColor: themeMeta.colors.border }}
                >
                  <h3 className="font-bold mb-2 text-lg" style={{ color: themeMeta.colors.text }}>
                    Vill du lämna ytterligare feedback?
                  </h3>
                  <p className="text-xs mb-5" style={{ color: themeMeta.colors.textMuted }}>
                    Vi genomför en fördjupad undersökning för att förbättra tjänsten ytterligare.
                  </p>
                  <button
                    onClick={handleExternalClick}
                    className="w-full py-3 text-base font-bold text-white rounded-xl flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition-all cursor-pointer"
                    style={{ backgroundColor: themeMeta.colors.primary }}
                  >
                    {survey.externalSurveyBtnText || 'Fortsätt'} <ExternalLink size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <footer 
        className="py-4 px-6 text-center text-xs border-t transition-colors"
        style={{ 
          backgroundColor: themeMeta.colors.cardBg, 
          borderColor: themeMeta.colors.border, 
          color: themeMeta.colors.textMuted 
        }}
      >
        {themeMeta.ui.footerText}
      </footer>
    </div>
  );
}
