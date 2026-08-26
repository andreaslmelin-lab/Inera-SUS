import { SurveyTheme } from '../types';

export interface SurveyThemeMeta {
  id: SurveyTheme;
  name: string;
  shortLabel: string;
  description: string;
  sourceUrl: string;
  sourceLabel: string;
  category: 'invånare' | 'personal' | 'b2b';
  
  // Header configuration
  header: {
    logoType: 'inera' | '1177_invanare' | '1177_vardpersonal';
    nameText: string;
    nameColor: string;
    productTagBorder: string;
    productTagText: string;
  };

  // Footer configuration
  footer: {
    mainText: string;
    textColor: string;
  };

  // Global theme colors
  colors: {
    primary: string;       // Primary active/accent color
    primaryLight: string;  // Light shade for badges/highlights
    accent: string;        // Accent tone
    button: string;        // Button background (e.g. #40775e for Inera, #28588f for 1177)
    buttonHover: string;
    link: string;          // Link color (underlined links)
    heading: string;       // Card H1/H2 color (#222529, #a33662 or #C12143)
    text: string;          // Body text (#222529 or #383d42)
    textMuted: string;     // Secondary text (#5c656e)
    bg: string;            // Page background (#f9f6f1)
    cardBg: string;        // Card background (#ffffff)
    border: string;        // Default border (#e5e1da)
    badgeBg: string;       // Theme pill badge bg
    badgeText: string;     // Theme pill badge text
    progressBar: string;   // Progress bar fill (#1971c2)
    successCheck: string;  // Success checkmark color (#40775e)
  };

  // Common UI styling tokens
  ui: {
    borderRadius: string;
    senderName: string;
  };
}

