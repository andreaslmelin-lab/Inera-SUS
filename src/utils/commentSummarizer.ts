export interface CommonViewpoint {
  id: string;
  theme: string;
  summary: string;
  count: number;
  percentage: number;
  exampleQuotes: string[];
  type: 'positive' | 'negative';
}

export interface CommentsSynthesis {
  totalWithComments: number;
  positiveCount: number;
  negativeCount: number;
  positiveRatio: number;
  negativeRatio: number;
  positiveViewpoints: CommonViewpoint[];
  negativeViewpoints: CommonViewpoint[];
}

interface CommentInput {
  comment?: string;
  susScore: number;
  variantName?: string;
  submitDate?: Date | string;
}

// Predefined thematic dictionary for Swedish UX / Healthcare software feedback
interface ThemePattern {
  id: string;
  title: string;
  summaryTemplate: string;
  keywords: string[];
  regex?: RegExp;
}

const POSITIVE_THEMES: ThemePattern[] = [
  {
    id: 'pos_ease',
    title: 'Enkelhet & användarvänlighet',
    summaryTemplate: 'Användare upplever gränssnittet som intuitivt, självinstruerande och smidigt att arbeta i.',
    keywords: ['enkel', 'enkelt', 'lätt', 'lättanvänd', 'smidig', 'smidigt', 'intuitiv', 'intuitivt', 'pedagogisk', 'självklart', 'tydlig', 'lättlärt', 'lättarbetat', 'enkla flöden'],
    regex: /\b(enkel(t)?|lätt|lättanvänt?|smidig(t)?|intuitiv(t)?|pedagogisk(t)?|självklar(t)?|lättlärt)\b/i
  },
  {
    id: 'pos_overview',
    title: 'Tydlig överblick & struktur',
    summaryTemplate: 'God visuell struktur som gör det lätt att få överblick över information och ärenden.',
    keywords: ['överblick', 'struktur', 'överskådlig', 'överskådligt', 'ren', 'rent', 'ordning', 'översikt', 'layout', 'strukturerat', 'lättöverskådlig', 'bra struktur', 'tydlig bild'],
    regex: /\b(överblick|struktur(erat)?|överskådlig(t)?|översikt|ren layout|bra ordning)\b/i
  },
  {
    id: 'pos_speed',
    title: 'Snabbhet & effektivitet',
    summaryTemplate: 'Systemet upplevs som snabbt, stabilt och tidsbesparande i det dagliga arbetet.',
    keywords: ['snabb', 'snabbt', 'effektiv', 'effektivt', 'flyter på', 'sparar tid', 'rapp', 'tidsbesparande', 'kvick', 'snabba svar', 'smidigt flöde', 'går fort'],
    regex: /\b(snabb(t)?|effektiv(t)?|flyter|sparar tid|tidsbesparande|går fort|rapp)\b/i
  },
  {
    id: 'pos_search_function',
    title: 'Bra sök- och filtreringsfunktioner',
    summaryTemplate: 'Hjälpsamma sök- och filtreringsmöjligheter som gör det lätt att hitta rätt uppgifter.',
    keywords: ['sök', 'söka', 'sökfunktion', 'filter', 'filtrera', 'hitta', 'hittar direkt', 'sökning', 'sökfält', 'bra sök', 'lätt att hitta'],
    regex: /\b(sök(a|funktion|fält|ning)?|filter|filtrera|hittar (snabbt|direkt|lätt))\b/i
  },
  {
    id: 'pos_stability',
    title: 'Stabilitet & driftsäkerhet',
    summaryTemplate: 'Pålitlig funktion utan avbrott eller krångel.',
    keywords: ['stabil', 'stabilt', 'pålitlig', 'fungerar alltid', 'driftsäker', 'inga problem', 'fungerar bra', 'felfritt', 'krånglar aldrig'],
    regex: /\b(stabil(t)?|pålitlig(t)?|driftsäker(t)?|inga problem|felfritt|krånglar inte)\b/i
  },
  {
    id: 'pos_design',
    title: 'Modern & tilltalande design',
    summaryTemplate: 'Uppskattad modern formgivning, bra färger och god tillgänglighet.',
    keywords: ['snygg', 'snyggt', 'modern', 'modernt', 'design', 'färger', 'tilltalande', 'behaglig', 'estetiskt', 'trevligt', 'god design', 'inera design'],
    regex: /\b(snygg(t)?|modern(t)?|design|tilltalande|behaglig(t)?|estetisk(t)?|trevlig(t)?)\b/i
  },
  {
    id: 'pos_general',
    title: 'Hög allmän nöjdhet',
    summaryTemplate: 'Mycket positiv helhetsupplevelse och uppskattat stöd i verksamheten.',
    keywords: ['bra', 'toppen', 'kanon', 'super', 'nöjd', 'utmärkt', 'gillar', 'bästa', 'fantastiskt', 'mycket bra', 'perfekt'],
    regex: /\b(toppen|kanon|super|mycket nöjd|utmärkt|fantastisk(t)?|perfekt|bästa|mycket bra)\b/i
  }
];

