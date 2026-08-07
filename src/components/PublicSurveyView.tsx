import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { SusSurvey, SurveyRespondent, Product } from '../types';
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Mail, Send, ExternalLink, HelpCircle } from 'lucide-react';
import { triggerSusMetricsSync } from '../services/syncService';

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
  surveyId: string;
  respondentId?: string;
}

export default function PublicSurveyView({ surveyId, respondentId }: Props) {
  const [survey, setSurvey] = useState<SusSurvey | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [respondent, setRespondent] = useState<SurveyRespondent | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusState, setStatusState] = useState<'active' | 'invalid' | 'closed' | 'already_used'>('active');
  
  // Enkätsteg: 0 = Intro, 1..10 = SUS-frågor, 11 = Fritext & Granskning, 12 = Tack
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(10).fill(0));
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdResponseId, setCreatedResponseId] = useState<string | null>(null);

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
      // Replace hyphens with spaces and capitalize
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
    return 'Produkten';
  };

  useEffect(() => {
    loadSurveyData();
  }, [surveyId, respondentId]);

  const loadSurveyData = async () => {
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
          // Auto-inaktivera
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
          // Försök hämta alla produkter och söka efter matchning
          try {
            const productsSnap = await getDocs(collection(db, 'products'));
            const productsList = productsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
            
            let matched = productsList.find(p => p.id.toLowerCase() === surveyData.productId.toLowerCase());
            if (!matched) {
              matched = productsList.find(p => p.name.toLowerCase().trim() === surveyData.productId.toLowerCase().trim());
            }
            if (!matched) {
              const normSurveyId = surveyData.productId.toLowerCase().replace(/[^a-z0-9]/g, '');
              matched = productsList.find(p => {
                const normPId = p.id.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normPName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                return normPId === normSurveyId || normPName === normSurveyId;
              });
            }
            if (!matched) {
              const normSurvey = surveyData.productId.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
              matched = productsList.find(p => {
                const normPName = p.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
                if (normSurvey && normPName && (normSurvey.includes(normPName) || normPName.includes(normSurvey))) {
                  return true;
                }
                return false;
              });
            }
            if (matched) {
              setProduct(matched);
            }
          } catch (err) {
            console.error("Fel vid robust produktmatchning:", err);
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
    }, 250);
  };

  const calculateSusScore = (scores: number[]) => {
    let rawSum = 0;
    for (let i = 0; i < 10; i++) {
      const val = scores[i];
      if (i % 2 === 0) {
        // Positivt formulerad (1,3,5,7,9) -> val - 1
        rawSum += (val - 1);
      } else {
        // Negativt formulerad (2,4,6,8,10) -> 5 - val
        rawSum += (5 - val);
      }
    }
    return Math.round(rawSum * 2.5 * 10) / 10;
  };

  const handleSubmitSurvey = async () => {
    if (!survey) return;
    setSubmitting(true);
    try {
      const susScore = calculateSusScore(answers);
      const nowIso = new Date().toISOString();

      const productId = survey.productId || 'prod-general';
      const respondentVal = respondentId || null;
      const commentVal = (comment || '').trim();

      // Spara svar i `susResponses` med säkra värden (inga undefined)
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

      // Om unik länk -> markera respondent som använd
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

      // Kontrollera om max svar nåtts nu
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

      // Trigga bakgrundssynk om aktivt
      triggerSusMetricsSync().catch(console.error);

      // Gå till tackskärm
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
    if (createdResponseId) {
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

  // Header branding bar
  const renderHeader = () => {
    const pName = getProductName();
    const titleText = `Utvärdering av ${pName}`;

    return (
      <header className="bg-white border-b border-inera-secondary-90 py-4 px-6 mb-8 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Inera" className="w-8 h-8 rounded-full object-cover shrink-0" />
            <span className="font-display font-bold text-inera-primary-40 text-lg sm:text-xl">
              {titleText}
            </span>
          </div>
        </div>
      </header>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-inera-secondary-95 text-inera-neutral-10 flex flex-col items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-inera-primary-40/20 flex items-center justify-center text-inera-primary-40">
            <HelpCircle size={24} className="animate-spin" />
          </div>
          <p className="font-medium text-inera-neutral-30">Laddar enkät...</p>
        </div>
      </div>
    );
  }

  // Sida för inaktiv / avslutad enkät
  if (statusState === 'closed') {
    return (
      <div className="min-h-screen bg-inera-secondary-95 text-inera-neutral-10">
        {renderHeader()}
        <main className="max-w-xl mx-auto px-4 py-8">
          <div className="card p-8 bg-white shadow-md rounded-2xl text-center border border-inera-secondary-90">
            <div className="w-16 h-16 rounded-full bg-inera-secondary-95 text-inera-neutral-40 mx-auto mb-4 flex items-center justify-center">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold font-display text-inera-neutral-10 mb-3">Mätningen är avslutad</h1>
            <p className="text-inera-neutral-30 leading-relaxed mb-6">
              Den här mätningen är nu avslutad. Tack för ditt intresse.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Sida för redan använd unik länk (ser ut som startskärmen men utan startknapp och med anpassad text)
  if (statusState === 'already_used' && survey) {
    const pName = getProductName();
    const mailtoSubject = encodeURIComponent(`SUS-mätning ${survey?.name || pName}`);
    const mailtoUrl = `mailto:ux@inera.se?subject=${mailtoSubject}`;

    const defaultAlreadyUsedText = `Denna länk har redan använts för att registrera en utvärdering för [ProductName] och kan inte användas fler gånger.`;
    const rawAlreadyUsedText = survey.alreadyAnsweredText || defaultAlreadyUsedText;
    const displayAlreadyUsedText = rawAlreadyUsedText.replaceAll('[ProductName]', pName);

    return (
      <div className="min-h-screen bg-inera-secondary-95 text-inera-neutral-10 flex flex-col justify-between">
        <div>
          {renderHeader()}
          <main className="max-w-2xl mx-auto px-4 pb-12">
            <div className="card p-8 bg-white shadow-lg rounded-2xl border border-inera-secondary-90">
              <h1 className="text-3xl font-bold font-display text-inera-neutral-10 mb-4">
                Utvärdering av {pName}
              </h1>

              <div className="text-inera-neutral-30 leading-relaxed space-y-4 mb-8 text-base">
                <p>{displayAlreadyUsedText}</p>
              </div>

              <div className="p-4 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90 flex items-center justify-between text-sm">
                <span className="text-inera-neutral-30">Frågor eller funderingar?</span>
                <a 
                  href={mailtoUrl}
                  className="inline-flex items-center gap-2 font-bold text-inera-primary-40 hover:underline"
                >
                  <Mail size={16} /> ux@inera.se
                </a>
              </div>
            </div>
          </main>
        </div>
        <footer className="bg-inera-secondary-90 text-inera-neutral-30 py-4 px-6 text-center text-xs border-t border-inera-secondary-90">
          Inera AB — Digitala tjänster för välfärden
        </footer>
      </div>
    );
  }

  // Sida för ogiltig länk
  if (statusState === 'invalid' || !survey) {
    return (
      <div className="min-h-screen bg-inera-secondary-95 text-inera-neutral-10">
        {renderHeader()}
        <main className="max-w-xl mx-auto px-4 py-8">
          <div className="card p-8 bg-white shadow-md rounded-2xl text-center border border-inera-secondary-90">
            <div className="w-16 h-16 rounded-full bg-inera-error-95 text-inera-error-40 mx-auto mb-4 flex items-center justify-center">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold font-display text-inera-neutral-10 mb-3">Ogiltig enkätlänk</h1>
            <p className="text-inera-neutral-30 leading-relaxed mb-6">
              Länken du använde verkar vara ogiltig eller så har enkäten tagits bort. Kontrollera adressen och försök igen.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const productName = getProductName();
  const mailtoSubject = encodeURIComponent(`SUS-mätning ${survey?.name || productName}`);
  const mailtoUrl = `mailto:ux@inera.se?subject=${mailtoSubject}`;

  // Standard intro text med ersatt [Produkten]
  const defaultIntro = `Vi vill veta hur du upplevde att använda ${productName}. Enkäten består av tio påståenden och tar cirka två minuter att besvara. Utgå från din senaste användning av produkten när du svarar.`;
  const displayIntro = survey.introText
    ? survey.introText.replaceAll('[Produkten]', productName)
    : defaultIntro;

  // Standard free text label
  const defaultFreeLabel = `Har du något mer du vill berätta om din upplevelse av ${productName}?`;
  const displayFreeLabel = survey.freeTextLabel
    ? survey.freeTextLabel.replaceAll('[Produkten]', productName)
    : defaultFreeLabel;

  // Standard thank you text
  const defaultThankYou = `Tack för att du tog dig tid att svara. Dina synpunkter hjälper oss att förbättra produkten.`;
  const displayThankYou = survey.thankYouText || defaultThankYou;

  return (
    <div className="min-h-screen bg-inera-secondary-95 text-inera-neutral-10 flex flex-col justify-between">
      <div>
        {renderHeader()}

        <main className="max-w-2xl mx-auto px-4 pb-12">
          {/* Steg 0: Inledning */}
          {step === 0 && (
            <div className="card p-8 bg-white shadow-lg rounded-2xl border border-inera-secondary-90">
              <h1 className="text-3xl font-bold font-display text-inera-neutral-10 mb-4">
                Utvärdering av {productName}
              </h1>

              <div className="text-inera-neutral-30 leading-relaxed space-y-4 mb-8 text-base">
                <p>{displayIntro}</p>
              </div>

              <div className="p-4 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90 mb-8 flex items-center justify-between text-sm">
                <span className="text-inera-neutral-30">Frågor eller funderingar?</span>
                <a 
                  href={mailtoUrl}
                  className="inline-flex items-center gap-2 font-bold text-inera-primary-40 hover:underline"
                >
                  <Mail size={16} /> ux@inera.se
                </a>
              </div>

              <button 
                onClick={() => setStep(1)}
                className="btn btn--primary w-full py-3.5 text-base font-bold shadow-md flex items-center justify-center gap-2"
              >
                Starta enkäten <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Steg 1-10: SUS Frågor */}
          {step >= 1 && step <= 10 && (
            <div className="card p-6 sm:p-8 bg-white shadow-lg rounded-2xl border border-inera-secondary-90">
              {/* Progress & counter */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs font-bold text-inera-neutral-40 uppercase tracking-wider mb-2">
                  <span>Fråga {step} av 10</span>
                  <span>{Math.round((step / 10) * 100)}%</span>
                </div>
                <div className="w-full bg-inera-secondary-90 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-inera-accent-40 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(step / 10) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Question Text */}
              <h2 className="text-xl sm:text-2xl font-bold font-display text-inera-neutral-10 mb-8 min-h-[4rem] flex items-center">
                {SUS_QUESTIONS[step - 1]}
              </h2>

              {/* 5-point Likert Scale */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between text-xs font-bold text-inera-neutral-40 px-1 mb-1">
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
                        className={`py-4 sm:py-5 rounded-xl border-2 font-bold text-lg transition-all flex flex-col items-center justify-center gap-1 ${
                          isSelected 
                            ? 'border-inera-accent-40 bg-inera-accent-40 text-white shadow-md scale-102' 
                            : 'border-inera-secondary-90 bg-white hover:border-inera-accent-40 hover:bg-inera-secondary-95 text-inera-neutral-10'
                        }`}
                      >
                        <span>{val}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-inera-secondary-90">
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={step === 1}
                  className="btn btn--tertiary flex items-center gap-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Föregående
                </button>

                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={answers[step - 1] === 0}
                  className="btn btn--primary flex items-center gap-1.5 text-sm disabled:opacity-40"
                >
                  Nästa <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Steg 11: Fritextfråga & Granskning */}
          {step === 11 && (
            <div className="card p-6 sm:p-8 bg-white shadow-lg rounded-2xl border border-inera-secondary-90">
              <h2 className="text-2xl font-bold font-display text-inera-neutral-10 mb-2">
                Frivillig kommentar & Inskick
              </h2>
              <p className="text-sm text-inera-neutral-40 mb-6">
                Du har besvarat alla 10 påståenden. Du kan lämna en valfri kommentar nedan innan du skickar in.
              </p>

              <div className="mb-6">
                <label className="block text-sm font-bold text-inera-neutral-20 mb-2">
                  {displayFreeLabel}
                </label>
                <textarea
                  className="input w-full h-32 p-3 border border-inera-secondary-90 rounded-xl text-sm"
                  placeholder="Skriv dina tankar här (valfritt)..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              {/* Visual review summary */}
              <div className="p-4 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90 mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-xs uppercase text-inera-neutral-40">Dina svar (10 av 10 besvarade)</span>
                  <button onClick={() => setStep(1)} className="text-xs font-bold text-inera-primary-40 hover:underline">
                    Ändra svar
                  </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {answers.map((ans, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => setStep(idx + 1)}
                      className="p-2 text-center rounded bg-white border border-inera-secondary-90 hover:border-inera-primary-40 transition-colors"
                      title={`Fråga ${idx + 1}: Val ${ans}`}
                    >
                      <div className="text-[10px] text-inera-neutral-40 font-bold">F{idx + 1}</div>
                      <div className="text-sm font-bold text-inera-accent-40">{ans}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-inera-secondary-90">
                <button
                  type="button"
                  onClick={() => setStep(10)}
                  className="btn btn--tertiary flex items-center gap-1.5"
                >
                  <ChevronLeft size={16} /> Tillbaka till frågorna
                </button>

                <button
                  type="button"
                  onClick={handleSubmitSurvey}
                  disabled={submitting}
                  className="btn btn--primary py-3 px-6 text-base font-bold flex items-center gap-2 shadow-md"
                >
                  <Send size={18} /> {submitting ? 'Skickar in...' : 'Skicka in enkät'}
                </button>
              </div>
            </div>
          )}

          {/* Steg 12: Tackskärm */}
          {step === 12 && (
            <div className="card p-8 bg-white shadow-xl rounded-2xl border border-inera-secondary-90 text-center">
              <div className="w-16 h-16 rounded-full bg-inera-success-95 text-inera-success-40 border border-inera-success-40 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle2 size={36} />
              </div>

              <h2 className="text-3xl font-bold font-display text-inera-neutral-10 mb-4">
                Tack för ditt svar!
              </h2>

              <p className="text-inera-neutral-30 text-base leading-relaxed mb-8 max-w-lg mx-auto">
                {displayThankYou}
              </p>

              {/* Option to proceed to external survey */}
              {survey.externalSurveyEnabled && survey.externalSurveyUrl && (
                <div className="p-6 bg-inera-secondary-95 rounded-2xl border border-inera-secondary-90 max-w-md mx-auto mt-6">
                  <h3 className="font-bold text-inera-neutral-10 mb-2 text-lg">
                    Vill du lämna ytterligare feedback?
                  </h3>
                  <p className="text-xs text-inera-neutral-40 mb-5">
                    Vi genomför en fördjupad undersökning för att förbättra tjänsten ytterligare.
                  </p>
                  <button
                    onClick={handleExternalClick}
                    className="btn btn--primary w-full py-3 text-base font-bold flex items-center justify-center gap-2"
                  >
                    {survey.externalSurveyBtnText || 'Fortsätt'} <ExternalLink size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <footer className="bg-inera-secondary-90 text-inera-neutral-30 py-4 px-6 text-center text-xs border-t border-inera-secondary-90">
        Inera AB — Digitala tjänster för välfärden
      </footer>
    </div>
  );
}
