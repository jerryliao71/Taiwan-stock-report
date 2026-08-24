import seedJson from '@/data/stock-seeds.json';
import type { DashboardData, ForecastYear, GrowthMetric, Market, SourceStatus, StockRecord, StockSeed } from '@/lib/types';

export const DATA_ENDPOINTS = {
  twseQuotes: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  tpexQuotes: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes',
  twseEps: 'https://openapi.twse.com.tw/v1/opendata/t187ap14_L',
  tpexEps: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O',
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

type FetchBundle = {
  quotes: Map<string, Quote>;
  eps: Map<string, ActualEps>;
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

function referenceYearFor(seed: StockSeed): 2025 | 2026 | 2027 | null {
  if ((seed.eps['2027'] ?? 0) > 0) return 2027;
  if ((seed.eps['2026'] ?? 0) > 0) return 2026;
  if ((seed.eps['2025'] ?? 0) > 0) return 2025;
  return null;
}

function buildStock(seed: StockSeed, quote?: Quote, actual?: ActualEps): StockRecord {
  const price = quote?.price ?? seed.fallbackPrice;
  const referenceYear = referenceYearFor(seed);
  const midpointPe = seed.lowPe !== null && seed.highPe !== null ? (seed.lowPe + seed.highPe) / 2 : null;
  const referenceEps = referenceYear ? seed.eps[String(referenceYear) as ForecastYear] : null;
  const referencePrice = midpointPe !== null && referenceEps !== null && referenceEps > 0 ? midpointPe * referenceEps : null;
  const previousClose = quote?.change !== null && quote?.change !== undefined ? price - quote.change : null;
  const changePct = previousClose !== null && previousClose > 0 && quote?.change !== null && quote?.change !== undefined ? quote.change / previousClose : null;
  const forecastAgeDays = ageInDays(seed.forecastAsOf);
  const quality: string[] = [];

  if (!quote) quality.push('行情使用快照');
  if (seed.forecastAsOf === null) quality.push('財測無日期');
  else if (forecastAgeDays !== null && forecastAgeDays > 180) quality.push('財測逾180天');
  if (seed.eps['2027'] === null) quality.push('缺2027 EPS');
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
    referencePrice,
    referenceYear,
    upside: referencePrice !== null && price > 0 ? referencePrice / price - 1 : null,
    forecastAgeDays,
    quality: [...new Set(quality)],
  };
}

function baselineSources(): SourceStatus[] {
  return [
    { id: 'twseQuotes', label: 'TWSE 上市行情', url: DATA_ENDPOINTS.twseQuotes, ok: false, date: null, error: '等待同步' },
    { id: 'tpexQuotes', label: 'TPEx 上櫃行情', url: DATA_ENDPOINTS.tpexQuotes, ok: false, date: null, error: '等待同步' },
    { id: 'twseEps', label: 'MOPS 上市實績 EPS', url: DATA_ENDPOINTS.twseEps, ok: false, date: null, error: '等待同步' },
    { id: 'tpexEps', label: 'MOPS 上櫃實績 EPS', url: DATA_ENDPOINTS.tpexEps, ok: false, date: null, error: '等待同步' },
  ];
}

export function createBaselineDashboard(): DashboardData {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'baseline',
    officialQuoteCount: 0,
    officialEpsCount: 0,
    sources: baselineSources(),
    stocks: seeds.map((seed) => buildStock(seed)),
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
  ]);
  const quotes = new Map<string, Quote>();
  const eps = new Map<string, ActualEps>();
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

  return { quotes, eps, sources: statuses };
}

export async function fetchOfficialDashboard(): Promise<DashboardData> {
  const bundle = await collectOfficialData();
  const stocks = seeds.map((seed) => buildStock(seed, bundle.quotes.get(seed.code), bundle.eps.get(seed.code)));
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
