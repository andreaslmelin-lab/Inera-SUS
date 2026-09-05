
export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  isBlocked?: boolean;
  mustChangePassword?: boolean;
  lastLoggedIn?: any;
  createdAt?: any;
  invitedBy?: string;
  inviteCode?: string;
}

export interface Invitation {
  id: string;
  code: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'used' | 'revoked';
  createdAt: string;
  createdBy: string;
  usedAt?: string;
  usedBy?: string;
}

export interface Train {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  trainId: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  teamId?: string;
  teamName?: string;
  trainId?: string;
  trainName?: string;
  uxLead?: string;
  rte?: string;
  maturity?: number;
  susScore?: number;
  idsVersion?: string;
  comment?: string;
}

export interface Variant {
  id: string;
  productId: string;
  name: string;
}

export interface Measurement {
  id: string;
  productId: string;
  date: Date;
  uploadedBy: string;
  fileName: string;
  averageScore: number;
  medianScore?: number;
  responseCount: number;
  variantScores?: Record<string, { 
    score: number; 
    median: number; 
    count: number;
    min?: number;
    max?: number;
    q1?: number;
    q3?: number;
  }>;
  stats?: {
    min: number;
    max: number;
    q1: number;
    q3: number;
  };
}

export interface ResponseData {
  id: string;
  measurementId: string;
  productId: string;
  variantName: string;
  susScore: number;
  answers: number[];
  comment: string;
  submitDate: Date;
  startDate?: Date;
  otherText?: string;
}

export type SurveyTheme = '1177_invanare' | '1177_vardpersonal' | 'inera_b2b' | 'inera_invanare';

export const DEFAULT_SURVEY_TEXTS = {
  introTitle: 'Utvärdering av [Produkten]',
  introText: 'Vi vill veta hur du upplevde att använda [Produkten]. Enkäten består av tio påståenden. Utgå från din senaste användning av produkten när du svarar.',
  commentTitle: 'Frivillig kommentar & inskick',
  commentSubtitle: 'Du har besvarat alla 10 påståenden för [Produkten]. Du kan lämna en valfri kommentar nedan innan du skickar in.',
  freeTextLabel: 'Har du något mer du vill berätta om din upplevelse av [Produkten]?',
  thankYouTitle: 'Tack för dina svar!',
  thankYouText: 'Tack för att du tog dig tid att svara. Dina synpunkter hjälper oss att förbättra produkten.',
  alreadyAnsweredTitle: 'Enkäten är redan besvarad',
  alreadyAnsweredText: 'Denna länk har redan använts för att registrera en utvärdering för [Produkten] och kan inte användas fler gånger.',
};

export interface SusSurvey {
  id: string;
  productId: string;
  name: string;
  status: 'active' | 'inactive';
  type: 'general' | 'unique';
  theme?: SurveyTheme;
  month: number;
  year: number;
  endCondition: 'date' | 'maxResponses';
  endDate?: string; // ISO date string
  maxResponses?: number;
  introTitle?: string;
  introText?: string;
  commentTitle?: string;
  commentSubtitle?: string;
  freeTextLabel?: string;
  thankYouTitle?: string;
  thankYouText?: string;
  alreadyAnsweredTitle?: string;
  alreadyAnsweredText?: string;
  externalSurveyEnabled?: boolean;
  externalSurveyUrl?: string;
  externalSurveyBtnText?: string;
  createdAt: string; // ISO date string
}

export interface SurveyRespondent {
  id: string;
  surveyId: string;
  email: string;
  used: boolean;
  createdAt: string;
  answeredAt?: string;
}

export interface SusResponse {
  id: string;
  surveyId: string;
  productId: string;
  teamId?: string;
  trainId?: string;
  answers: number[]; // 10 numbers (1-5)
  comment?: string;
  susScore: number;
  submittedAt: string;
  linkType: 'general' | 'unique';
  respondentId?: string;
  wentFurther?: number; // 0 or 1
}
