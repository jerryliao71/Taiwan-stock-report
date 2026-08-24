import seedJson from '@/data/stock-seeds.json';
import type { DashboardData, ForecastYear, GrowthMetric, Market, ModelAnalysis, SourceStatus, StockRecord, StockSeed } from '@/lib/types';

export const DATA_ENDPOINTS = {
  twseQuotes: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  tpexQuotes: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes',
  twseEps: 'https://openapi.twse.com.tw/v1/opendata/t187ap14_L',
  tpexEps: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O',
  twseValuation: 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
  tpexValuation: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
} as const;

const seeds = seedJson as StockSeed[];

type Quote = {
  code: string;
  name: string | null;
  price: number;
  change: number | null;
  date: string | null;
  source: 'TWSE' | 'TPEx';
};

type ActualEps = {
  code: string;
  value: number;
  period: string | null;
  date: string | null;
};

type OfficialValuation = {
  code: string;
  trailingPe: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  date: string | null;
};

type FetchBundle = {
  quotes: Map<string, Quote>;
  eps: Map<string, ActualEps>;
  valuations: Map<string, OfficialValuation>;
  sources: SourceStatus[];
};

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').replace(/^\+/, '').trim();
  if (!normalized || /^-+$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function rocDateToIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 7) return null;
  const year = Number(digits.slice(0, 3)) + 1911;
  const month = digits.slice(3, 5);
  const day = digits.slice(5, 7);
  return `${year}-${month}-${day}`;
}

