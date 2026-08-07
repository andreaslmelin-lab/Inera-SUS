// src/services/syncService.ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { loadProductMappings } from './catalogMappingService';

function normalizeStr(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/^prod[-_]/i, '')
    .replace(/^product[-_]/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNameMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const rawA = a.trim().toLowerCase();
  const rawB = b.trim().toLowerCase();
  if (rawA === rawB) return true;

  const normA = normalizeStr(a);
  const normB = normalizeStr(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.replace(/\s+/g, '') === normB.replace(/\s+/g, '')) return true;

  if (normA.length >= 3 && normB.length >= 3) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }

  const stopWords = ['och', 'med', 'for', 'ett', 'ska', 'som', 'tjanst', 'tjansterna', 'tjansten'];
  const tokensA = normA.split(' ').filter(t => t.length >= 3 && !stopWords.includes(t));
  const tokensB = normB.split(' ').filter(t => t.length >= 3 && !stopWords.includes(t));

  if (tokensA.length > 0 && tokensB.length > 0) {
    const common = tokensA.filter(t => tokensB.some(tb => tb.includes(t) || t.includes(tb)));
    const minTokens = Math.min(tokensA.length, tokensB.length);
    if (common.length >= minTokens) return true;
  }

  return false;
}

export async function pushMetricsToAdminDashboard(payload: {
  source: "inera-sus";
  sourceKey?: "inera-sus";
  timestamp?: string;
  organization?: string;
  metrics: {
    score: number;
    grade?: string;
    evaluationsCount: number;
    responseRate: number;
    productsCount?: number;
    products?: Array<any>;
  };
  granularData?: {
    individuals?: Array<any>;
    teams?: Array<any>;
    products?: Array<any>;
    events?: Array<any>;
  };
}) {
  try {
    const safeNumber = (val: any, fallback = 0) => {
      const num = Number(val);
      return (val === undefined || val === null || isNaN(num)) ? fallback : num;
    };

    const body = {
      source: "inera-sus",
      source_key: "inera-sus",
      timestamp: payload.timestamp || new Date().toISOString(),
      organization: payload.organization || "Inera AB",
      metrics: {
        score: safeNumber(payload.metrics.score, 75),
        grade: payload.metrics.grade || "",
        evaluationsCount: Math.round(safeNumber(payload.metrics.evaluationsCount, 0)),
        responseRate: safeNumber(payload.metrics.responseRate, 100),
        productsCount: safeNumber(payload.metrics.productsCount || payload.granularData?.products?.length, 0),
        products: (payload.metrics.products || payload.granularData?.products || []).map((p: any) => ({
          productId: String(p.productId || p.product_id || p.id || ''),
          productName: String(p.productName || p.product_name || p.name || ''),
          susScore: safeNumber(p.susScore || p.sus_score || p.score, 0),
          responses: Math.round(safeNumber(p.responses || p.responsesCount || 0))
        }))
      },
      granularData: {
        individuals: payload.granularData?.individuals || [],
        teams: payload.granularData?.teams || [],
        products: (payload.granularData?.products || []).map((p: any) => ({
          productId: String(p.productId || p.product_id || p.id || ''),
          productName: String(p.productName || p.product_name || p.name || ''),
          susScore: safeNumber(p.susScore || p.sus_score, 0),
          responses: Math.round(safeNumber(p.responses || p.responsesCount, 0)),
          roundId: String(p.roundId || p.round_id || p.surveyId || ''),
          roundName: String(p.roundName || p.round_name || ''),
          roundStatus: String(p.roundStatus || p.round_status || ''),
          startDate: String(p.startDate || p.start_date || ''),
          endDate: String(p.endDate || p.end_date || ''),
          date: String(p.date || new Date().toISOString()),
          // Backward compatibility fields
          product_id: String(p.productId || p.product_id || p.id || ''),
          product_name: String(p.productName || p.product_name || p.name || ''),
          sus_score: safeNumber(p.susScore || p.sus_score, 0),
          round_id: String(p.roundId || p.round_id || p.surveyId || ''),
          round_name: String(p.roundName || p.round_name || ''),
          round_status: String(p.roundStatus || p.round_status || '')
        })),
        events: (payload.granularData?.events || []).map((ev: any) => ({
          eventId: String(ev.eventId || ev.event_id || ev.id || ''),
          timestamp: String(ev.timestamp || new Date().toISOString()),
          eventType: String(ev.eventType || ev.event_type || 'SUS_SURVEY_COMPLETED'),
          targetProductId: String(ev.targetProductId || ev.target_product_id || ev.productId || ''),
          productName: String(ev.productName || ev.product_name || ev.variantName || ''),
          scoreGiven: safeNumber(ev.scoreGiven || ev.score_given || ev.susScore || ev.sus_score, 0)
        }))
      }
    };

    const savedEndpoint = typeof window !== 'undefined' ? window.localStorage.getItem('inera_sus_sync_endpoint') : null;
    const endpointToUse = savedEndpoint || 'https://inera-ux-dashboard.vercel.app/api/sync-metrics';

    const savedToken = typeof window !== 'undefined' ? window.localStorage.getItem('inera_sus_sync_token') : null;
    const tokenToUse = savedToken || 'inera_ux_token_11am0nao';

    const response = await fetch("/api/sync-metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Token": tokenToUse,
        "X-Sync-Endpoint": endpointToUse
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!response.ok || responseData.success === false) {
      const errMsg = responseData.error || responseData.message || `HTTP ${response.status} ${response.statusText}`;
      console.warn("Kunde inte synka till Inera UX Dashboard:", errMsg);
      return { success: false, error: errMsg, details: responseData };
    }

    console.log("Data synkad med Inera UX Dashboard!", responseData);
    return { success: true, data: responseData };
  } catch (error: any) {
    console.error("Fel vid synkronisering med Inera UX Dashboard:", error);
    return { success: false, error: error.message || "Anropsfel vid synkronisering" };
  }
}

