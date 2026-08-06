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

export function getSusGrade(score: number): { 
  grade: string;
  adjective: string;
  interpretation: string;
  label: string; 
  text: string; 
  color: string; 
  hex: string; 
  bgClass: string; 
} {
  if (score >= 90) {
    return { 
      grade: 'A+', adjective: 'Bästa tänkbara', interpretation: 'Exceptionellt, topp 10 procent av alla produkter',
      label: 'A+ (Bästa tänkbara)', text: 'Bästa tänkbara', color: 'text-inera-success-50 bg-inera-success-95 border border-inera-success-40', hex: '#40966D', bgClass: 'bg-inera-success-50' 
    };
  }
  if (score >= 80.3) {
    return { 
      grade: 'A/A-', adjective: 'Utmärkt', interpretation: 'Tydligt över genomsnittet',
      label: 'A (Utmärkt)', text: 'Utmärkt', color: 'text-inera-success-50 bg-inera-success-95 border border-inera-success-40', hex: '#40966D', bgClass: 'bg-inera-success-50' 
    };
  }
  if (score >= 74) {
    return { 
      grade: 'B', adjective: 'Bra', interpretation: 'Över genomsnittet',
      label: 'B (Bra)', text: 'Bra', color: 'text-inera-info-50 bg-inera-info-95 border border-inera-info-40', hex: '#489AEB', bgClass: 'bg-inera-info-50' 
    };
  }
  if (score >= 68) {
    return { 
      grade: 'C', adjective: 'Godkänt, genomsnitt', interpretation: 'Acceptabelt men förbättringsbart',
      label: 'C (Godkänt)', text: 'Godkänt', color: 'text-inera-attention-50 bg-inera-attention-95 border border-inera-attention-40', hex: '#DB901B', bgClass: 'bg-inera-attention-50' 
    };
  }
  if (score >= 51) {
    return { 
      grade: 'D', adjective: 'Under genomsnitt', interpretation: 'Märkbara användbarhetsproblem som bör åtgärdas',
      label: 'D (Under genomsnitt)', text: 'Under genomsnitt', color: 'text-inera-attention-50 bg-inera-attention-95 border border-inera-attention-40', hex: '#DB901B', bgClass: 'bg-inera-attention-50' 
    };
  }
  return { 
    grade: 'F', adjective: 'Oacceptabelt', interpretation: 'Kritiska användbarhetsbrister, kräver omdesign',
    label: 'F (Oacceptabelt)', text: 'Oacceptabelt', color: 'text-inera-error-50 bg-inera-error-95 border border-inera-error-40', hex: '#D74F3D', bgClass: 'bg-inera-error-50' 
  };
}

export function getMedianExplanation(avg: number, median: number): string | undefined {
  const diff = Math.abs(avg - median);
  const threshold = avg * 0.05;
  if (diff <= threshold) return undefined;

  if (median < avg) {
    return `Medianvärdet (${Math.round(median)}) är lägre än medelvärdet (${Math.round(avg)}), vilket tyder på att det finns ett antal höga värden som drar upp medelvärdet.`;
  } else {
    return `Medianvärdet (${Math.round(median)}) är högre än medelvärdet (${Math.round(avg)}), vilket tyder på att det finns ett antal låga värden som drar ner medelvärdet.`;
  }
}