const NEGATIVE_THEMES: ThemePattern[] = [
  {
    id: 'neg_nav',
    title: 'Svårnavigerat & svårt att hitta',
    summaryTemplate: 'Användare upplever att det krävs för många klick eller att menyval och struktur är svåra att hitta i.',
    keywords: ['svårt att hitta', 'krånglig', 'krångligt', 'hittar inte', 'vilse', 'ologiskt', 'rörig meny', 'navigering', 'svårnavigerad', 'många klick', 'var finns', 'letar'],
    regex: /\b(svårt att hitta|hittar inte|krånglig(t)?|ologisk(t)?|rörig meny|navigering|svårnavigerad|många klick|letar)\b/i
  },
  {
    id: 'neg_speed',
    title: 'Långsamhet & prestandaproblem',
    summaryTemplate: 'Långa laddtider, fördröjningar och seg respons hindrar effektivt arbete.',
    keywords: ['långsam', 'långsamt', 'seg', 'segt', 'laddar', 'laddtid', 'hänger sig', 'lagg', 'fryser', 'prestanda', 'tar tid', 'fördröjning', 'vänta'],
    regex: /\b(långsam(t)?|seg(t)?|ladd(ar|tid|tider)|hänger sig|lagg(ar)?|fryser|prestanda|tar för lång tid|väntetid)\b/i
  },
  {
    id: 'neg_clutter',
    title: 'Rörigt gränssnitt & otydlig layout',
    summaryTemplate: 'För mycket information samtidigt, plottrigt gränssnitt och otydliga etiketter eller rubriker.',
    keywords: ['rörig', 'rörigt', 'plottrig', 'plottrigt', 'otydlig', 'otydligt', 'för mycket text', 'oöverskådlig', 'oöverskådligt', 'svårläst', 'svårt att se', 'mycket information', 'kaotiskt'],
    regex: /\b(rörig(t)?|plottrig(t)?|otydlig(t)?|för mycket text|oöverskådlig(t)?|svårläst|kaotisk(t)?)\b/i
  },
  {
    id: 'neg_search',
    title: 'Bristfällig sök- och filtrering',
    summaryTemplate: 'Sökfunktionen ger inte relevanta träffar eller saknar nödvändiga filter och anpassningar.',
    keywords: ['dålig sök', 'saknar sök', 'söken', 'sökfunktion', 'hittar ej', 'filter saknas', 'dåliga filter', 'svårt att söka', 'missvisande resultat', 'ofullständig sök'],
    regex: /\b(dålig sök|saknar sök|sök(en|funktionen)? fungerar inte|dåliga filter|svårt att söka|hittar ej vid sök)\b/i
  },
  {
    id: 'neg_login',
    title: 'Inloggning, sessioner & behörigheter',
    summaryTemplate: 'Problem med frekventa utloggningar, inloggningsstrul eller otydlig hantering av roller och behörigheter.',
    keywords: ['inloggning', 'loggas ut', 'siths', 'bankid', 'lösenord', 'behörighet', 'behörigheter', 'session', 'timeout', 'kasta ut', 'utloggad'],
    regex: /\b(inloggning|loggas ut|siths|bankid|lösenord|behörighet(er)?|session(er)?|timeout|kastas ut)\b/i
  },
  {
    id: 'neg_bugs',
    title: 'Buggar & tekniska felmeddelanden',
    summaryTemplate: 'Förekomst av oväntade felmeddelanden, krascher eller problem med att spara ändringar.',
    keywords: ['bugg', 'buggar', 'buggigt', 'kraschar', 'felmeddelande', 'felkod', 'fungerar inte', 'slutar fungera', 'sparar inte', 'tekniskt fel', 'fel'],
    regex: /\b(bugg(ar|igt)?|krasch(ar)?|felmeddelande|felkod|fungerar inte|sparar inte|tekniskt fel)\b/i
  },
  {
    id: 'neg_missing_features',
    title: 'Saknade funktioner & onödiga moment',
    summaryTemplate: 'Önskemål om kompletterande funktioner, automatiserade steg eller förenklade rutiner.',
    keywords: ['saknar', 'borde finnas', 'önskar', 'onödiga steg', 'omväg', 'krångliga steg', 'manuellt', 'saknas funktion', 'behöver kunna', 'önskemål', 'saknas'],
    regex: /\b(saknar|saknas|borde finnas|önskar|onödiga steg|krångliga steg|manuellt|borde gå att)\b/i
  },
  {
    id: 'neg_mobile_design',
    title: 'Omodern layout eller bristande skärmanpassning',
    summaryTemplate: 'Upplevelse av omodern design, liten text eller dålig anpassning till olika skärmstorlekar/mobiler.',
    keywords: ['omodernt', 'omodern', 'gammaldags', 'liten text', 'skärmstorlek', 'mobil', 'mobilanpassning', 'responsiv', 'trångt', 'dålig kontrast'],
    regex: /\b(omodernt?|gammaldags|liten text|mobilanpassning|dålig kontrast|trångt)\b/i
  }
];