function forecastDateToIso(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function ageInDays(value: string | null): number | null {
  const iso = forecastDateToIso(value);
  if (!iso) return null;
  const timestamp = Date.parse(`${iso}T00:00:00+08:00`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function growth(next: number | null, base: number | null): GrowthMetric {
  if (next === null || base === null) return { kind: 'missing', value: null };
  if (base <= 0 && next > 0) return { kind: 'turnProfit', value: null };
  if (base > 0 && next < 0) return { kind: 'turnLoss', value: null };
  if (base <= 0 && next <= 0) return { kind: 'loss', value: null };
  return { kind: 'percent', value: next / base - 1 };
}

function pe(price: number, eps: number | null): number | null {
  return eps !== null && eps > 0 ? price / eps : null;
}

function workbookPeFor(seed: StockSeed, year: 2025 | 2026 | 2027 | 2028, price: number): { value: number | null; basisYear: 2025 | 2026 | 2027 | 2028 | null } {
  const candidates = year === 2028
    ? [2028, 2027, 2026] as const
    : year === 2027
      ? [2027, 2026, 2025] as const
      : [year] as const;
  const basisYear = candidates.find((candidate) => seed.eps[String(candidate) as ForecastYear] !== null) ?? null;
  if (basisYear === null) return { value: null, basisYear: null };
  const eps = seed.eps[String(basisYear) as ForecastYear];
  return { value: eps !== null && eps !== 0 ? price / eps : null, basisYear };
}

function referenceYearFor(seed: StockSeed): 2025 | 2026 | 2027 | null {
  if (seed.eps['2027'] !== null) return 2027;
  if (seed.eps['2026'] !== null) return 2026;
  if (seed.eps['2025'] !== null) return 2025;
  return null;
}

function emptyAnalysis(): ModelAnalysis {
  return {
    label: 'Codex 模型估算（非法人共識）',
    methodologyVersion: '2026.08-v1',
    annualizedActualEps: null,
    eps: { 2026: null, 2027: null, 2028: null },
    pe: { 2026: null, 2027: null, 2028: null },
    peLow: null,
    peMid: null,
    peHigh: null,
    peerPe2027: null,
    peerSampleSize: 0,
    peerScope: '無',
    referencePriceLow: null,
    referencePrice: null,
    referencePriceHigh: null,
    referenceYear: null,
    upside: null,
    dataAdequacy: '低',
    method: '2026E 以官方累計 EPS 取代原表線性季度假設；後續年度以原表成長與同族群中位數加權；估值區間以原表低／高 PE 與同族群 2027E PE 四分位數加權。',
    caveats: ['非券商共識、非目標價', '未納入季節性與一次性損益調整'],
  };
}

function buildStock(seed: StockSeed, quote?: Quote, actual?: ActualEps, valuation?: OfficialValuation): StockRecord {
  const price = quote?.price ?? seed.fallbackPrice;
  const referenceYear = referenceYearFor(seed);
  const midpointPe = seed.lowPe !== null && seed.highPe !== null ? (seed.lowPe + seed.highPe) / 2 : null;
  const referenceEps = referenceYear ? seed.eps[String(referenceYear) as ForecastYear] : null;
  const referencePrice = midpointPe !== null && referenceEps !== null ? midpointPe * referenceEps : null;
  const previousClose = quote?.change !== null && quote?.change !== undefined ? price - quote.change : null;
  const changePct = previousClose !== null && previousClose > 0 && quote?.change !== null && quote?.change !== undefined
    ? quote.change / previousClose
    : seed.fallbackChange ?? null;
  const forecastAgeDays = ageInDays(seed.forecastAsOf);
  const quality: string[] = [];
  const workbookPe2025 = workbookPeFor(seed, 2025, seed.fallbackPrice);
  const workbookPe2026 = workbookPeFor(seed, 2026, seed.fallbackPrice);
  const workbookPe2027 = workbookPeFor(seed, 2027, seed.fallbackPrice);
  const workbookPe2028 = workbookPeFor(seed, 2028, seed.fallbackPrice);

  if (!quote) quality.push('行情使用快照');
  if (seed.forecastAsOf === null) quality.push('財測無日期');
  else if (forecastAgeDays !== null && forecastAgeDays > 180) quality.push('財測逾180天');
  if (seed.eps['2027'] === null) quality.push('缺2027 EPS');
  if (seed.lowPe === null || seed.highPe === null || seed.lowPe <= 0 || seed.highPe <= 0 || seed.highPe < seed.lowPe) quality.push('PE區間待確認');
  if (referenceYear !== null && referenceYear !== 2027) quality.push(`估值基準${referenceYear}`);
  if (referencePrice === null) quality.push('無法估值');
  if (growth(seed.eps['2026'], seed.eps['2025']).kind !== 'percent') quality.push('EPS基期特殊');

  return {
    ...seed,
    price,
    priceChange: quote?.change ?? null,
    changePct,
    priceDate: quote?.date ?? null,
    priceSource: quote?.source ?? '工作簿快照',
    officialName: quote?.name ?? null,
    actualEpsYtd: actual?.value ?? null,
    actualEpsPeriod: actual?.period ?? null,
    officialTrailingPe: valuation?.trailingPe ?? null,
    officialPriceToBook: valuation?.priceToBook ?? null,
    officialDividendYield: valuation?.dividendYield ?? null,
    officialValuationDate: valuation?.date ?? null,
    workbookPeSnapshot: {
      2025: workbookPe2025.value,
      2026: workbookPe2026.value,
      2027: workbookPe2027.value,
      2028: workbookPe2028.value,
    },
    workbookPeBasis: {
      2025: workbookPe2025.basisYear,
      2026: workbookPe2026.basisYear,
      2027: workbookPe2027.basisYear,
      2028: workbookPe2028.basisYear,
    },
    workbookUpsideSnapshot: referencePrice !== null && seed.fallbackPrice > 0 ? referencePrice / seed.fallbackPrice - 1 : null,
    pe: {
      2025: pe(price, seed.eps['2025']),
      2026: pe(price, seed.eps['2026']),
      2027: pe(price, seed.eps['2027']),
      2028: pe(price, seed.eps['2028']),
    },
    growth: {
      2025: growth(seed.eps['2025'], seed.eps['2024']),
      2026: growth(seed.eps['2026'], seed.eps['2025']),
      2027: growth(seed.eps['2027'], seed.eps['2026']),
      2028: growth(seed.eps['2028'], seed.eps['2027']),
    },
    revision: {
      2025: growth(seed.eps['2025'], seed.epsOld['2025']),
      2026: growth(seed.eps['2026'], seed.epsOld['2026']),
      2027: growth(seed.eps['2027'], seed.epsOld['2027']),
      2028: growth(seed.eps['2028'], seed.epsOld['2028']),
    },
    referencePrice,
    referenceYear,
    upside: referencePrice !== null && price > 0 ? referencePrice / price - 1 : null,
    forecastAgeDays,
    quality: [...new Set(quality)],
    analysis: emptyAnalysis(),
  };
}

function round2(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function parseActualPeriod(period: string | null): { year: number; quarter: number } | null {
  if (!period) return null;
  const match = period.match(/^(\d{2,4})Q([1-4])$/);
  if (!match) return null;
  const rawYear = Number(match[1]);
  return { year: rawYear < 1911 ? rawYear + 1911 : rawYear, quarter: Number(match[2]) };
}

function isoAgeInDays(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function quantile(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function removeIqrOutliers(values: number[]): number[] {
  if (values.length < 8) return values;
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  if (q1 === null || q3 === null) return values;
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return values.filter((value) => value >= lower && value <= upper);
}

function peerValues(
  stocks: StockRecord[],
  target: StockRecord,
  selector: (stock: StockRecord) => number | null,
): { values: number[]; scope: '族群' | '市場備援' | '無' } {
  const eligible = stocks.filter((stock) => stock.code !== target.code && stock.forecastAgeDays !== null && stock.forecastAgeDays <= 365);
  if (target.group) {
    const groupValues = removeIqrOutliers(eligible
      .filter((stock) => stock.market === target.market && stock.group === target.group)
      .map(selector)
      .filter((value): value is number => value !== null && Number.isFinite(value)));
    if (groupValues.length >= 5) return { values: groupValues, scope: '族群' };
  }
  const marketValues = removeIqrOutliers(eligible
    .filter((stock) => stock.market === target.market)
    .map(selector)
    .filter((value): value is number => value !== null && Number.isFinite(value)));
  return marketValues.length >= 5 ? { values: marketValues, scope: '市場備援' } : { values: [], scope: '無' };
}

function freshnessWeight(age: number | null, fresh: number, medium: number, old: number): number | null {
  if (age === null || age > 365) return null;
  if (age <= 90) return fresh;
  if (age <= 180) return medium;
  return old;
}

function attachModelAnalysis(stocks: StockRecord[]): StockRecord[] {
  return stocks.map((stock) => {
    const book2026 = stock.eps['2026'];
    const book2027 = stock.eps['2027'];
    const book2028 = stock.eps['2028'];
    const period = parseActualPeriod(stock.actualEpsPeriod);
    const actualMatches2026 = period?.year === 2026;
    const annualizedActualEps = actualMatches2026 && stock.actualEpsYtd !== null && period
      ? round2(stock.actualEpsYtd * 4 / period.quarter)
      : null;

    let model2026: number | null = book2026;
    if (actualMatches2026 && period && stock.actualEpsYtd !== null) {
      model2026 = book2026 !== null
        ? stock.actualEpsYtd + (1 - period.quarter / 4) * book2026
        : stock.actualEpsYtd * 4 / period.quarter;
    }
    model2026 = round2(model2026);

    const peerGrowth2027 = peerValues(stocks, stock, (peer) => {
      const metric = peer.growth['2027'];
      return metric.kind === 'percent' && metric.value !== null && metric.value >= -0.5 && metric.value <= 2 ? metric.value : null;
    });
    const growthBeta2027 = freshnessWeight(stock.forecastAgeDays, 0.7, 0.5, 0.3);
    const ownGrowth2027 = book2026 !== null && book2026 > 0 && book2027 !== null && book2027 > 0 ? book2027 / book2026 - 1 : null;
    const peerMedianGrowth2027 = quantile(peerGrowth2027.values, 0.5);
    const blendedGrowth2027 = growthBeta2027 !== null && ownGrowth2027 !== null && peerMedianGrowth2027 !== null
      ? growthBeta2027 * ownGrowth2027 + (1 - growthBeta2027) * peerMedianGrowth2027
      : null;
    const model2027 = round2(model2026 !== null && model2026 > 0 && blendedGrowth2027 !== null && blendedGrowth2027 > -1
      ? model2026 * (1 + blendedGrowth2027)
      : null);

    const peerGrowth2028 = peerValues(stocks, stock, (peer) => {
      const metric = peer.growth['2028'];
      return metric.kind === 'percent' && metric.value !== null && metric.value >= -0.5 && metric.value <= 2 ? metric.value : null;
    });
    const beta2028Base = freshnessWeight(stock.forecastAgeDays, 0.55, 0.35, 0.15);
    const ownGrowth2028 = book2027 !== null && book2027 > 0 && book2028 !== null && book2028 > 0 ? book2028 / book2027 - 1 : null;
    const peerMedianGrowth2028 = quantile(peerGrowth2028.values, 0.5);
    const blendedGrowth2028 = beta2028Base !== null && ownGrowth2028 !== null && peerMedianGrowth2028 !== null
      ? beta2028Base * ownGrowth2028 + (1 - beta2028Base) * peerMedianGrowth2028
      : null;
    const model2028 = round2(model2027 !== null && model2027 > 0 && blendedGrowth2028 !== null && blendedGrowth2028 > -1
      ? model2027 * (1 + blendedGrowth2028)
      : null);

    const peerPe = peerValues(stocks, stock, (peer) => {
      const value = peer.pe['2027'];
      return peer.priceSource !== '工作簿快照' && value !== null && value >= 5 && value <= 80 ? value : null;
    });
    const peerP25 = quantile(peerPe.values, 0.25);
    const peerMedianPe = quantile(peerPe.values, 0.5);
    const peerP75 = quantile(peerPe.values, 0.75);
    const rangeWeight = freshnessWeight(stock.forecastAgeDays, 0.6, 0.4, 0.2);
    const validBookRange = stock.lowPe !== null && stock.highPe !== null && stock.lowPe > 0 && stock.highPe >= stock.lowPe;

    let peLow: number | null = null;
    let peMid: number | null = null;
    let peHigh: number | null = null;
    let peerScope: ModelAnalysis['peerScope'] = peerPe.scope;
    if (rangeWeight !== null && validBookRange && peerP25 !== null && peerMedianPe !== null && peerP75 !== null) {
      peLow = rangeWeight * stock.lowPe! + (1 - rangeWeight) * peerP25;
      peMid = rangeWeight * ((stock.lowPe! + stock.highPe!) / 2) + (1 - rangeWeight) * peerMedianPe;
      peHigh = rangeWeight * stock.highPe! + (1 - rangeWeight) * peerP75;
    } else if (peerP25 !== null && peerMedianPe !== null && peerP75 !== null) {
      peLow = peerP25;
      peMid = peerMedianPe;
      peHigh = peerP75;
    } else if (validBookRange) {
      peLow = stock.lowPe;
      peMid = (stock.lowPe! + stock.highPe!) / 2;
      peHigh = stock.highPe;
      peerScope = '原表區間代用';
    } else {
      peerScope = '無';
    }
    const orderedRange = [peLow, peMid, peHigh].every((value) => value !== null)
      ? [peLow!, peMid!, peHigh!].sort((a, b) => a - b)
      : [null, null, null];
    [peLow, peMid, peHigh] = orderedRange.map(round2) as [number | null, number | null, number | null];

    const referenceYear = model2027 !== null && model2027 > 0 ? 2027 : model2026 !== null && model2026 > 0 ? 2026 : null;
    const referenceEps = referenceYear === 2027 ? model2027 : referenceYear === 2026 ? model2026 : null;
    const referencePriceLow = round2(referenceEps !== null && peLow !== null ? referenceEps * peLow : null);
    const referencePrice = round2(referenceEps !== null && peMid !== null ? referenceEps * peMid : null);
    const referencePriceHigh = round2(referenceEps !== null && peHigh !== null ? referenceEps * peHigh : null);

    const signConflict = annualizedActualEps !== null && book2026 !== null && annualizedActualEps !== 0 && book2026 !== 0
      && Math.sign(annualizedActualEps) !== Math.sign(book2026);
    const largeDeviation = annualizedActualEps !== null && book2026 !== null
      && Math.abs(annualizedActualEps - book2026) / Math.max(Math.abs(book2026), 0.01) > 0.5;
    const priceAge = isoAgeInDays(stock.priceDate);
    const priceFresh = stock.priceSource !== '工作簿快照' && priceAge !== null && priceAge <= 5;
    const actualValid = actualMatches2026 && stock.actualEpsYtd !== null;
    const forecastFresh = stock.forecastAgeDays !== null && stock.forecastAgeDays <= 90;
    const peerRich = peerPe.values.length >= 8;
    const positiveForecasts = model2026 !== null && model2026 > 0 && model2027 !== null && model2027 > 0;
    const noConflict = !signConflict && !largeDeviation;
    const score = [priceFresh, actualValid, forecastFresh, peerRich, positiveForecasts, noConflict].filter(Boolean).length;
    const criticalIssue = !priceFresh || stock.forecastAgeDays === null || stock.forecastAgeDays > 365 || !positiveForecasts || signConflict;
    const dataAdequacy: ModelAnalysis['dataAdequacy'] = !criticalIssue && score === 6 ? '高' : !criticalIssue && score >= 3 ? '中' : '低';

    const caveats = ['非券商共識、非目標價', '未納入季節性、一次性損益、股本變動、股利及淨負債'];
    if (!actualValid) caveats.push('2026E 未以同年度官方累計 EPS 校準');
    if (peerPe.values.length < 5) caveats.push('同行樣本不足，估值區間沿用原表');
    else if (peerPe.scope === '市場備援') caveats.push('族群樣本不足，改用同市場中位數');
    if (signConflict || largeDeviation) caveats.push('官方年化實績與原表 2026E 顯著衝突');
    if (stock.forecastAgeDays !== null && stock.forecastAgeDays > 180) caveats.push('原表預估日期偏舊');

    const analysis: ModelAnalysis = {
      label: 'Codex 模型估算（非法人共識）',
      methodologyVersion: '2026.08-v1',
      annualizedActualEps,
      eps: { 2026: model2026, 2027: model2027, 2028: model2028 },
      pe: { 2026: pe(stock.price, model2026), 2027: pe(stock.price, model2027), 2028: pe(stock.price, model2028) },
      peLow,
      peMid,
      peHigh,
      peerPe2027: round2(peerMedianPe),
      peerSampleSize: peerPe.values.length,
      peerScope,
      referencePriceLow,
      referencePrice,
      referencePriceHigh,
      referenceYear,
      upside: referencePrice !== null && stock.price > 0 ? referencePrice / stock.price - 1 : null,
      dataAdequacy,
      method: '2026E 以官方累計 EPS 取代原表線性季度假設；2027–28E 將原表成長率與同族群（不足時同市場）中位數依資料新鮮度加權；PE 低／中／高以原表區間與同行四分位數加權。',
      caveats: [...new Set(caveats)],
    };
    return { ...stock, analysis };
  });
}

function baselineSources(): SourceStatus[] {
  return [
    { id: 'twseQuotes', label: 'TWSE 上市行情', url: DATA_ENDPOINTS.twseQuotes, ok: false, date: null, error: '等待同步' },
    { id: 'tpexQuotes', label: 'TPEx 上櫃行情', url: DATA_ENDPOINTS.tpexQuotes, ok: false, date: null, error: '等待同步' },
    { id: 'twseEps', label: 'MOPS 上市實績 EPS', url: DATA_ENDPOINTS.twseEps, ok: false, date: null, error: '等待同步' },
    { id: 'tpexEps', label: 'MOPS 上櫃實績 EPS', url: DATA_ENDPOINTS.tpexEps, ok: false, date: null, error: '等待同步' },
    { id: 'twseValuation', label: 'TWSE 官方近四季 PE', url: DATA_ENDPOINTS.twseValuation, ok: false, date: null, error: '等待同步' },
    { id: 'tpexValuation', label: 'TPEx 官方近四季 PE', url: DATA_ENDPOINTS.tpexValuation, ok: false, date: null, error: '等待同步' },
  ];
}

export function createBaselineDashboard(): DashboardData {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'baseline',
    officialQuoteCount: 0,
    officialEpsCount: 0,
    sources: baselineSources(),
    stocks: attachModelAnalysis(seeds.map((seed) => buildStock(seed))),
  };
}

async function fetchArray(url: string): Promise<Record<string, unknown>[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('Unexpected payload');
    return payload as Record<string, unknown>[];
  } finally {
    clearTimeout(timeout);
  }
}

function latestDate(values: Array<string | null>): string | null {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates.at(-1) ?? null;
}

async function collectOfficialData(): Promise<FetchBundle> {
  const requests = await Promise.allSettled([
    fetchArray(DATA_ENDPOINTS.twseQuotes),
    fetchArray(DATA_ENDPOINTS.tpexQuotes),
    fetchArray(DATA_ENDPOINTS.twseEps),
    fetchArray(DATA_ENDPOINTS.tpexEps),
    fetchArray(DATA_ENDPOINTS.twseValuation),
    fetchArray(DATA_ENDPOINTS.tpexValuation),
  ]);
  const quotes = new Map<string, Quote>();
  const eps = new Map<string, ActualEps>();
  const valuations = new Map<string, OfficialValuation>();
  const statuses: SourceStatus[] = [];

  const registerStatus = (index: number, id: SourceStatus['id'], label: string, date: string | null) => {
    const result = requests[index];
    statuses.push({
      id,
      label,
      url: DATA_ENDPOINTS[id],
      ok: result.status === 'fulfilled',
      date,
      ...(result.status === 'rejected' ? { error: result.reason instanceof Error ? result.reason.message : '同步失敗' } : {}),
    });
  };

  if (requests[0].status === 'fulfilled') {
    for (const row of requests[0].value) {
      const code = String(row.Code ?? '').trim();
      const price = numberFrom(row.ClosingPrice);
      if (!code || price === null) continue;
      quotes.set(code, { code, name: String(row.Name ?? '').trim() || null, price, change: numberFrom(row.Change), date: rocDateToIso(row.Date), source: 'TWSE' });
    }
  }
  registerStatus(0, 'twseQuotes', 'TWSE 上市行情', latestDate([...quotes.values()].filter((quote) => quote.source === 'TWSE').map((quote) => quote.date)));

  if (requests[1].status === 'fulfilled') {
    for (const row of requests[1].value) {
      const code = String(row.SecuritiesCompanyCode ?? '').trim();
      const price = numberFrom(row.Close);
      if (!code || price === null) continue;
      quotes.set(code, { code, name: String(row.CompanyName ?? '').trim() || null, price, change: numberFrom(row.Change), date: rocDateToIso(row.Date), source: 'TPEx' });
    }
  }
  registerStatus(1, 'tpexQuotes', 'TPEx 上櫃行情', latestDate([...quotes.values()].filter((quote) => quote.source === 'TPEx').map((quote) => quote.date)));

  if (requests[2].status === 'fulfilled') {
    for (const row of requests[2].value) {
      const code = String(row['公司代號'] ?? '').trim();
      const value = numberFrom(row['基本每股盈餘(元)']);
      if (!code || value === null) continue;
      eps.set(code, { code, value, period: `${String(row['年度'] ?? '')}Q${String(row['季別'] ?? '')}`, date: rocDateToIso(row['出表日期']) });
    }
  }
  registerStatus(2, 'twseEps', 'MOPS 上市實績 EPS', latestDate([...eps.values()].map((item) => item.date)));

  if (requests[3].status === 'fulfilled') {
    for (const row of requests[3].value) {
      const code = String(row.SecuritiesCompanyCode ?? '').trim();
      const value = numberFrom(row['基本每股盈餘']);
      if (!code || value === null) continue;
      eps.set(code, { code, value, period: `${String(row.Year ?? '')}Q${String(row['季別'] ?? '')}`, date: rocDateToIso(row.Date) });
    }
  }
  registerStatus(3, 'tpexEps', 'MOPS 上櫃實績 EPS', latestDate(requests[3].status === 'fulfilled' ? requests[3].value.map((row) => rocDateToIso(row.Date)) : []));

  if (requests[4].status === 'fulfilled') {
    for (const row of requests[4].value) {
      const code = String(row.Code ?? '').trim();
      if (!code) continue;
      const dividendYield = numberFrom(row.DividendYield);
      valuations.set(code, {
        code,
        trailingPe: numberFrom(row.PEratio),
        priceToBook: numberFrom(row.PBratio),
        dividendYield: dividendYield === null ? null : dividendYield / 100,
        date: rocDateToIso(row.Date),
      });
    }
  }
  registerStatus(4, 'twseValuation', 'TWSE 官方近四季 PE', latestDate(requests[4].status === 'fulfilled' ? requests[4].value.map((row) => rocDateToIso(row.Date)) : []));

  if (requests[5].status === 'fulfilled') {
    for (const row of requests[5].value) {
      const code = String(row.SecuritiesCompanyCode ?? '').trim();
      if (!code) continue;
      const dividendYield = numberFrom(row.YieldRatio);
      valuations.set(code, {
        code,
        trailingPe: numberFrom(row.PriceEarningRatio),
        priceToBook: numberFrom(row.PriceBookRatio),
        dividendYield: dividendYield === null ? null : dividendYield / 100,
        date: rocDateToIso(row.Date),
      });
    }
  }
  registerStatus(5, 'tpexValuation', 'TPEx 官方近四季 PE', latestDate(requests[5].status === 'fulfilled' ? requests[5].value.map((row) => rocDateToIso(row.Date)) : []));

  return { quotes, eps, valuations, sources: statuses };
}

export async function fetchOfficialDashboard(): Promise<DashboardData> {
  const bundle = await collectOfficialData();
  const stocks = attachModelAnalysis(seeds.map((seed) => buildStock(seed, bundle.quotes.get(seed.code), bundle.eps.get(seed.code), bundle.valuations.get(seed.code))));
  return {
    generatedAt: new Date().toISOString(),
    mode: 'official',
    officialQuoteCount: stocks.filter((stock) => stock.priceSource !== '工作簿快照').length,
    officialEpsCount: stocks.filter((stock) => stock.actualEpsYtd !== null).length,
    sources: bundle.sources,
    stocks,
  };
}

export function marketLabel(market: Market): string {
  return market === '上市' ? 'TWSE' : 'TPEx';
}
