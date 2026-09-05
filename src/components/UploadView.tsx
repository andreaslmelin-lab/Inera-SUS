import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Product, Measurement } from '../types';
import { ProductService, MeasurementService } from '../services';
import { triggerSusMetricsSync } from '../services/syncService';
import { User } from '../firebase';
import { cn } from '../lib/utils';

export interface UploadViewProps {
  products: Product[];
  user: User | null;
  measurements?: Measurement[];
}

export const UploadView: React.FC<UploadViewProps> = ({ products, user, measurements = [] }) => {
  const [uploadProductId, setUploadProductId] = useState<string>('');
  const [uploadMethod, setUploadMethod] = useState<'csv' | 'manual'>('csv');
  const [manualSusScore, setManualSusScore] = useState<string>('');
  const [manualResponseCount, setManualResponseCount] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    const pId = uploadProductId || '1177';

    setIsUploading(true);
    setUploadStatus(null);
    setSyncNotice(null);
    try {
      const finalPId = await ProductService.ensureProduct(pId);
      await MeasurementService.uploadCsv(file, finalPId, user.uid);
      setUploadStatus({ type: 'success', msg: 'Mätningen har laddats upp!' });
      
      const synced = await triggerSusMetricsSync();
      if (synced) {
        setSyncNotice("Data synkad med Inera UX Dashboard");
        setTimeout(() => setSyncNotice(null), 5000);
      }
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: err.message || 'Ett fel uppstod vid uppladdning.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadProductId || !user) {
      setUploadStatus({ type: 'error', msg: 'Du måste välja eller skriva en tjänst först.' });
      return;
    }
    
    const scoreNum = parseFloat(manualSusScore);
    const countNum = parseInt(manualResponseCount, 10);
    
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      setUploadStatus({ type: 'error', msg: 'SUS-poäng måste vara mellan 0 och 100.' });
      return;
    }
    
    if (isNaN(countNum) || countNum <= 0) {
      setUploadStatus({ type: 'error', msg: 'Antal svar måste vara ett positivt heltal.' });
      return;
    }

    setIsSavingManual(true);
    setUploadStatus(null);
    setSyncNotice(null);

    try {
      const finalPId = await ProductService.ensureProduct(uploadProductId);
      const chosenDate = manualDate ? new Date(manualDate) : new Date();
      
      await MeasurementService.addManualMeasurement(finalPId, user.uid, scoreNum, countNum, chosenDate);
      
      setUploadStatus({ type: 'success', msg: 'Mätningen har registrerats manuellt!' });
      setManualSusScore('');
      setManualResponseCount('');
      setManualDate('');
      
      const synced = await triggerSusMetricsSync();
      if (synced) {
        setSyncNotice("Data synkad med Inera UX Dashboard");
        setTimeout(() => setSyncNotice(null), 5000);
      }
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: err.message || 'Ett fel uppstod vid registrering.' });
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div className="card p-8 shadow-sm border-inera-secondary-90 bg-white">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-inera-secondary-95 p-3 rounded-xl">
          <Upload className="text-inera-primary-40" size={24} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-inera-neutral-10 font-display">Ladda upp mätning</h3>
          <p className="text-sm text-inera-neutral-40">Välj tjänst och ladda upp CSV-fil eller ange manuella mätvärden.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="label">Välj tjänst</label>
          <div className="flex gap-2">
            <select 
              value={uploadProductId}
              onChange={(e) => setUploadProductId(e.target.value)}
              className="select flex-1"
            >
              <option value="">-- Välj befintlig tjänst --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex items-center px-3 text-inera-neutral-60 font-bold">ELLER</div>
            <input 
              type="text" 
              placeholder="Ny tjänst..." 
              value={uploadProductId}
              onChange={(e) => setUploadProductId(e.target.value)}
              className="input flex-1"
            />
          </div>
          <p className="text-[10px] text-inera-neutral-60 italic">Tips: Skriv namnet om tjänsten inte finns i listan.</p>
        </div>

        <div className="flex gap-2 border-b border-inera-secondary-90 pb-4">
          <button
            type="button"
            onClick={() => { setUploadMethod('csv'); setUploadStatus(null); }}
            className={cn(
              "text-xs font-bold pb-2 border-b-2 px-4 transition-colors", 
              uploadMethod === 'csv' ? "border-inera-primary-40 text-inera-primary-40" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-25"
            )}
          >
            CSV-fil
          </button>
          <button
            type="button"
            onClick={() => { setUploadMethod('manual'); setUploadStatus(null); }}
            className={cn(
              "text-xs font-bold pb-2 border-b-2 px-4 transition-colors", 
              uploadMethod === 'manual' ? "border-inera-primary-40 text-inera-primary-40" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-25"
            )}
          >
            Registrera manuellt betyg
          </button>
        </div>

        {uploadMethod === 'manual' ? (
          <form onSubmit={handleManualSubmit} className="space-y-4 p-5 bg-inera-secondary-95/50 border border-inera-secondary-90 rounded-xl">
            <h4 className="text-sm font-bold text-inera-neutral-20">Ange mätvärden för tjänsten</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-inera-neutral-30">Genomsnittlig SUS-poäng (0–100) *</label>
                <input 
                  type="number" 
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  placeholder="t.ex. 81.5"
                  value={manualSusScore}
                  onChange={(e) => setManualSusScore(e.target.value)}
                  className="input w-full text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-inera-neutral-30">Antal svar (Evaluations Count) *</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  placeholder="t.ex. 112"
                  value={manualResponseCount}
                  onChange={(e) => setManualResponseCount(e.target.value)}
                  className="input w-full text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-inera-neutral-30">Mätningsdatum (Frivilligt, annars idag)</label>
              <input 
                type="date" 
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="input w-full text-xs"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSavingManual || !uploadProductId}
                className="btn btn--m btn--primary disabled:opacity-50"
              >
                {isSavingManual ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Sparar...
                  </>
                ) : 'Spara mätvärde'}
              </button>
            </div>
          </form>
        ) : (
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
                    {!uploadProductId ? 'Välj tjänst först' : 'Klicka eller dra hit CSV-fil'}
                  </p>
                  <p className="text-xs text-inera-neutral-40 mt-1">Stöd för Ineras standardexport</p>
                </>
              )}
            </div>
          </div>
        )}

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

        {syncNotice && (
          <div className="alert alert--success mt-4">
            <CheckCircle2 className="alert-icon" size={20} />
            <div className="alert-body">
              <div className="alert-title">Synkroniserad!</div>
              <p>{syncNotice}</p>
            </div>
          </div>
        )}

        <div className="alert alert--info" role="status">
          <AlertCircle className="alert-icon" size={20} />
          <div className="alert-body">
            <div className="alert-title">Instruktioner för filformat</div>
            <ul className="text-xs space-y-1 list-disc pl-4 mt-2">
              <li>Ladda upp rader direkt från exportfilen.</li>
              <li>Automatiskt filter: Rader med värdet 0 på frågan om användaren kommer ihåg tjänsten hoppas över.</li>
              <li>Automatiskt gruppering: Svar i "Other"-kolumnen slås ihop under produkten "Other".</li>
              <li>Statistik baseras på kolumnerna för SUS-frågor och kommentarer.</li>
              <li>Trenden visas baserat på "Start Date (UTC)".</li>
            </ul>
          </div>
        </div>
      </div>

      {measurements.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-inera-neutral-10 mb-4 font-display">Senaste uppladdningar</h3>
          <div className="space-y-3">
            {measurements.slice(0, 10).map(m => (
              <div key={m.id} className="card flex items-center justify-between group py-3 border-inera-secondary-90">
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default UploadView;