function cleanCommentText(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

function truncateQuote(text: string, maxLength = 120): string {
  const cleaned = cleanCommentText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

function extractDirectTakeaway(comment: string, type: 'positive' | 'negative'): string {
  const cleaned = cleanCommentText(comment);
  // Split into sentences
  const sentences = cleaned.split(/[.!?;\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  if (sentences.length > 0) {
    const first = sentences[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function synthesizeComments(responses: CommentInput[]): CommentsSynthesis {
  const validResponses = responses.filter(r => r.comment && r.comment.trim().length > 0);
  const totalWithComments = validResponses.length;

  if (totalWithComments === 0) {
    return {
      totalWithComments: 0,
      positiveCount: 0,
      negativeCount: 0,
      positiveRatio: 0,
      negativeRatio: 0,
      positiveViewpoints: [],
      negativeViewpoints: []
    };
  }

  // Split into positive (SUS >= 68) and negative/needs improvement (SUS < 68)
  const posResponses = validResponses.filter(r => r.susScore >= 68);
  const negResponses = validResponses.filter(r => r.susScore < 68);

  const positiveViewpoints = extractGroupViewpoints(posResponses, POSITIVE_THEMES, 'positive');
  const negativeViewpoints = extractGroupViewpoints(negResponses, NEGATIVE_THEMES, 'negative');

  return {
    totalWithComments,
    positiveCount: posResponses.length,
    negativeCount: negResponses.length,
    positiveRatio: totalWithComments > 0 ? Math.round((posResponses.length / totalWithComments) * 100) : 0,
    negativeRatio: totalWithComments > 0 ? Math.round((negResponses.length / totalWithComments) * 100) : 0,
    positiveViewpoints,
    negativeViewpoints
  };
}

function extractGroupViewpoints(
  groupResponses: CommentInput[],
  themeDictionary: ThemePattern[],
  type: 'positive' | 'negative'
): CommonViewpoint[] {
  if (groupResponses.length === 0) return [];

  const matchedThemeMap = new Map<string, {
    theme: ThemePattern;
    matchingComments: string[];
  }>();

  const unmatchedComments: string[] = [];

  groupResponses.forEach(res => {
    const rawText = cleanCommentText(res.comment || '');
    if (!rawText) return;

    let matchedAny = false;

    for (const theme of themeDictionary) {
      const isRegexMatch = theme.regex ? theme.regex.test(rawText) : false;
      const isKeywordMatch = theme.keywords.some(kw => rawText.toLowerCase().includes(kw.toLowerCase()));

      if (isRegexMatch || isKeywordMatch) {
        matchedAny = true;
        if (!matchedThemeMap.has(theme.id)) {
          matchedThemeMap.set(theme.id, { theme, matchingComments: [] });
        }
        matchedThemeMap.get(theme.id)!.matchingComments.push(rawText);
      }
    }

    if (!matchedAny) {
      unmatchedComments.push(rawText);
    }
  });

  const results: CommonViewpoint[] = [];

  // Convert matched themes to viewpoints
  Array.from(matchedThemeMap.values()).forEach(({ theme, matchingComments }) => {
    const uniqueQuotes = Array.from(new Set(matchingComments));
    const count = uniqueQuotes.length;
    const percentage = groupResponses.length > 0 ? Math.round((count / groupResponses.length) * 100) : 0;
    
    // Pick 1-2 representative quotes
    const exampleQuotes = uniqueQuotes.slice(0, 2).map(q => truncateQuote(q));

    results.push({
      id: theme.id,
      theme: theme.title,
      summary: theme.summaryTemplate,
      count,
      percentage,
      exampleQuotes,
      type
    });
  });

  // Sort by count descending
  results.sort((a, b) => b.count - a.count);

  // If we have unmatched comments and need more points (targeting 3-5 viewpoints)
  if (results.length < 3 && unmatchedComments.length > 0) {
    // Cluster or add unmatched distinct comments
    const uniqueUnmatched = Array.from(new Set(unmatchedComments));
    uniqueUnmatched.forEach((comment, idx) => {
      if (results.length >= 5) return;
      const takeaway = extractDirectTakeaway(comment, type);
      const title = type === 'positive' ? `Positiv aspekt: "${truncateQuote(comment, 35)}"` : `Synpunkt: "${truncateQuote(comment, 35)}"`;
      
      results.push({
        id: `custom_${type}_${idx}`,
        theme: title,
        summary: takeaway,
        count: 1,
        percentage: groupResponses.length > 0 ? Math.round((1 / groupResponses.length) * 100) : 0,
        exampleQuotes: [truncateQuote(comment)],
        type
      });
    });
  }

  // If group has fewer than 3 comments in total, ensure all comments are represented directly if not already
  if (groupResponses.length > 0 && results.length < Math.min(3, groupResponses.length)) {
    groupResponses.forEach((res, i) => {
      const rawText = cleanCommentText(res.comment || '');
      if (!rawText) return;
      const alreadyInQuotes = results.some(r => r.exampleQuotes.some(q => q.includes(rawText.substring(0, 20))));
      if (!alreadyInQuotes && results.length < 5) {
        results.push({
          id: `direct_${type}_${i}`,
          theme: type === 'positive' ? 'Övrigt positivt omdöme' : 'Övrig förbättringssynpunkt',
          summary: extractDirectTakeaway(rawText, type),
          count: 1,
          percentage: groupResponses.length > 0 ? Math.round((1 / groupResponses.length) * 100) : 0,
          exampleQuotes: [truncateQuote(rawText)],
          type
        });
      }
    });
  }

  // Cap at top 3-5 viewpoints (max 5)
  return results.slice(0, 5);
}
