import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { SusSurvey, SurveyRespondent, Product, SurveyTheme } from '../types';
import { 
  CheckCircle2, AlertCircle, Mail, ExternalLink, 
  Clock, Loader2
} from 'lucide-react';
import { triggerSusMetricsSync } from '../services/syncService';
import { getSurveyTheme } from '../utils/surveyThemes';
import ineraLogo from '../Images/Inera logo 1.0 färg.svg';

const SUS_QUESTIONS = [
  "Jag tror att jag skulle vilja använda det här systemet ofta",
  "Jag upplevde systemet som onödigt komplext",
  "Jag tyckte att systemet var lätt att använda",
  "Jag tror att jag skulle behöva hjälp av en teknisk person för att kunna använda systemet",
  "Jag tyckte att de olika funktionerna i systemet var väl integrerade",
  "Jag tyckte att det fanns för mycket inkonsekvens i systemet",
  "Jag kan föreställa mig att de flesta skulle lära sig att använda systemet mycket snabbt",
  "Jag upplevde systemet som mycket otympligt att använda",
  "Jag kände mig mycket säker när jag använde systemet",
  "Jag behövde lära mig många saker innan jag kunde komma igång med systemet"
];

interface Props {
  surveyId?: string;
  respondentId?: string;
  previewSurvey?: Partial<SusSurvey>;
  previewTheme?: SurveyTheme;
  previewProduct?: Product;
  onClosePreview?: () => void;
}

// 1177 SVG Logo Component (using exact official vector paths)
const Logo1177 = ({ color = '#C12143', className = 'h-7 sm:h-8 w-auto' }: { color?: string; className?: string }) => (
  <svg 
    viewBox="0 0 255 99" 
    className={className}
    style={{ fill: color }}
    aria-label="1177"
  >
    <path d="M14.7,87.5c0,6.4,5.2,11.5,11.6,11.5s11.6-5.2,11.6-11.5v-76C37.9,5.2,32.7,0,26.3,0H12.6C5.6,0,0,5.7,0,12.5 C0,19.5,5.7,25,12.7,25h2.1L14.7,87.5L14.7,87.5z"/>
    <path d="M69.1,25.2v62.3c0,6.4,5.2,11.5,11.6,11.5s11.6-5.2,11.6-11.5v-76C92.3,5.2,87.1,0,80.7,0H67 c-7,0-12.6,5.7-12.6,12.5c0,7,5.7,12.5,12.7,12.5L69.1,25.2L69.1,25.2z"/>
    <g>
      <path d="M198.1,25.2h18.6L226.9,0h-28.8c-7,0-12.6,5.7-12.6,12.5C185.4,19.5,191.1,25.2,198.1,25.2z"/>
      <path d="M247.7,0.9c-6-2.4-12.7,0.5-15.1,6.5L202,83.1c-2.4,6,0.5,12.6,6.5,15s12.7-0.5,15.1-6.5l30.6-75.8 C256.5,10,253.6,3.2,247.7,0.9z"/>
    </g>
    <g>
      <path d="M118.2,25.2h18.6L147,0h-28.8c-7,0-12.6,5.7-12.6,12.5C105.5,19.5,111.2,25.2,118.2,25.2z"/>
      <path d="M167.8,0.9c-6-2.4-12.7,0.5-15.1,6.5l-30.6,75.7c-2.4,6,0.5,12.6,6.5,15c6,2.4,12.7-0.5,15.1-6.5l30.6-75.8 C176.6,10,173.7,3.2,167.8,0.9z"/>
    </g>
  </svg>
);