export async function generateSusMetricsPayload() {
  try {
    const [measurementsSnap, responsesSnap, susResponsesSnap, surveysSnap, productsSnap] = await Promise.all([
      getDocs(collection(db, 'measurements')),
      getDocs(collection(db, 'responses')),
      getDocs(collection(db, 'susResponses')),
      getDocs(collection(db, 'susSurveys')),
      getDocs(collection(db, 'products'))
    ]);

    const measurements = measurementsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const responses = responsesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const susResponses = susResponsesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const surveys = surveysSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const products = productsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const surveyMap = new Map<string, any>();
    surveys.forEach(s => surveyMap.set(s.id, s));

    const productMap = new Map<string, any>();
    products.forEach(p => {
      productMap.set(p.id, p);
      if (p.name) {
        productMap.set(p.name.toLowerCase().trim(), p);
      }
    });

    // Normalize susResponses into standard response format
    const normalizedSusResponses = susResponses.map(sr => {
      const survey = surveyMap.get(sr.surveyId);
      let matchedP = null;
      const targetProdId = survey?.productId || sr.productId;

      if (targetProdId && productMap.has(targetProdId)) {
        matchedP = productMap.get(targetProdId);
      } else if (targetProdId) {
        matchedP = products.find(p => p.id === targetProdId || isNameMatch(targetProdId, p.id) || isNameMatch(targetProdId, p.name));
      }

      if (!matchedP && survey?.name) {
        matchedP = products.find(p => isNameMatch(survey.name, p.name));
      }

      let finalVarName = matchedP ? matchedP.name : (survey?.name || targetProdId || 'Övriga');
      if ((finalVarName.startsWith('Egna') || finalVarName === 'Generell' || finalVarName === 'Övriga') && matchedP) {
        finalVarName = matchedP.name;
      }

      return {
        id: sr.id,
        roundId: sr.surveyId || survey?.id || '',
        roundName: survey?.name || '',
        roundStatus: survey?.status || 'active',
        startDate: survey?.startDate || '',
        endDate: survey?.endDate || '',
        date: sr.submittedAt || sr.createdAt || new Date().toISOString(),
        productId: matchedP ? matchedP.id : (targetProdId || 'prod-general'),
        variantName: finalVarName,
        susScore: sr.susScore,
        comment: sr.comment || ''
      };
    });

    // Combine manual responses and active survey responses
    const allResponses = [...responses, ...normalizedSusResponses];

    // Safely calculate total scores from all responses
    let totalScoreSum = 0;
    let validResponseCount = 0;
    allResponses.forEach(r => {
      const s = Number(r.susScore);
      if (r.susScore !== undefined && r.susScore !== null && !isNaN(s)) {
        totalScoreSum += s;
        validResponseCount++;
      }
    });

    let overallScore = 0;
    let totalEvaluations = 0;

    if (validResponseCount > 0) {
      overallScore = Math.round((totalScoreSum / validResponseCount) * 10) / 10;
      totalEvaluations = validResponseCount;
    } else if (measurements.length > 0) {
      let weightedSum = 0;
      let totalCount = 0;
      measurements.forEach(m => {
        const avg = Number(m.averageScore);
        const count = Number(m.responseCount);
        if (!isNaN(avg) && !isNaN(count) && count > 0) {
          weightedSum += avg * count;
          totalCount += count;
        }
      });
      overallScore = totalCount > 0 ? Math.round((weightedSum / totalCount) * 10) / 10 : 0;
      totalEvaluations = totalCount;
    }

    const mappings = await loadProductMappings();

    // Group responses by variantName mapped to official master catalog product names
    const variantMetricsMap: Record<string, { totalScore: number; count: number; productId: string; rounds: Map<string, any>; latestDate?: string }> = {};
    allResponses.forEach(r => {
      let matchedProduct = null;
      const rawName = (r.variantName || '').trim();
      const rawNameLower = rawName.toLowerCase();
      const normalizedRaw = rawName === 'Generell' || rawName === 'Other' || rawName === 'Övriga' ? 'Övriga' : rawName;
      const mappedFromCatalog = mappings[normalizedRaw] || mappings[rawName];

      if (mappedFromCatalog && productMap.has(mappedFromCatalog.toLowerCase().trim())) {
        matchedProduct = productMap.get(mappedFromCatalog.toLowerCase().trim());
      } else if (productMap.has(rawName)) {
        matchedProduct = productMap.get(rawName);
      } else if (productMap.has(rawNameLower)) {
        matchedProduct = productMap.get(rawNameLower);
      } else if (r.productId && productMap.has(r.productId)) {
        matchedProduct = productMap.get(r.productId);
      } else {
        matchedProduct = products.find(p => isNameMatch(rawName, p.name) || isNameMatch(r.productId, p.id) || (mappedFromCatalog && isNameMatch(mappedFromCatalog, p.name)));
      }

      let mappedName = '';
      let prodId = '';

      if (matchedProduct) {
        mappedName = matchedProduct.name;
        prodId = matchedProduct.id;
      } else {
        mappedName = mappedFromCatalog || normalizedRaw || 'Övriga';
        prodId = (r.productId || mappedName).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'prod-general';
      }

      if (!variantMetricsMap[mappedName]) {
        variantMetricsMap[mappedName] = { 
          totalScore: 0, 
          count: 0, 
          productId: prodId,
          rounds: new Map(),
          latestDate: undefined
        };
      }
      
      const sVal = Number(r.susScore);
      if (!isNaN(sVal)) {
        variantMetricsMap[mappedName].totalScore += sVal;
        variantMetricsMap[mappedName].count++;
        
        const resDate = r.date ? (typeof r.date === 'string' ? r.date : new Date(r.date).toISOString()) : new Date().toISOString();
        if (!variantMetricsMap[mappedName].latestDate || resDate > variantMetricsMap[mappedName].latestDate!) {
          variantMetricsMap[mappedName].latestDate = resDate;
        }

        if (r.roundId) {
          variantMetricsMap[mappedName].rounds.set(r.roundId, {
            roundId: r.roundId,
            roundName: r.roundName || 'Enkätomgång',
            roundStatus: r.roundStatus || 'completed',
            startDate: r.startDate || resDate,
            endDate: r.endDate || resDate,
            date: resDate
          });
        }
      }
    });

    const addedProductIds = new Set<string>();
    const addedProductNames = new Set<string>();
    const productMetrics: Array<any> = [];

    // 1. Add all products from the 'products' collection
    products.forEach(p => {
      const pNameLower = p.name.toLowerCase().trim();
      
      let matchedData = null;
      if (variantMetricsMap[p.name]) {
        matchedData = variantMetricsMap[p.name];
      } else {
        const foundKey = Object.keys(variantMetricsMap).find(
          k => k.toLowerCase().trim() === pNameLower || isNameMatch(k, p.name)
        );
        if (foundKey) {
          matchedData = variantMetricsMap[foundKey];
        }
      }

      let susScore = 0;
      let responseCount = 0;

      if (matchedData && matchedData.count > 0) {
        susScore = Math.round((matchedData.totalScore / matchedData.count) * 10) / 10;
        responseCount = matchedData.count;
      } else {
        // Fallback 1: Check 'measurements' collection for this product
        const prodMeasurements = measurements.filter(m => 
          m.productId === p.id || 
          isNameMatch(m.productId, p.id) || 
          isNameMatch(m.productId, p.name)
        );

        if (prodMeasurements.length > 0) {
          let weightedSum = 0;
          let totalCount = 0;
          prodMeasurements.forEach(m => {
            const avg = Number(m.averageScore);
            const cnt = Number(m.responseCount) || 1;
            if (!isNaN(avg) && avg >= 0 && avg <= 100) {
              weightedSum += avg * cnt;
              totalCount += cnt;
            }
          });
          if (totalCount > 0) {
            susScore = Math.round((weightedSum / totalCount) * 10) / 10;
            responseCount = totalCount;
          }
        }

        // Fallback 2: Check product document baseline
        if (responseCount === 0) {
          const baseline = Number(p.susScore);
          if (p.susScore !== undefined && p.susScore !== null && !isNaN(baseline) && baseline > 0) {
            susScore = Math.round(baseline * 10) / 10;
            responseCount = Number(p.responsesCount) || 1;
          }
        }
      }

      // Check active or completed surveys for this product
      const productSurveys = surveys.filter(s => 
        s.productId === p.id || 
        isNameMatch(s.productId, p.id) || 
        isNameMatch(s.productId, p.name) || 
        isNameMatch(s.name, p.name)
      );
      const activeSurvey = productSurveys.find(s => s.status === 'active') || productSurveys[0];

      const firstRoundFromResponses = matchedData ? Array.from(matchedData.rounds.values())[0] as any : null;

      const roundId = activeSurvey?.id || firstRoundFromResponses?.roundId || (responseCount > 0 ? `round-${p.id}` : '');
      const roundName = activeSurvey?.title || activeSurvey?.name || firstRoundFromResponses?.roundName || (responseCount > 0 ? `SUS-mätning ${p.name}` : '');
      const roundStatus = activeSurvey?.status || firstRoundFromResponses?.roundStatus || (responseCount > 0 ? 'completed' : 'none');
      const startDate = activeSurvey?.startDate || firstRoundFromResponses?.startDate || '';
      const endDate = activeSurvey?.endDate || firstRoundFromResponses?.endDate || '';
      const dateVal = activeSurvey?.createdAt || firstRoundFromResponses?.date || matchedData?.latestDate || new Date().toISOString();

      productMetrics.push({
        productId: p.id,
        productName: p.name,
        teamId: p.teamId || 'team-omappat',
        teamName: p.teamName || 'Omappat team',
        trainId: p.trainId || 'train-omappade',
        trainName: p.trainName || 'Omappad',
        susScore: susScore,
        responses: responseCount,
        responsesCount: responseCount,
        roundId: roundId,
        roundName: roundName,
        roundStatus: roundStatus,
        startDate: startDate,
        endDate: endDate,
        date: dateVal,
        // Compatibility duplicate keys
        product_id: p.id,
        product_name: p.name,
        team_id: p.teamId || 'team-omappat',
        team_name: p.teamName || 'Omappat team',
        train_id: p.trainId || 'train-omappade',
        train_name: p.trainName || 'Omappad',
        sus_score: susScore,
        responses_count: responseCount,
        round_id: roundId,
        round_name: roundName,
        round_status: roundStatus
      });

      addedProductIds.add(p.id);
      addedProductNames.add(pNameLower);
    });

    // 2. Add any remaining products from variantMetricsMap that were NOT in the products collection
    Object.entries(variantMetricsMap).forEach(([name, data]) => {
      const nameLower = name.toLowerCase().trim();
      if (!addedProductNames.has(nameLower) && !addedProductIds.has(data.productId)) {
        const susScore = data.count > 0 ? Math.round((data.totalScore / data.count) * 10) / 10 : 0;
        const firstRound = Array.from(data.rounds.values())[0] as any;

        const roundId = firstRound?.roundId || (data.count > 0 ? `round-${data.productId}` : '');
        const roundName = firstRound?.roundName || (data.count > 0 ? `Mätning ${name}` : '');
        const roundStatus = firstRound?.roundStatus || (data.count > 0 ? 'completed' : 'none');
        const startDate = firstRound?.startDate || '';
        const endDate = firstRound?.endDate || '';
        const dateVal = firstRound?.date || data.latestDate || new Date().toISOString();

        productMetrics.push({
          productId: data.productId,
          productName: name,
          teamId: 'team-omappat',
          teamName: 'Omappat team',
          trainId: 'train-omappade',
          trainName: 'Omappad',
          susScore: susScore,
          responses: data.count,
          responsesCount: data.count,
          roundId: roundId,
          roundName: roundName,
          roundStatus: roundStatus,
          startDate: startDate,
          endDate: endDate,
          date: dateVal,
          // Compatibility duplicate keys
          product_id: data.productId,
          product_name: name,
          team_id: 'team-omappat',
          team_name: 'Omappat team',
          train_id: 'train-omappade',
          train_name: 'Omappad',
          sus_score: susScore,
          responses_count: data.count,
          round_id: roundId,
          round_name: roundName,
          round_status: roundStatus
        });
        addedProductIds.add(data.productId);
        addedProductNames.add(nameLower);
      }
    });

    const events = allResponses.map(r => {
      let matchedP = null;
      const rawName = (r.variantName || '').trim();
      const rawNameLower = rawName.toLowerCase();
      const normalizedRaw = rawName === 'Generell' || rawName === 'Other' || rawName === 'Övriga' ? 'Övriga' : rawName;
      const mappedFromCatalog = mappings[normalizedRaw] || mappings[rawName];

      if (mappedFromCatalog && productMap.has(mappedFromCatalog.toLowerCase().trim())) {
        matchedP = productMap.get(mappedFromCatalog.toLowerCase().trim());
      } else if (productMap.has(rawName)) {
        matchedP = productMap.get(rawName);
      } else if (productMap.has(rawNameLower)) {
        matchedP = productMap.get(rawNameLower);
      } else if (r.productId && productMap.has(r.productId)) {
        matchedP = productMap.get(r.productId);
      } else {
        matchedP = products.find(p => isNameMatch(rawName, p.name) || isNameMatch(r.productId, p.id) || (mappedFromCatalog && isNameMatch(mappedFromCatalog, p.name)));
      }

      let finalProdName = matchedP ? matchedP.name : (mappedFromCatalog || normalizedRaw || 'Övriga');
      let finalProdId = matchedP ? matchedP.id : (r.productId || 'prod-general');

      if (finalProdName.startsWith('Egna') && matchedP) {
        finalProdName = matchedP.name;
      }

      const resDate = r.date ? (typeof r.date === 'string' ? r.date : new Date(r.date).toISOString()) : new Date().toISOString();

      return {
        eventId: r.id,
        timestamp: resDate,
        eventType: "SUS_SURVEY_COMPLETED",
        targetProductId: finalProdId,
        productName: finalProdName,
        scoreGiven: Number(r.susScore) || 0
      };
    });

    const payload = {
      source: "inera-sus" as const,
      sourceKey: "inera-sus" as const,
      timestamp: new Date().toISOString(),
      organization: "Inera AB",
      metrics: {
        score: overallScore,
        evaluationsCount: totalEvaluations,
        responseRate: 100,
        productsCount: productMetrics.length,
        products: productMetrics
      },
      granularData: {
        products: productMetrics,
        events: events
      }
    };

    return payload;
  } catch (error: any) {
    console.error("Fel vid generering av SUS-payload:", error);
    throw error;
  }
}

export async function triggerSusMetricsSync() {
  try {
    const payload = await generateSusMetricsPayload();
    return await pushMetricsToAdminDashboard(payload);
  } catch (error: any) {
    console.error("Fel vid automatisk synk av SUS-metrics:", error);
    return { success: false, error: error.message };
  }
}
