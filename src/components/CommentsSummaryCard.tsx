import React from 'react';
import { ThumbsUp, AlertTriangle, MessageSquareQuote, CheckCircle2, ListOrdered } from 'lucide-react';
import { CommentsSynthesis } from '../utils/commentSummarizer';

interface CommentsSummaryCardProps {
  synthesis: CommentsSynthesis;
  productName?: string;
}

export const CommentsSummaryCard: React.FC<CommentsSummaryCardProps> = ({
  synthesis,
  productName
}) => {
  const {
    totalWithComments,
    positiveCount,
    negativeCount,
    positiveRatio,
    negativeRatio,
    positiveViewpoints,
    negativeViewpoints
  } = synthesis;

  if (totalWithComments === 0) {
    return (
      <div className="p-5 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90 text-center">
        <MessageSquareQuote size={24} className="mx-auto text-inera-neutral-40 mb-2 opacity-60" />
        <p className="text-sm font-semibold text-inera-neutral-20">Inga fritextkommentarer att sammanställa för detta urval</p>
        <p className="text-xs text-inera-neutral-40 mt-1">När användare lämnar kommentarer sammanställs de 3–5 vanligaste positiva och negativa synpunkterna här automatiskt.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-inera-secondary-90 shadow-2xs overflow-hidden mb-6">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-inera-secondary-95 via-white to-inera-secondary-95 border-b border-inera-secondary-90">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-inera-primary-40/10 text-inera-primary-40">
                <ListOrdered size={18} />
              </span>
              <h4 className="text-base font-bold text-inera-neutral-10">
                Sammanställda synpunkter (3–5 vanligaste)
                {productName ? <span className="font-normal text-inera-neutral-30"> • {productName}</span> : ''}
              </h4>
            </div>
            <p className="text-xs text-inera-neutral-30 mt-1">
              Strukturerad sammanfattning av inkomna fritextsvar uppdelat på positiva (SUS ≥ 68) och kritiska/förbättringsområden (SUS &lt; 68).
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1.5">
              <ThumbsUp size={12} className="text-emerald-700" />
              <span>{positiveCount} positiva ({positiveRatio}%)</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-bold flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-700" />
              <span>{negativeCount} förbättring ({negativeRatio}%)</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-inera-secondary-90 text-inera-neutral-30 border border-inera-secondary-80 font-medium">
              {totalWithComments} totalt
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Grid */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Positive Viewpoints Column */}
        <div className="flex flex-col h-full bg-emerald-50/40 rounded-xl border border-emerald-200/70 p-4">
          <div className="flex items-center justify-between pb-3 border-b border-emerald-200/60 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                <ThumbsUp size={13} />
              </span>
              <h5 className="font-bold text-sm text-emerald-900">
                Positiva synpunkter (SUS ≥ 68)
              </h5>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300">
              {positiveViewpoints.length} {positiveViewpoints.length === 1 ? 'synpunkt' : 'vanliga synpunkter'}
            </span>
          </div>

          {positiveViewpoints.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-800/70 italic flex-1 flex items-center justify-center">
              Inga positiva fritextkommentarer registrerade för detta urval.
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {positiveViewpoints.map((vp, idx) => (
                <div 
                  key={vp.id || idx}
                  className="bg-white/95 rounded-lg p-3 border border-emerald-200/80 shadow-2xs space-y-1.5 transition-all hover:border-emerald-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <h6 className="text-xs font-bold text-inera-neutral-10 leading-snug">
                        {vp.theme}
                      </h6>
                    </div>
                    {vp.count > 0 && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                        {vp.count} {vp.count === 1 ? 'svar' : 'svar'} ({vp.percentage}%)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-inera-neutral-20 pl-7 leading-relaxed">
                    {vp.summary}
                  </p>
                  {vp.exampleQuotes && vp.exampleQuotes.length > 0 && (
                    <div className="pl-7 pt-1 space-y-1">
                      {vp.exampleQuotes.map((quote, qIdx) => (
                        <p key={qIdx} className="text-[11px] italic text-inera-neutral-40 bg-emerald-50/50 p-1.5 rounded border border-emerald-100/60">
                          "{quote}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Negative / Improvement Viewpoints Column */}
        <div className="flex flex-col h-full bg-amber-50/40 rounded-xl border border-amber-200/70 p-4">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200/60 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">
                <AlertTriangle size={13} />
              </span>
              <h5 className="font-bold text-sm text-amber-900">
                Kritiska synpunkter & förbättringsområden (SUS &lt; 68)
              </h5>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
              {negativeViewpoints.length} {negativeViewpoints.length === 1 ? 'synpunkt' : 'vanliga synpunkter'}
            </span>
          </div>

          {negativeViewpoints.length === 0 ? (
            <div className="py-8 text-center text-xs text-amber-800/70 italic flex-1 flex items-center justify-center">
              Inga negativa fritextkommentarer registrerade för detta urval.
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {negativeViewpoints.map((vp, idx) => (
                <div 
                  key={vp.id || idx}
                  className="bg-white/95 rounded-lg p-3 border border-amber-200/80 shadow-2xs space-y-1.5 transition-all hover:border-amber-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <h6 className="text-xs font-bold text-inera-neutral-10 leading-snug">
                        {vp.theme}
                      </h6>
                    </div>
                    {vp.count > 0 && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                        {vp.count} {vp.count === 1 ? 'svar' : 'svar'} ({vp.percentage}%)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-inera-neutral-20 pl-7 leading-relaxed">
                    {vp.summary}
                  </p>
                  {vp.exampleQuotes && vp.exampleQuotes.length > 0 && (
                    <div className="pl-7 pt-1 space-y-1">
                      {vp.exampleQuotes.map((quote, qIdx) => (
                        <p key={qIdx} className="text-[11px] italic text-inera-neutral-40 bg-amber-50/50 p-1.5 rounded border border-amber-100/60">
                          "{quote}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
