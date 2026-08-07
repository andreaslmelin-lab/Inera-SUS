
export interface User {
  uid: string;
  email: string;
  role: string;
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

export interface SusSurvey {
  id: string;
  productId: string;
  name: string;
  status: 'active' | 'inactive';
  type: 'general' | 'unique';
  month: number;
  year: number;
  endCondition: 'date' | 'maxResponses';
  endDate?: string; // ISO date string
  maxResponses?: number;
  introText?: string;
  freeTextLabel?: string;
  thankYouText?: string;
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
