export type Market = '上市' | '上櫃';
export type ForecastYear = '2024' | '2025' | '2026' | '2027' | '2028';

export interface StockSeed {
  code: string;
  name: string;
  market: Market;
  group: string | null;
  sourceRow?: number;
  fallbackPrice: number;
  fallbackChange?: number | null;
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

export type EstimateYear = '2026' | '2027' | '2028';
export type ModelConfidence = '高' | '中' | '低';

export interface ModelAnalysis {
  label: 'Codex 模型估算（非法人共識）';
  methodologyVersion: '2026.08-v1';
  annualizedActualEps: number | null;
  eps: Record<EstimateYear, number | null>;
  pe: Record<EstimateYear, number | null>;
  peLow: number | null;
  peMid: number | null;
  peHigh: number | null;
  peerPe2027: number | null;
  peerSampleSize: number;
  peerScope: '族群' | '市場備援' | '原表區間代用' | '無';
  referencePriceLow: number | null;
  referencePrice: number | null;
  referencePriceHigh: number | null;
  referenceYear: 2026 | 2027 | null;
  upside: number | null;
  dataAdequacy: ModelConfidence;
  method: string;
  caveats: string[];
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
  officialTrailingPe: number | null;
  officialPriceToBook: number | null;
  officialDividendYield: number | null;
  officialValuationDate: string | null;
  workbookPeSnapshot: Record<'2025' | '2026' | '2027' | '2028', number | null>;
  workbookPeBasis: Record<'2025' | '2026' | '2027' | '2028', 2025 | 2026 | 2027 | 2028 | null>;
  workbookUpsideSnapshot: number | null;
  pe: Record<'2025' | '2026' | '2027' | '2028', number | null>;
  growth: Record<'2025' | '2026' | '2027' | '2028', GrowthMetric>;
  revision: Record<'2025' | '2026' | '2027' | '2028', GrowthMetric>;
  referencePrice: number | null;
  referenceYear: 2025 | 2026 | 2027 | null;
  upside: number | null;
  forecastAgeDays: number | null;
  quality: string[];
  analysis: ModelAnalysis;
}

export interface SourceStatus {
  id: 'twseQuotes' | 'tpexQuotes' | 'twseEps' | 'tpexEps' | 'twseValuation' | 'tpexValuation';
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