export const SURVEY_THEMES: Record<SurveyTheme, SurveyThemeMeta> = {
  // 1. Inera B2B
  'inera_b2b': {
    id: 'inera_b2b',
    name: 'Inera B2B',
    shortLabel: 'Inera B2B',
    description: 'Officiell organisationsform för regioner, kommuner och Ineras samverkanspartners med grön accent och mörka rubriker.',
    sourceUrl: 'https://www.inera.se',
    sourceLabel: 'Inera B2B',
    category: 'b2b',
    header: {
      logoType: 'inera',
      nameText: 'Namn',
      nameColor: '#40775e',       // Grön text för Inera B2B
      productTagBorder: '#206bc4',
      productTagText: '#1971c2',
    },
    footer: {
      mainText: 'Inera - Vi utvecklar framtidens välfärd',
      textColor: '#383d42',
    },
    colors: {
      primary: '#40775e',
      primaryLight: '#ecfdf5',
      accent: '#a33662',
      button: '#40775e',          // Inera Accent-40 Grön
      buttonHover: '#305a47',
      link: '#40775e',
      heading: '#222529',         // Mörk neutral rubrik
      text: '#222529',
      textMuted: '#5c656e',
      bg: '#f9f6f1',              // Ljus neutral bakgrund
      cardBg: '#ffffff',
      border: '#e5e1da',
      badgeBg: '#ecfdf5',
      badgeText: '#065f46',
      progressBar: '#1971c2',     // Blå framstegsindikator
      successCheck: '#40775e',
    },
    ui: {
      borderRadius: 'rounded-2xl',
      senderName: 'Inera B2B',
    }
  },

  // 2. Inera Invånare
  'inera_invanare': {
    id: 'inera_invanare',
    name: 'Inera invånare',
    shortLabel: 'Inera Invånare',
    description: 'Medborgarform för Ineras invånartjänster med Ineras signatur-rosaröda rubriker och gröna handlingsknappar.',
    sourceUrl: 'https://www.inera.se',
    sourceLabel: 'Inera Invånare',
    category: 'invånare',
    header: {
      logoType: 'inera',
      nameText: 'Namn',
      nameColor: '#a33662',       // Vinröd / Rosaröd text för Inera Invånare
      productTagBorder: '#206bc4',
      productTagText: '#1971c2',
    },
    footer: {
      mainText: 'Inera - Vi utvecklar framtidens välfärd',
      textColor: '#383d42',
    },
    colors: {
      primary: '#40775e',
      primaryLight: '#fdf2f8',
      accent: '#a33662',
      button: '#40775e',          // Inera Accent-40 Grön
      buttonHover: '#305a47',
      link: '#40775e',
      heading: '#a33662',         // Inera Primary-40 Rosaröd/Vinröd rubrik
      text: '#222529',
      textMuted: '#5c656e',
      bg: '#f9f6f1',
      cardBg: '#ffffff',
      border: '#e5e1da',
      badgeBg: '#fdf2f8',
      badgeText: '#9d174d',
      progressBar: '#1971c2',
      successCheck: '#40775e',
    },
    ui: {
      borderRadius: 'rounded-2xl',
      senderName: 'Inera Invånare',
    }
  },

  // 3. 1177 Vårdpersonal
  '1177_vardpersonal': {
    id: '1177_vardpersonal',
    name: '1177 vårdpersonal',
    shortLabel: '1177 Vårdpersonal',
    description: 'Klinisk och professionell form för vårdpersonal och vårdgivare med 1177-blå logotyp, rubriker i mörk neutral och 1177-blå knappar.',
    sourceUrl: 'https://vardpersonal.1177.se',
    sourceLabel: '1177 Vårdpersonal',
    category: 'personal',
    header: {
      logoType: '1177_vardpersonal',
      nameText: 'Namn',
      nameColor: '#28588f',       // 1177 Blå
      productTagBorder: '#206bc4',
      productTagText: '#1971c2',
    },
    footer: {
      mainText: '1177 - Sveriges samlade hälso- och sjukvårdsinformation på webben.',
      textColor: '#383d42',
    },
    colors: {
      primary: '#28588f',
      primaryLight: '#eff6ff',
      accent: '#336699',
      button: '#28588f',          // 1177 Blå
      buttonHover: '#1e436e',
      link: '#28588f',
      heading: '#222529',         // Mörk neutral rubrik
      text: '#222529',
      textMuted: '#5c656e',
      bg: '#f9f6f1',
      cardBg: '#ffffff',
      border: '#e5e1da',
      badgeBg: '#eff6ff',
      badgeText: '#1e40af',
      progressBar: '#1971c2',
      successCheck: '#40775e',
    },
    ui: {
      borderRadius: 'rounded-2xl',
      senderName: '1177 Vårdpersonal',
    }
  },

  // 4. 1177 Invånare
  '1177_invanare': {
    id: '1177_invanare',
    name: '1177 invånare',
    shortLabel: '1177 Invånare',
    description: 'Klassisk 1177-profil för invånare med röd 1177-logotyp, röda rubriker och 1177-blå knappar och länkar.',
    sourceUrl: 'https://www.1177.se',
    sourceLabel: '1177 Invånare',
    category: 'invånare',
    header: {
      logoType: '1177_invanare',
      nameText: 'Namn',
      nameColor: '#C12143',       // 1177 Röd
      productTagBorder: '#206bc4',
      productTagText: '#1971c2',
    },
    footer: {
      mainText: '1177 - Sveriges samlade hälso- och sjukvårdsinformation på webben.',
      textColor: '#383d42',
    },
    colors: {
      primary: '#28588f',
      primaryLight: '#fef2f2',
      accent: '#C12143',
      button: '#28588f',          // 1177 Blå
      buttonHover: '#1e436e',
      link: '#28588f',
      heading: '#C12143',         // 1177 Röd rubrik
      text: '#222529',
      textMuted: '#5c656e',
      bg: '#f9f6f1',
      cardBg: '#ffffff',
      border: '#e5e1da',
      badgeBg: '#fef2f2',
      badgeText: '#991b1b',
      progressBar: '#1971c2',
      successCheck: '#40775e',
    },
    ui: {
      borderRadius: 'rounded-2xl',
      senderName: '1177 Invånare',
    }
  }
};

export const THEME_LIST: SurveyThemeMeta[] = [
  SURVEY_THEMES['inera_b2b'],
  SURVEY_THEMES['inera_invanare'],
  SURVEY_THEMES['1177_vardpersonal'],
  SURVEY_THEMES['1177_invanare'],
];

export function getSurveyTheme(themeKey?: string | null): SurveyThemeMeta {
  if (themeKey && themeKey in SURVEY_THEMES) {
    return SURVEY_THEMES[themeKey as SurveyTheme];
  }
  // Standard fallback
  return SURVEY_THEMES['inera_b2b'];
}
