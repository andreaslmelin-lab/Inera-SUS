import { SurveyTheme } from '../types';

export interface SurveyThemeMeta {
  id: SurveyTheme;
  name: string;
  shortLabel: string;
  description: string;
  sourceUrl: string;
  sourceLabel: string;
  category: 'invånare' | 'personal' | 'b2b';
  
  // Header configuration (ready to receive exact assets and tokens from sketches)
  header: {
    logoType: '1177_invanare' | '1177_vardpersonal' | 'inera_b2b' | 'inera_invanare' | 'custom';
    customLogoUrl?: string;
    customLogoAlt?: string;
    title: string;
    subtitle?: string;
    dotColor?: string;
    iconName?: 'none' | 'stethoscope' | 'sparkles' | 'building';
    bg: string;
    text: string;
    borderBottom: string;
    productBadgeBg: string;
    productBadgeText: string;
    productBadgeBorder: string;
  };

  // Footer configuration (ready to receive texts/links from sketches)
  footer: {
    bg: string;
    text: string;
    borderTop: string;
    mainText: string;
    links?: Array<{ label: string; url: string }>;
  };

  // Global theme colors
  colors: {
    primary: string;
    primaryHover: string;
    primaryLight: string;
    accent: string;
    bg: string;
    cardBg: string;
    text: string;
    textMuted: string;
    border: string;
    badgeBg: string;
    badgeText: string;
  };

  // Common UI styling tokens
  ui: {
    fontDisplay: string;
    borderRadius: string;
    senderName: string;
    scaleStyle: 'rounded-pills' | 'structured-tiles' | 'brand-cards' | 'fresh-circles';
    accentGradient?: string;
  };
}

