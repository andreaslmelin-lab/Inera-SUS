import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateSusScore(answers: number[]): number {
  if (answers.length !== 10) return 0;
  
  let score = 0;
  // Odd questions (1, 3, 5, 7, 9) -> answers[0, 2, 4, 6, 8]
  // Even questions (2, 4, 6, 8, 10) -> answers[1, 3, 5, 7, 9]
  
  for (let i = 0; i < 10; i++) {
    const val = answers[i];
    if (i % 2 === 0) {
      score += (val - 1);
    } else {
      score += (5 - val);
    }
  }
  
  return score * 2.5;
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getSusGrade(score: number): { label: string, text: string, color: string, hex: string, bgClass: string } {
  if (score >= 80.3) return { label: 'A (Utmärkt)', text: 'Utmärkt', color: 'text-inera-success-50 bg-inera-success-95 border border-inera-success-40', hex: '#40966D', bgClass: 'bg-inera-success-50' };
  if (score >= 68) return { label: 'B (Bra)', text: 'Bra', color: 'text-inera-info-50 bg-inera-info-95 border border-inera-info-40', hex: '#489AEB', bgClass: 'bg-inera-info-50' };
  if (score >= 51) return { label: 'C (Godkänd)', text: 'Godkänd', color: 'text-inera-attention-50 bg-inera-attention-95 border border-inera-attention-40', hex: '#DB901B', bgClass: 'bg-inera-attention-50' };
  return { label: 'F (Underkänd)', text: 'Underkänd', color: 'text-inera-error-50 bg-inera-error-95 border border-inera-error-40', hex: '#D74F3D', bgClass: 'bg-inera-error-50' };
}
