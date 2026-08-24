export type Market = '上市' | '上櫃';
export type ForecastYear = '2024' | '2025' | '2026' | '2027' | '2028';

export interface StockSeed {
  code: string;
  name: string;
  market: Market;
  group: string | null;
  fallbackPrice: number;
  lowPe: number | null;
  highPe: number | null;
  note: string | null;
  forecastAsOf: string | null;
  eps: Record<ForecastYear, number | null>;
  epsOld: Record<'2025' | '2026' | '2027' | '2028', number | null>;
}

export type GrowthKind = 'percent' | 'turnProfit' | 'turnLoss' | 'loss' | 'missing';

export interface GrowthMetric {
  kind: GrowthKind;
  value: number | null;
}

export interface StockRecord extends StockSeed {
  price: number;
  priceChange: number | null;
  changePct: number | null;
  priceDate: string | null;
  priceSource: 'TWSE' | 'TPEx' | '工作簿快照';
  officialName: string | null;
  actualEpsYtd: number | null;
  actualEpsPeriod: string | null;
  pe: Record<'2025' | '2026' | '2027' | '2028', number | null>;
  growth: Record<'2025' | '2026' | '2027' | '2028', GrowthMetric>;
  referencePrice: number | null;
  referenceYear: 2025 | 2026 | 2027 | null;
  upside: number | null;
  forecastAgeDays: number | null;
  quality: string[];
}

export interface SourceStatus {
  id: 'twseQuotes' | 'tpexQuotes' | 'twseEps' | 'tpexEps';
  label: string;
  url: string;
  ok: boolean;
  date: string | null;
  error?: string;
}

export interface DashboardData {
  generatedAt: string;
  mode: 'baseline' | 'official';
  officialQuoteCount: number;
  officialEpsCount: number;
  sources: SourceStatus[];
  stocks: StockRecord[];
}