export default function PublicSurveyView({ 
  surveyId, 
  respondentId, 
  previewSurvey,
  previewTheme,
  previewProduct,
  onClosePreview 
}: Props) {
  const isPreview = Boolean(previewSurvey || previewTheme);

  const [survey, setSurvey] = useState<SusSurvey | null>(
    (previewSurvey as SusSurvey) || null
  );
  const [product, setProduct] = useState<Product | null>(previewProduct || null);
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
  const activeThemeKey = previewTheme || survey?.theme || 'inera_b2b';
  const themeMeta = getSurveyTheme(activeThemeKey);

  // Helper to determine the actual product name cleanly
  const getProductName = (): string => {
    if (product?.name) return product.name;
    if (previewProduct?.name) return previewProduct.name;
    
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
    return 'Inera Design System (IDS)';
  };

  useEffect(() => {
    if (isPreview) {
      if (previewSurvey) {
        setSurvey(previewSurvey as SusSurvey);
      }
      if (previewProduct) {
        setProduct(previewProduct);
      } else if (previewSurvey?.productId) {
        getDoc(doc(db, 'products', previewSurvey.productId))
          .then((d) => {
            if (d.exists()) setProduct({ ...d.data(), id: d.id } as Product);
          })
          .catch(() => {});
      }
      setLoading(false);
      return;
    }
    if (surveyId) {
      loadSurveyData();
    }
  }, [surveyId, respondentId, isPreview, previewSurvey, previewProduct]);

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

      // 5. Hämta produktnamn
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

    // Automatisk framsteg till nästa fråga efter val
    setTimeout(() => {
      if (step < 10) {
        setStep(step + 1);
      } else {
        setStep(11); // Fritext & Granskning
      }
    }, 200);
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

  // Header branding bar (exact match to sketches)
  const renderHeader = () => {
    const pName = getProductName();
    const h = themeMeta.header;

    return (
      <header className="bg-white border-b border-[#e5e1da] px-4 sm:px-12 py-3.5 flex items-center justify-between">
        {/* Left Side: Brand Logo + Separator + "Namn" */}
        <div className="flex items-center gap-3">
          {h.logoType === 'inera' ? (
            <img 
              src={ineraLogo} 
              alt="Inera" 
              className="h-7 sm:h-8 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          ) : h.logoType === '1177_vardpersonal' ? (
            <Logo1177 color="#28588f" className="h-7 sm:h-8 w-auto" />
          ) : (
            <Logo1177 color="#C12143" className="h-7 sm:h-8 w-auto" />
          )}

          {/* Vertical divider */}
          <div className="h-6 w-px bg-[#cfd7dd] mx-1"></div>

          {/* "Namn" title in specified color */}
          <span 
            className="text-lg sm:text-xl font-bold font-sans tracking-tight"
            style={{ color: h.nameColor }}
          >
            {h.nameText || 'Namn'}
          </span>
        </div>

        {/* Right Side: "Utvärdering av: [ Produktnamn ]" */}
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-neutral-700 hidden sm:inline font-normal">
            Utvärdering av:
          </span>
          <div 
            className="border px-3 py-1 text-xs sm:text-sm font-normal bg-white"
            style={{ 
              borderColor: h.productTagBorder, 
              color: h.productTagText 
            }}
          >
            {pName}
          </div>
        </div>
      </header>
    );
  };

  // Footer (exact match to sketches)
  const renderFooter = () => {
    const f = themeMeta.footer;
    return (
      <footer className="py-6 text-center text-sm" style={{ color: f.textColor }}>
        <p>{f.mainText}</p>
      </footer>
    );
  };

  // Preview Floating Banner (if previewing from Admin)
  const renderPreviewBanner = () => {
    if (!isPreview) return null;
    return (
      <div className="sticky top-0 z-50 bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Förhandsgranskningsläge: Grafisk form <strong>"{themeMeta.name}"</strong></span>
        </div>
        {onClosePreview && (
          <button 
            onClick={onClosePreview}
            className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors cursor-pointer"
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
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ backgroundColor: themeMeta.colors.bg }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-neutral-600" />
          <p className="text-sm font-medium text-neutral-600">Laddar formulär...</p>
        </div>
      </div>
    );
  }

  // Inaktiv / Avslutad enkät
  if (statusState === 'closed') {
    return (
      <div 
        className="min-h-screen flex flex-col justify-between"
        style={{ backgroundColor: themeMeta.colors.bg }}
      >
        <div>
          {renderPreviewBanner()}
          {renderHeader()}
          <main className="max-w-2xl mx-auto px-4 py-12">
            <div className="bg-white p-8 sm:p-10 rounded-2xl border border-[#e5e1da] shadow-md text-center">
              <div className="w-16 h-16 rounded-full bg-neutral-100 text-neutral-600 mx-auto mb-4 flex items-center justify-center">
                <AlertCircle size={32} />
              </div>
              <h1 className="text-2xl font-bold mb-3" style={{ color: themeMeta.colors.heading }}>
                Mätningen är avslutad
              </h1>
              <p className="text-neutral-700 leading-relaxed">
                Den här mätningen är nu avslutad. Tack för ditt intresse.
              </p>
            </div>
          </main>
        </div>
        {renderFooter()}
      </div>
    );
  }

  // Redan använd unik länk
  if (statusState === 'already_used' && survey) {
    const pName = getProductName();
    const mailtoSubject = encodeURIComponent(`SUS-mätning ${survey?.name || pName}`);
    const mailtoUrl = `mailto:ux@inera.se?subject=${mailtoSubject}`;

    return (
      <div 
        className="min-h-screen flex flex-col justify-between"
        style={{ backgroundColor: themeMeta.colors.bg }}
      >
        <div>
          {renderPreviewBanner()}
          {renderHeader()}
          <main className="max-w-2xl mx-auto px-4 py-12">
            <div className="bg-white p-8 sm:p-10 rounded-2xl border border-[#e5e1da] shadow-md">
              <h1 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: themeMeta.colors.heading }}>
                Utvärdering av {pName}
              </h1>

              <div className="leading-relaxed space-y-4 mb-8 text-neutral-700 text-base">
                <p>Denna länk har redan använts för att registrera en utvärdering för {pName} och kan inte användas fler gånger.</p>
              </div>

              <div className="rounded-xl border border-neutral-300 p-4 sm:p-5 flex items-center justify-between bg-white text-sm sm:text-base">
                <span className="text-neutral-700">Frågor eller funderingar</span>
                <a 
                  href={mailtoUrl}
                  className="inline-flex items-center gap-2 font-normal underline hover:opacity-80"
                  style={{ color: themeMeta.colors.link }}
                >
                  <Mail size={18} /> ux@inera.se
                </a>
              </div>
            </div>
          </main>
        </div>
        {renderFooter()}
      </div>
    );
  }

  // Ogiltig enkätlänk
  if (statusState === 'invalid' || (!survey && !isPreview)) {
    return (
      <div 
        className="min-h-screen flex flex-col justify-between"
        style={{ backgroundColor: themeMeta.colors.bg }}
      >
        <div>
          {renderPreviewBanner()}
          {renderHeader()}
          <main className="max-w-2xl mx-auto px-4 py-12">
            <div className="bg-white p-8 sm:p-10 rounded-2xl border border-[#e5e1da] shadow-md text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 mx-auto mb-4 flex items-center justify-center">
                <AlertCircle size={32} />
              </div>
              <h1 className="text-2xl font-bold mb-3 text-neutral-900">
                Ogiltig enkätlänk
              </h1>
              <p className="text-neutral-700 leading-relaxed">
                Länken du använde verkar vara ogiltig eller så har enkäten tagits bort. Kontrollera adressen och försök igen.
              </p>
            </div>
          </main>
        </div>
        {renderFooter()}
      </div>
    );
  }

  const productName = getProductName();
  const mailtoSubject = encodeURIComponent(`SUS-mätning ${survey?.name || productName}`);
  const mailtoUrl = `mailto:ux@inera.se?subject=${mailtoSubject}`;

  const defaultIntro = `Vi vill veta hur du upplevde att använda ${productName}. Enkäten består av tio påståenden. Utgå från din senaste användning av produkten när du svarar.`;
  const displayIntro = survey?.introText
    ? survey.introText.replaceAll('[Produkten]', productName)
    : defaultIntro;

  const defaultFreeLabel = `Har du något mer du vill berätta om din upplevelse av ${productName} (IDS)`;
  const displayFreeLabel = survey?.freeTextLabel
    ? survey.freeTextLabel.replaceAll('[Produkten]', productName)
    : defaultFreeLabel;

  const defaultThankYou = `Tack för att du tog dig tid att svara. Dina synpunkter hjälper oss att förbättra produkten.`;
  const displayThankYou = survey?.thankYouText || defaultThankYou;

  return (
    <div 
      className="min-h-screen flex flex-col justify-between font-sans"
      style={{ backgroundColor: themeMeta.colors.bg, color: themeMeta.colors.text }}
    >
      <div>
        {renderPreviewBanner()}
        {renderHeader()}

        <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
          {/* Steg 0: Inledning / Startskärm */}
          {step === 0 && (
            <div className="bg-white rounded-2xl border border-[#e5e1da] shadow-md p-6 sm:p-10">
              {/* Approximate time badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-neutral-400 bg-[#d8dde3]/60 text-neutral-800 text-xs sm:text-sm font-normal mb-6">
                <Clock size={16} className="text-neutral-700 shrink-0" />
                <span>Ungefärlig tid att fylla i enkäten, 1-2 minuter</span>
              </div>

              {/* Main Heading */}
              <h1 
                className="text-2xl sm:text-[28px] font-bold mb-4 leading-tight font-sans"
                style={{ color: themeMeta.colors.heading }}
              >
                Utvärdering av {productName}
              </h1>

              {/* Ingress / Description */}
              <div className="text-base text-neutral-700 leading-relaxed mb-8">
                <p>{displayIntro}</p>
              </div>

              {/* Contact Questions Box */}
              <div className="rounded-xl border border-neutral-300 p-4 sm:p-5 flex items-center justify-between mb-8 bg-white text-sm sm:text-base">
                <span className="text-neutral-700">Frågor eller funderingar</span>
                <a 
                  href={mailtoUrl}
                  className="inline-flex items-center gap-2 font-normal underline hover:opacity-80 transition-opacity"
                  style={{ color: themeMeta.colors.link }}
                >
                  <Mail size={18} /> ux@inera.se
                </a>
              </div>

              {/* Start Button (Centered, Uppercase, Theme Button Color) */}
              <button 
                type="button"
                onClick={() => setStep(1)}
                className="mx-auto block py-3 px-8 text-sm sm:text-base font-bold text-white uppercase tracking-wider rounded-lg shadow-sm hover:opacity-95 active:scale-98 transition-all cursor-pointer"
                style={{ backgroundColor: themeMeta.colors.button }}
              >
                STARTA ENKÄTEN
              </button>
            </div>
          )}

          {/* Steg 1-10: SUS Frågor */}
          {step >= 1 && step <= 10 && (
            <div className="bg-white rounded-2xl border border-[#e5e1da] shadow-md p-6 sm:p-10">
              {/* Top Row: Product context & Question count */}
              <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-neutral-700 hidden sm:inline font-normal">
                    Utvärdering av:
                  </span>
                  <div 
                    className="border px-2.5 py-0.5 text-xs sm:text-sm font-normal bg-white"
                    style={{ 
                      borderColor: themeMeta.header.productTagBorder, 
                      color: themeMeta.header.productTagText 
                    }}
                  >
                    {productName}
                  </div>
                </div>
                <div className="text-xs sm:text-sm font-bold text-neutral-700">
                  Fråga {step} av 10 ({step * 10}%)
                </div>
              </div>

              {/* Progress Bar (Blue fill inside border container) */}
              <div className="w-full h-2.5 sm:h-3 rounded-full border border-neutral-400 bg-white overflow-hidden mb-6 p-0.5">
                <div 
                  className="h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${step * 10}%`,
                    backgroundColor: themeMeta.colors.progressBar 
                  }}
                />
              </div>

              {/* Question Text */}
              <h2 className="text-2xl sm:text-[26px] font-bold text-neutral-900 leading-snug mb-8 min-h-[4.5rem] flex items-center font-sans">
                {SUS_QUESTIONS[step - 1]}
              </h2>

              {/* Likert Scale 1-5 */}
              <div className="mb-8">
                <div className="flex justify-between text-xs sm:text-sm text-neutral-700 mb-2 px-1">
                  <span>1 = instämmer inte alls</span>
                  <span>5 = instämmer helt</span>
                </div>

                <div className="grid grid-cols-5 gap-3 sm:gap-4">
                  {[1, 2, 3, 4, 5].map((val) => {
                    const isSelected = answers[step - 1] === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleSelectOption(step - 1, val)}
                        className={`h-20 sm:h-24 rounded-xl border flex items-center justify-center text-3xl sm:text-4xl font-bold cursor-pointer transition-all ${
                          isSelected 
                            ? 'text-white shadow-sm border-transparent' 
                            : 'border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500 hover:bg-neutral-50'
                        }`}
                        style={isSelected ? { backgroundColor: themeMeta.colors.button, borderColor: themeMeta.colors.button } : {}}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-5 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={step === 1}
                  className="font-bold text-xs sm:text-sm uppercase tracking-wider underline hover:opacity-80 transition-colors disabled:opacity-0 cursor-pointer"
                  style={{ color: themeMeta.colors.link }}
                >
                  FÖREGÅENDE
                </button>

                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={answers[step - 1] === 0}
                  className="py-2.5 px-6 rounded-lg text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-sm hover:opacity-95 transition-all disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: themeMeta.colors.button }}
                >
                  NÄSTA
                </button>
              </div>
            </div>
          )}

          {/* Steg 11: Fritextfråga & Granskning */}
          {step === 11 && (
            <div className="bg-white rounded-2xl border border-[#e5e1da] shadow-md p-6 sm:p-10">
              {/* Top Row */}
              <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-neutral-700 hidden sm:inline font-normal">
                    Utvärdering av:
                  </span>
                  <div 
                    className="border px-2.5 py-0.5 text-xs sm:text-sm font-normal bg-white"
                    style={{ 
                      borderColor: themeMeta.header.productTagBorder, 
                      color: themeMeta.header.productTagText 
                    }}
                  >
                    {productName}
                  </div>
                </div>
                <div className="text-xs sm:text-sm font-bold text-neutral-700">
                  Avslutande kommentar
                </div>
              </div>

              {/* Heading in theme color */}
              <h2 
                className="text-2xl sm:text-[26px] font-bold mb-2 font-sans"
                style={{ color: themeMeta.colors.heading }}
              >
                Frivillig kommentar & inskick
              </h2>
              <p className="text-sm sm:text-base text-neutral-700 mb-6 leading-relaxed">
                Du har besvarat alla 10 påståenden för <strong>{productName}</strong>. Du kan lämna en valfri kommentar nedan innan du skickar in.
              </p>

              {/* Free text input */}
              <div className="mb-2">
                <label className="block text-sm sm:text-base text-neutral-800 mb-2">
                  {displayFreeLabel}
                </label>
                <textarea
                  maxLength={500}
                  className="w-full h-32 p-3.5 border border-neutral-400 rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  placeholder=""
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="text-right text-xs italic text-neutral-500 mt-1 mb-6">
                  {comment.length} av 500 tecken
                </div>
              </div>

              {/* Review answers box */}
              <div className="rounded-xl border border-neutral-300 p-4 sm:p-5 mb-8 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-xs sm:text-sm text-neutral-800">
                    Dina svar (10 av 10 besvarade för {productName})
                  </span>
                  <button 
                    type="button"
                    onClick={() => setStep(1)} 
                    className="font-bold text-xs sm:text-sm uppercase tracking-wider underline hover:opacity-80 cursor-pointer"
                    style={{ color: themeMeta.colors.link }}
                  >
                    ÄNDRA SVAR
                  </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2">
                  {answers.map((ans, idx) => (
                    <button 
                      key={idx} 
                      type="button"
                      onClick={() => setStep(idx + 1)}
                      className="h-14 rounded-lg border border-neutral-300 bg-white flex flex-col items-center justify-center p-1 cursor-pointer hover:border-neutral-500 transition-colors"
                      title={`Fråga ${idx + 1}: Val ${ans}`}
                    >
                      <div className="text-[11px] font-bold text-neutral-600">F{idx + 1}</div>
                      <div className="text-sm font-bold text-neutral-900">{ans}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bottom Buttons */}
              <div className="flex items-center justify-between pt-5 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setStep(10)}
                  className="font-bold text-xs sm:text-sm uppercase tracking-wider underline hover:opacity-80 transition-colors cursor-pointer"
                  style={{ color: themeMeta.colors.link }}
                >
                  TILLBAKA TILL FRÅGORNA
                </button>

                <button
                  type="button"
                  onClick={handleSubmitSurvey}
                  disabled={submitting}
                  className="py-2.5 px-6 rounded-lg text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-sm hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: themeMeta.colors.button }}
                >
                  {submitting ? 'SKICKAR IN...' : 'SKICKA IN ENKÄT'}
                </button>
              </div>
            </div>
          )}

          {/* Steg 12: Tackskärm */}
          {step === 12 && (
            <div className="bg-white rounded-2xl border border-[#e5e1da] shadow-md p-8 sm:p-12 text-center">
              {/* Green Success Check Circle */}
              <div 
                className="w-14 h-14 rounded-full border-2 mx-auto mb-4 flex items-center justify-center"
                style={{ 
                  borderColor: themeMeta.colors.successCheck,
                  color: themeMeta.colors.successCheck
                }}
              >
                <CheckCircle2 size={32} />
              </div>

              {/* Product context box */}
              <div 
                className="inline-block border px-3 py-0.5 text-xs sm:text-sm font-normal mb-4 bg-white"
                style={{ 
                  borderColor: themeMeta.header.productTagBorder, 
                  color: themeMeta.header.productTagText 
                }}
              >
                {productName}
              </div>

              {/* Main Heading in theme color */}
              <h2 
                className="text-2xl sm:text-[28px] font-bold mb-3 text-center font-sans"
                style={{ color: themeMeta.colors.heading }}
              >
                Frivillig kommentar & inskick
              </h2>

              {/* Thank you text */}
              <p className="text-base text-neutral-700 leading-relaxed mb-8 max-w-md mx-auto text-center">
                {displayThankYou}
              </p>

              {/* Option to proceed to external survey if enabled */}
              {survey?.externalSurveyEnabled && survey?.externalSurveyUrl && (
                <div className="max-w-md mx-auto mt-6 pt-6 border-t border-neutral-200 text-center">
                  <h3 className="font-bold text-lg text-neutral-900 mb-2">
                    Vill du lämna ytterligare feedback?
                  </h3>
                  <p className="text-sm text-neutral-600 mb-6">
                    Vi genomför en fördjupad undersökning för att förbättra tjänsten ytterligare
                  </p>
                  <button
                    type="button"
                    onClick={handleExternalClick}
                    className="py-3 px-6 rounded-lg text-white font-bold text-sm uppercase tracking-wider shadow-sm inline-flex items-center justify-center gap-2 hover:opacity-95 transition-all cursor-pointer"
                    style={{ backgroundColor: themeMeta.colors.button }}
                  >
                    <ExternalLink size={18} /> {survey.externalSurveyBtnText || 'FORTSÄTT TILL INERA'}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {renderFooter()}
    </div>
  );
}