export const SURVEY_THEMES: Record<SurveyTheme, SurveyThemeMeta> = {
  '1177_invanare': {
    id: '1177_invanare',
    name: '1177 invånare',
    shortLabel: '1177 Invånare',
    description: 'Vårdguide för invånare och allmänhet med 1177:s klassiska blåvita formspråk och tydliga tillgänglighet.',
    sourceUrl: 'https://www.1177.se',
    sourceLabel: 'www.1177.se',
    category: 'invånare',
    header: {
      logoType: '1177_invanare',
      title: '1177',
      subtitle: 'Vårdguiden',
      dotColor: '#c8102e',
      iconName: 'none',
      bg: '#ffffff',
      text: '#004b87',
      borderBottom: '#004b87',
      productBadgeBg: '#e6f1f8',
      productBadgeText: '#004b87',
      productBadgeBorder: '#d0e3f0',
    },
    footer: {
      bg: '#ffffff',
      text: '#4d5d6c',
      borderTop: '#d7e2ea',
      mainText: '1177 — Sveriges samlade hälso- och sjukvårdsinformation på webben.',
    },
    colors: {
      primary: '#004b87',       // 1177 Mörkblå
      primaryHover: '#003662',
      primaryLight: '#e6f1f8',
      accent: '#c8102e',        // 1177 Röd accent
      bg: '#f4f7f9',
      cardBg: '#ffffff',
      text: '#1a232c',
      textMuted: '#4d5d6c',
      border: '#d7e2ea',
      badgeBg: '#e6f1f8',
      badgeText: '#004b87',
    },
    ui: {
      fontDisplay: 'font-sans',
      borderRadius: 'rounded-2xl',
      senderName: '1177',
      scaleStyle: 'rounded-pills',
      accentGradient: 'from-[#004b87] to-[#006699]'
    }
  },

  '1177_vardpersonal': {
    id: '1177_vardpersonal',
    name: '1177 vårdpersonal',
    shortLabel: '1177 Vårdpersonal',
    description: 'Klinisk och professionell form för vårdgivare, administratörer och kliniskt stöd med hög informationsdensitet.',
    sourceUrl: 'https://vardpersonal.1177.se',
    sourceLabel: 'vardpersonal.1177.se',
    category: 'personal',
    header: {
      logoType: '1177_vardpersonal',
      title: '1177',
      subtitle: 'För vårdpersonal',
      dotColor: '#007c91',
      iconName: 'stethoscope',
      bg: '#0e3a53',
      text: '#ffffff',
      borderBottom: '#007c91',
      productBadgeBg: '#007c91',
      productBadgeText: '#ffffff',
      productBadgeBorder: 'rgba(255, 255, 255, 0.2)',
    },
    footer: {
      bg: '#ffffff',
      text: '#475d70',
      borderTop: '#ccdbe5',
      mainText: '1177 Vårdpersonal — Nationellt kliniskt kunskapsstöd och tjänster för hälso- och sjukvården.',
    },
    colors: {
      primary: '#0e3a53',       // Klinisk Djupblå
      primaryHover: '#092739',
      primaryLight: '#edf4f8',
      accent: '#007c91',        // Petrol/Turkos klinisk accent
      bg: '#edf3f6',
      cardBg: '#ffffff',
      text: '#112233',
      textMuted: '#475d70',
      border: '#ccdbe5',
      badgeBg: '#007c91',
      badgeText: '#ffffff',
    },
    ui: {
      fontDisplay: 'font-sans',
      borderRadius: 'rounded-xl',
      senderName: '1177 Vårdpersonal',
      scaleStyle: 'structured-tiles',
      accentGradient: 'from-[#0e3a53] to-[#007c91]'
    }
  },

  'inera_b2b': {
    id: 'inera_b2b',
    name: 'Inera B2B',
    shortLabel: 'Inera B2B',
    description: 'Officiell organisationsform för regioner, kommuner och Ineras samverkanspartners i Ineras varumärkesprofil.',
    sourceUrl: 'https://www.inera.se',
    sourceLabel: 'www.inera.se',
    category: 'b2b',
    header: {
      logoType: 'inera_b2b',
      title: 'INERA',
      subtitle: 'Digital Välfärd',
      iconName: 'none',
      bg: '#800040',
      text: '#ffffff',
      borderBottom: '#5e002e',
      productBadgeBg: 'rgba(255, 255, 255, 0.15)',
      productBadgeText: '#ffffff',
      productBadgeBorder: 'rgba(255, 255, 255, 0.25)',
    },
    footer: {
      bg: '#ffffff',
      text: '#5c5258',
      borderTop: '#ebdcd3',
      mainText: 'Inera AB — Digital infrastruktur och tjänster för Sveriges välfärd.',
    },
    colors: {
      primary: '#800040',       // Inera Signatur Purpur/Plommon
      primaryHover: '#600030',
      primaryLight: '#fdf2f7',
      accent: '#c25e00',        // Varm bärnsten/accent
      bg: '#faf7f5',            // Varm sand
      cardBg: '#ffffff',
      text: '#1d191c',
      textMuted: '#5c5258',
      border: '#ebdcd3',
      badgeBg: '#fdf2f7',
      badgeText: '#800040',
    },
    ui: {
      fontDisplay: 'font-serif',
      borderRadius: 'rounded-2xl',
      senderName: 'Inera',
      scaleStyle: 'brand-cards',
      accentGradient: 'from-[#800040] to-[#500028]'
    }
  },

  'inera_invanare': {
    id: 'inera_invanare',
    name: 'Inera invånare',
    shortLabel: 'Inera Invånare',
    description: 'Modern och tillgänglig medborgarform inspirerad av Indra / Storsthlm med fräscha gröna accenter och fokus på enkelhet.',
    sourceUrl: 'https://www.gymnasieantagningen.storsthlm.se/personal/verktyg/indra/',
    sourceLabel: 'Indra (Storsthlm)',
    category: 'invånare',
    header: {
      logoType: 'inera_invanare',
      title: 'Inera Invånartjänster',
      subtitle: 'Digitala medborgartjänster',
      iconName: 'sparkles',
      bg: '#ffffff',
      text: '#0c5a48',
      borderBottom: '#0c5a48',
      productBadgeBg: '#eef8f4',
      productBadgeText: '#0c5a48',
      productBadgeBorder: '#cde4d9',
    },
    footer: {
      bg: '#ffffff',
      text: '#476356',
      borderTop: '#cde4d9',
      mainText: 'Inera Invånartjänster — En del av välfärdens gemensamma digitala ekosystem.',
    },
    colors: {
      primary: '#0c5a48',       // Indra Skogsgrön/Smaragd
      primaryHover: '#073f32',
      primaryLight: '#eef8f4',
      accent: '#18a37e',        // Ljus mynta
      bg: '#f0f7f4',            // Fräsch salvia/grön neutral
      cardBg: '#ffffff',
      text: '#13261f',
      textMuted: '#476356',
      border: '#cde4d9',
      badgeBg: '#eef8f4',
      badgeText: '#0c5a48',
    },
    ui: {
      fontDisplay: 'font-sans',
      borderRadius: 'rounded-2xl',
      senderName: 'Inera Invånartjänster',
      scaleStyle: 'fresh-circles',
      accentGradient: 'from-[#0c5a48] to-[#18a37e]'
    }
  }
};

export const THEME_LIST: SurveyThemeMeta[] = [
  SURVEY_THEMES['1177_invanare'],
  SURVEY_THEMES['1177_vardpersonal'],
  SURVEY_THEMES['inera_b2b'],
  SURVEY_THEMES['inera_invanare'],
];

export function getSurveyTheme(themeKey?: string | null): SurveyThemeMeta {
  if (themeKey && themeKey in SURVEY_THEMES) {
    return SURVEY_THEMES[themeKey as SurveyTheme];
  }
  // Standard fallback är 1177 invånare
  return SURVEY_THEMES['1177_invanare'];
}

