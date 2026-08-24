'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardData, GrowthMetric, StockRecord } from '@/lib/types';

type SignalFilter = 'all' | 'opportunity' | 'balanced' | 'risk' | 'issues';
type SortKey = 'name' | 'price' | 'changePct' | 'pe2026' | 'growth2026' | 'referencePrice' | 'analysisUpside' | 'forecastAge';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'overview' | 'workbook' | 'analysis';

const compactNumber = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
const priceNumber = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const percentNumber = new Intl.NumberFormat('zh-TW', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const years = ['2025', '2026', '2027', '2028'] as const;

function formatNumber(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? '—' : `${compactNumber.format(value)}${suffix}`;
}

function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : priceNumber.format(value);
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : percentNumber.format(value);
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function growthLabel(metric: GrowthMetric): string {
  if (metric.kind === 'percent') return formatPercent(metric.value);
  if (metric.kind === 'turnProfit') return '轉盈';
  if (metric.kind === 'turnLoss') return '轉虧';
  if (metric.kind === 'loss') return '虧損期';
  return '—';
}

function growthTone(metric: GrowthMetric): string {
  if (metric.kind === 'turnProfit') return 'text-[#176444]';
  if (metric.kind !== 'percent' || metric.value === null) return 'text-[#7a8580]';
  return metric.value >= 0 ? 'text-[#176444]' : 'text-[#a13b35]';
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stockSortValue(stock: StockRecord, key: SortKey): number | string | null {
  switch (key) {
    case 'name': return stock.name;
    case 'price': return stock.price;
    case 'changePct': return stock.changePct;
    case 'pe2026': return stock.pe['2026'];
    case 'growth2026': return stock.growth['2026'].value;
    case 'referencePrice': return stock.referencePrice;
    case 'analysisUpside': return stock.analysis.upside;
    case 'forecastAge': return stock.forecastAgeDays;
  }
}

function opportunityTone(value: number | null): string {
  if (value === null) return 'bg-[#edf0ec] text-[#6f7974]';
  if (value >= 0.2) return 'bg-[#dff3e6] text-[#176444]';
  if (value <= -0.2) return 'bg-[#f8e3e0] text-[#9b3732]';
  return 'bg-[#eef1ed] text-[#53605a]';
}

function adequacyTone(value: StockRecord['analysis']['dataAdequacy']): string {
  if (value === '高') return 'bg-[#dff3e6] text-[#176444]';
  if (value === '中') return 'bg-[#fff0ce] text-[#805315]';
  return 'bg-[#f8e3e0] text-[#9b3732]';
}

function sourceDot(ok: boolean): string {
  return ok ? 'bg-[#47b77f]' : 'bg-[#e2a43a]';
}

function StockButton({ stock, expanded, onToggle }: { stock: StockRecord; expanded: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="text-left">
      <div className="whitespace-nowrap font-semibold">{stock.name}</div>
      <div className="mt-1 flex items-center gap-2 whitespace-nowrap font-mono text-[10px] text-[#8a938e]"><span>{stock.code}</span><span>{expanded ? '收合 −' : '詳情 +'}</span></div>
    </button>
  );
}

function SourceStatusPanel({ data }: { data: DashboardData }) {
  const quoteSources = data.sources.filter((source) => source.id.endsWith('Quotes'));
  const latestDate = quoteSources.map((source) => source.date).filter(Boolean).sort().at(-1) ?? null;

  return (
    <aside className="rounded-2xl border border-[#dbe2d9] bg-[#173c32] p-5 text-white shadow-[0_20px_50px_rgba(23,60,50,.12)]">
      <div className="flex items-start justify-between gap-5">
        <div><p className="text-xs font-medium text-[#a6bbb3]">官方資料同步</p><p className="mt-2 text-xl font-semibold">{data.officialQuoteCount ? `${data.officialQuoteCount} / ${data.stocks.length} 檔` : '等待首次同步'}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${data.officialQuoteCount ? 'bg-[#d8ff6b] text-[#173c32]' : 'bg-white/10 text-[#cad8d2]'}`}>{data.officialQuoteCount ? 'OFFICIAL' : 'BASELINE'}</span>
      </div>
      <div className="mt-5 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2">
        {data.sources.map((source) => (
          <div key={source.id} className="flex items-center justify-between gap-3 text-[10px]">
            <span className="flex items-center gap-2 text-[#c2d0ca]"><i className={`h-1.5 w-1.5 rounded-full ${sourceDot(source.ok)}`} />{source.label}</span>
            <span className="font-mono text-[#91a9a0]">{source.date ?? (source.ok ? '已連線' : '待同步')}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-[#8fa69d]">行情 {latestDate ?? '—'} · 產生時間 {formatGeneratedAt(data.generatedAt)}</p>
    </aside>
  );
}

function DetailPanel({ stock }: { stock: StockRecord }) {
  return (
    <div className="grid gap-4 bg-[#f4f7f2] p-5 xl:grid-cols-3">
      <section className="rounded-xl border border-[#dfe5dc] bg-white p-4">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">原表假設</p><span className="rounded-full bg-[#eef1ed] px-2 py-1 text-[9px] text-[#66736c]">非市場共識</span></div>
        <p className="mt-2 text-[10px] text-[#8a948f]">Excel 快照價 {formatPrice(stock.fallbackPrice)} · 更新 {stock.forecastAsOf ?? '未提供'}</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {years.map((year) => (
            <div key={year} className="rounded-lg bg-[#f6f8f4] p-2">
              <p className="font-mono text-[9px] text-[#8a948f]">{year}E EPS</p>
              <p className="mt-1 font-mono text-xs font-semibold">{formatNumber(stock.eps[year])}</p>
              <p className={`mt-1 text-[9px] ${growthTone(stock.growth[year])}`}>YoY {growthLabel(stock.growth[year])}</p>
              <p className={`mt-0.5 text-[9px] ${growthTone(stock.revision[year])}`}>修正 {growthLabel(stock.revision[year])}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 text-[11px] leading-6 text-[#53605a]">
          <p>原表 PE：<strong className="font-mono text-[#17201d]">{formatNumber(stock.lowPe, 'x')}–{formatNumber(stock.highPe, 'x')}</strong></p>
          <p>原表參考價：<strong className="font-mono text-[#17201d]">{formatPrice(stock.referencePrice)}</strong></p>
          <p>原表快照價差：<strong className="font-mono text-[#17201d]">{formatPercent(stock.workbookUpsideSnapshot)}</strong></p>
          <p>現價重算價差：<strong className="font-mono text-[#17201d]">{formatPercent(stock.upside)}</strong></p>
        </div>
        {stock.note && <p className="mt-3 border-t border-[#edf0eb] pt-3 text-[10px] leading-5 text-[#7c8781]">備註：{stock.note}</p>}
      </section>

      <section className="rounded-xl border border-[#dfe5dc] bg-white p-4">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">官方實績</p><span className="rounded-full bg-[#e5f1eb] px-2 py-1 text-[9px] text-[#176444]">TWSE / TPEx / MOPS</span></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div><dt className="text-[#8a948f]">最新價</dt><dd className="mt-1 font-mono font-semibold">{formatPrice(stock.price)}</dd></div>
          <div><dt className="text-[#8a948f]">行情日期</dt><dd className="mt-1 font-mono">{stock.priceDate ?? 'Excel 快照'}</dd></div>
          <div><dt className="text-[#8a948f]">累計基本 EPS</dt><dd className="mt-1 font-mono font-semibold">{formatNumber(stock.actualEpsYtd)} <span className="text-[9px] font-normal text-[#8a948f]">{stock.actualEpsPeriod ?? ''}</span></dd></div>
          <div><dt className="text-[#8a948f]">簡單年化 EPS</dt><dd className="mt-1 font-mono">{formatNumber(stock.analysis.annualizedActualEps)}</dd></div>
          <div><dt className="text-[#8a948f]">官方近四季 PE</dt><dd className="mt-1 font-mono">{formatNumber(stock.officialTrailingPe, 'x')}</dd></div>
          <div><dt className="text-[#8a948f]">官方 P/B</dt><dd className="mt-1 font-mono">{formatNumber(stock.officialPriceToBook, 'x')}</dd></div>
          <div><dt className="text-[#8a948f]">殖利率</dt><dd className="mt-1 font-mono">{formatPercent(stock.officialDividendYield)}</dd></div>
          <div><dt className="text-[#8a948f]">估值日期</dt><dd className="mt-1 font-mono">{stock.officialValuationDate ?? '—'}</dd></div>
        </dl>
        <p className="mt-3 border-t border-[#edf0eb] pt-3 text-[10px] leading-5 text-[#7c8781]">官方 PE 是交易所依近四季資料計算，與本頁的 forward PE 定義不同。</p>
      </section>

      <section className="rounded-xl border border-[#cfdcd3] bg-[#173c32] p-4 text-white">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">Codex 規則型情境</p><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${adequacyTone(stock.analysis.dataAdequacy)}`}>資料充分度 {stock.analysis.dataAdequacy}</span></div>
        <p className="mt-2 text-[10px] text-[#a6bbb3]">非法人共識 · 非目標價 · {stock.analysis.methodologyVersion}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['2026', '2027', '2028'] as const).map((year) => (
            <div key={year} className="rounded-lg bg-white/8 p-2"><p className="font-mono text-[9px] text-[#9cb2aa]">{year}E</p><p className="mt-1 font-mono text-xs font-semibold">EPS {formatNumber(stock.analysis.eps[year])}</p><p className="mt-1 font-mono text-[9px] text-[#b8c9c2]">PE {formatNumber(stock.analysis.pe[year], 'x')}</p></div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-white/8 p-3 text-[11px] leading-6 text-[#d5e0dc]">
          <p>採用 PE：<strong className="font-mono text-white">{formatNumber(stock.analysis.peLow, 'x')} / {formatNumber(stock.analysis.peMid, 'x')} / {formatNumber(stock.analysis.peHigh, 'x')}</strong></p>
          <p>情境區間：<strong className="font-mono text-white">{formatPrice(stock.analysis.referencePriceLow)}–{formatPrice(stock.analysis.referencePriceHigh)}</strong></p>
          <p>相對中位數差距：<strong className="font-mono text-white">{formatPercent(stock.analysis.upside)}</strong></p>
          <p>同行樣本：<strong className="font-mono text-white">{stock.analysis.peerSampleSize}</strong> · {stock.analysis.peerScope}</p>
        </div>
        <p className="mt-3 text-[10px] leading-5 text-[#b3c4bd]">{stock.analysis.method}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{stock.analysis.caveats.map((item) => <span key={item} className="rounded-full bg-white/10 px-2 py-1 text-[9px] text-[#cfdbd6]">{item}</span>)}</div>
      </section>
    </div>
  );
}

function OverviewTable({ stocks, expanded, setExpanded }: { stocks: StockRecord[]; expanded: string | null; setExpanded: (code: string | null) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1520px] border-collapse text-left text-sm">
        <thead className="bg-[#f4f6f2] text-[10px] uppercase tracking-[0.05em] text-[#77817c]"><tr>
          {['股票', '市場／族群', '官方價／漲跌', '官方近四季 PE', '原表 PE 低／高', '依原表 EPS 2026 PE', '依原表 EPS 2027 PE', '原表參考價', '現價重算差距', '模型 PE 低／中／高', '模型情境區間', '相對模型中位數'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-[#e8ece6]">
          {stocks.map((stock) => (
            <Fragment key={stock.code}>
              <tr className="transition-colors hover:bg-[#f5f8f3]">
                <td className="px-4 py-3"><StockButton stock={stock} expanded={expanded === stock.code} onToggle={() => setExpanded(expanded === stock.code ? null : stock.code)} /></td>
                <td className="px-4 py-3"><div className="text-xs text-[#5e6b65]">{stock.market}</div><div className="mt-1 max-w-28 truncate text-[10px] text-[#929b96]">{stock.group ?? '未分類'}</div></td>
                <td className="px-4 py-3"><div className="font-mono font-semibold">{formatPrice(stock.price)}</div><div className={`mt-1 font-mono text-[10px] ${stock.changePct !== null && stock.changePct < 0 ? 'text-[#a13b35]' : 'text-[#176444]'}`}>{formatPercent(stock.changePct)} · {stock.priceDate ?? '快照'}</div></td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.officialTrailingPe, 'x')}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.lowPe, 'x')} / {formatNumber(stock.highPe, 'x')}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.pe['2026'], 'x')}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.pe['2027'], 'x')}</td>
                <td className="px-4 py-3"><div className="font-mono">{formatPrice(stock.referencePrice)}</div><div className="mt-1 text-[9px] text-[#929b96]">原表 {stock.referenceYear ? `${stock.referenceYear}E` : '—'}</div></td>
                <td className="px-4 py-3"><span className={`inline-flex min-w-[76px] justify-center rounded-full px-2.5 py-1.5 font-mono text-xs font-semibold ${opportunityTone(stock.upside)}`}>{formatPercent(stock.upside)}</span></td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.analysis.peLow, 'x')} / {formatNumber(stock.analysis.peMid, 'x')} / {formatNumber(stock.analysis.peHigh, 'x')}</td>
                <td className="px-4 py-3"><div className="font-mono">{formatPrice(stock.analysis.referencePriceLow)}–{formatPrice(stock.analysis.referencePriceHigh)}</div><div className="mt-1 text-[9px] text-[#929b96]">{stock.analysis.peerScope} n={stock.analysis.peerSampleSize}</div></td>
                <td className="px-4 py-3"><span className={`inline-flex min-w-[76px] justify-center rounded-full px-2.5 py-1.5 font-mono text-xs font-semibold ${opportunityTone(stock.analysis.upside)}`}>{formatPercent(stock.analysis.upside)}</span><span className={`ml-2 rounded-full px-2 py-1 text-[9px] ${adequacyTone(stock.analysis.dataAdequacy)}`}>{stock.analysis.dataAdequacy}</span></td>
              </tr>
              {expanded === stock.code && <tr><td colSpan={12} className="p-0"><DetailPanel stock={stock} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkbookTable({ stocks, expanded, setExpanded }: { stocks: StockRecord[]; expanded: string | null; setExpanded: (code: string | null) => void }) {
  const headers = ['A 族群', 'B 代碼', 'C 名稱', 'D 漲跌幅', 'E 股價', 'F 2028 PE', 'G 2027 PE', 'H 2026 PE', 'I 2025 PE', 'J PE低', 'K PE高', 'L 參考價', 'M 價差', 'N 備註', 'O 更新日', 'P 2028成長', 'Q 2028新', 'R 2028舊', 'S 2027成長', 'T 2027新', 'U 2027舊', 'V 2026成長', 'W 2026新', 'X 2026舊', 'Y 2025成長', 'Z 2025新', 'AA 2025舊', 'AB 2024 EPS'];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[3300px] border-collapse text-left text-xs">
        <thead className="sticky top-[65px] z-20 bg-[#f4f6f2] text-[9px] uppercase tracking-[0.04em] text-[#77817c]"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap border-b border-[#dfe5dc] px-3 py-3 font-semibold">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#e8ece6]">
          {stocks.map((stock) => (
            <Fragment key={stock.code}>
              <tr className="hover:bg-[#f5f8f3]">
                <td className="whitespace-nowrap px-3 py-3">{stock.group ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono">{stock.code}</td>
                <td className="px-3 py-3"><StockButton stock={stock} expanded={expanded === stock.code} onToggle={() => setExpanded(expanded === stock.code ? null : stock.code)} /></td>
                <td className="px-3 py-3 font-mono">{formatPercent(stock.fallbackChange ?? null)}</td>
                <td className="px-3 py-3 font-mono">{formatPrice(stock.fallbackPrice)}</td>
                {(['2028', '2027', '2026', '2025'] as const).map((year) => <td key={year} className="px-3 py-3 font-mono"><div>{formatNumber(stock.workbookPeSnapshot[year], 'x')}</div>{stock.workbookPeBasis[year] !== Number(year) && stock.workbookPeBasis[year] !== null && <div className="mt-1 text-[8px] text-[#929b96]">用 {stock.workbookPeBasis[year]}E</div>}</td>)}
                <td className="px-3 py-3 font-mono">{formatNumber(stock.lowPe, 'x')}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.highPe, 'x')}</td>
                <td className="px-3 py-3 font-mono">{formatPrice(stock.referencePrice)}</td><td className="px-3 py-3 font-mono">{formatPercent(stock.workbookUpsideSnapshot)}</td>
                <td className="max-w-56 px-3 py-3 text-[10px] leading-4 text-[#66736c]">{stock.note ?? '—'}</td><td className="whitespace-nowrap px-3 py-3 font-mono">{stock.forecastAsOf ?? '—'}</td>
                <td className={`px-3 py-3 font-mono ${growthTone(stock.growth['2028'])}`}>{growthLabel(stock.growth['2028'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.eps['2028'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.epsOld['2028'])}</td>
                <td className={`px-3 py-3 font-mono ${growthTone(stock.growth['2027'])}`}>{growthLabel(stock.growth['2027'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.eps['2027'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.epsOld['2027'])}</td>
                <td className={`px-3 py-3 font-mono ${growthTone(stock.growth['2026'])}`}>{growthLabel(stock.growth['2026'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.eps['2026'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.epsOld['2026'])}</td>
                <td className={`px-3 py-3 font-mono ${growthTone(stock.growth['2025'])}`}>{growthLabel(stock.growth['2025'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.eps['2025'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.epsOld['2025'])}</td><td className="px-3 py-3 font-mono">{formatNumber(stock.eps['2024'])}</td>
              </tr>
              {expanded === stock.code && <tr><td colSpan={28} className="p-0"><DetailPanel stock={stock} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisTable({ stocks, expanded, setExpanded }: { stocks: StockRecord[]; expanded: string | null; setExpanded: (code: string | null) => void }) {
  const headers = ['股票', '官方價／日期', '官方近四季 PE', '官方累計 EPS', '簡單年化 EPS', '原表 2026E', '模型 2026E', '原表 2027E', '模型 2027E', '模型 2028E', '模型 forward PE 26／27／28', '採用 PE 低／中／高', '情境值 低／中／高', '相對中位數差距', '同行／充分度'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[2100px] border-collapse text-left text-xs">
        <thead className="bg-[#f4f6f2] text-[9px] uppercase tracking-[0.04em] text-[#77817c]"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3 font-semibold">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#e8ece6]">
          {stocks.map((stock) => (
            <Fragment key={stock.code}>
              <tr className="hover:bg-[#f5f8f3]">
                <td className="px-4 py-3"><StockButton stock={stock} expanded={expanded === stock.code} onToggle={() => setExpanded(expanded === stock.code ? null : stock.code)} /></td>
                <td className="px-4 py-3"><div className="font-mono font-semibold">{formatPrice(stock.price)}</div><div className="mt-1 font-mono text-[9px] text-[#929b96]">{stock.priceDate ?? '快照'}</div></td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.officialTrailingPe, 'x')}</td><td className="px-4 py-3 font-mono">{formatNumber(stock.actualEpsYtd)} <span className="text-[9px] text-[#929b96]">{stock.actualEpsPeriod ?? ''}</span></td><td className="px-4 py-3 font-mono">{formatNumber(stock.analysis.annualizedActualEps)}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.eps['2026'])}</td><td className="px-4 py-3 font-mono font-semibold">{formatNumber(stock.analysis.eps['2026'])}</td><td className="px-4 py-3 font-mono">{formatNumber(stock.eps['2027'])}</td><td className="px-4 py-3 font-mono font-semibold">{formatNumber(stock.analysis.eps['2027'])}</td><td className="px-4 py-3 font-mono font-semibold">{formatNumber(stock.analysis.eps['2028'])}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.analysis.pe['2026'], 'x')} / {formatNumber(stock.analysis.pe['2027'], 'x')} / {formatNumber(stock.analysis.pe['2028'], 'x')}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(stock.analysis.peLow, 'x')} / {formatNumber(stock.analysis.peMid, 'x')} / {formatNumber(stock.analysis.peHigh, 'x')}</td>
                <td className="px-4 py-3 font-mono">{formatPrice(stock.analysis.referencePriceLow)} / {formatPrice(stock.analysis.referencePrice)} / {formatPrice(stock.analysis.referencePriceHigh)}</td>
                <td className="px-4 py-3"><span className={`inline-flex min-w-[76px] justify-center rounded-full px-2.5 py-1.5 font-mono text-xs font-semibold ${opportunityTone(stock.analysis.upside)}`}>{formatPercent(stock.analysis.upside)}</span></td>
                <td className="px-4 py-3"><div className="whitespace-nowrap text-[10px] text-[#66736c]">{stock.analysis.peerScope} n={stock.analysis.peerSampleSize}</div><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[9px] ${adequacyTone(stock.analysis.dataAdequacy)}`}>資料充分度 {stock.analysis.dataAdequacy}</span></td>
              </tr>
              {expanded === stock.code && <tr><td colSpan={15} className="p-0"><DetailPanel stock={stock} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StockDashboard({ initialData, dataUrl = '/api/stocks' }: { initialData: DashboardData; dataUrl?: string | null }) {
  const [data, setData] = useState(initialData);
  const [syncing, setSyncing] = useState(Boolean(dataUrl));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState<'all' | '上市' | '上櫃'>('all');
  const [signal, setSignal] = useState<SignalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('analysisUpside');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [view, setView] = useState<ViewMode>('overview');
  const [limit, setLimit] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);

  const syncOfficialData = useCallback(async () => {
    if (!dataUrl) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch(dataUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next: DashboardData = await response.json();
      if (!Array.isArray(next.stocks) || !next.stocks.length || !next.stocks[0]?.analysis) throw new Error('資料格式不符');
      setData(next);
    } catch {
      setSyncError('更新檔暫時無法載入，畫面仍使用最近一次內建快照。');
    } finally {
      setSyncing(false);
    }
  }, [dataUrl]);

  useEffect(() => {
    if (!dataUrl) return;
    let active = true;
    fetch(dataUrl, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DashboardData>;
      })
      .then((next) => {
        if (!Array.isArray(next.stocks) || !next.stocks.length || !next.stocks[0]?.analysis) throw new Error('資料格式不符');
        if (active) setData(next);
      })
      .catch(() => { if (active) setSyncError('更新檔暫時無法載入，畫面仍使用最近一次內建快照。'); })
      .finally(() => { if (active) setSyncing(false); });
    return () => { active = false; };
  }, [dataUrl]);

  const stats = useMemo(() => {
    const modelDiffs = data.stocks.map((stock) => stock.analysis.upside).filter((value): value is number => value !== null);
    return {
      total: data.stocks.length,
      positive: modelDiffs.filter((value) => value > 0).length,
      medianUpside: median(modelDiffs),
      officialPe: data.stocks.filter((stock) => stock.officialTrailingPe !== null).length,
      adequate: data.stocks.filter((stock) => stock.analysis.dataAdequacy !== '低').length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('zh-TW');
    const rows = data.stocks.filter((stock) => {
      if (market !== 'all' && stock.market !== market) return false;
      if (normalizedSearch && !`${stock.code} ${stock.name} ${stock.group ?? ''}`.toLocaleLowerCase('zh-TW').includes(normalizedSearch)) return false;
      if (signal === 'opportunity' && !(stock.analysis.upside !== null && stock.analysis.upside >= 0.2)) return false;
      if (signal === 'balanced' && stock.analysis.dataAdequacy === '低') return false;
      if (signal === 'risk' && !((stock.analysis.upside !== null && stock.analysis.upside <= -0.2) || (stock.analysis.pe['2027'] !== null && stock.analysis.pe['2027'] >= 40))) return false;
      if (signal === 'issues' && !stock.quality.length && stock.analysis.dataAdequacy !== '低') return false;
      return true;
    });
    return rows.sort((a, b) => {
      const left = stockSortValue(a, sortKey);
      const right = stockSortValue(b, sortKey);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const result = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right, 'zh-Hant') : Number(left) - Number(right);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, market, search, signal, sortDirection, sortKey]);

  const visible = filtered.slice(0, limit);
  const changeSort = (key: SortKey) => { setSortKey(key); setSortDirection((current) => key === sortKey ? (current === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc'); };

  return (
    <main className="min-h-screen bg-[#f3f5f1] text-[#17201d]">
      <header className="sticky top-0 z-40 border-b border-[#dfe4dc] bg-[#f8faf6]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#173c32] text-sm font-bold text-[#d8ff6b]">TW</div><div><p className="text-sm font-bold tracking-[-0.01em]">台股估值雷達</p><p className="text-[10px] text-[#6d7772]">Excel × TWSE × TPEx × MOPS</p></div></div>
          <button type="button" onClick={() => void syncOfficialData()} disabled={syncing || !dataUrl} className="flex items-center gap-2 rounded-full border border-[#d8ded6] bg-white px-3 py-2 text-xs font-medium text-[#46544e] shadow-sm transition hover:border-[#b9c7be] disabled:cursor-wait disabled:opacity-65"><span className={`h-2 w-2 rounded-full ${syncing ? 'animate-pulse bg-[#e2a43a]' : data.officialQuoteCount ? 'bg-[#43ad77]' : 'bg-[#e2a43a]'}`} />{syncing ? '載入更新檔…' : data.officialQuoteCount ? `官方行情 ${data.officialQuoteCount}/${data.stocks.length}` : '載入官方資料'}</button>
        </div>
      </header>

      <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(500px,.75fr)]">
          <div className="flex flex-col justify-center rounded-2xl border border-[#dde3db] bg-[#fafbf8] p-5 shadow-[0_10px_40px_rgba(23,32,29,.035)] sm:p-7">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.17em] text-[#648075]">Three-layer valuation workbook</p>
            <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">原表、官方實績與模型情境，分欄看清楚。</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#68736e]">完整保留 Excel A–AB 欄位與快照公式；官方行情、累計 EPS、近四季 PE 另列；Codex 規則型情境明確標示為非法人共識、非目標價。</p>
          </div>
          <SourceStatusPanel data={data} />
        </section>

        {syncError && <div className="mt-4 rounded-xl border border-[#edcf9a] bg-[#fff5df] px-4 py-3 text-xs text-[#7e5419]">{syncError}</div>}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['追蹤股票', compactNumber.format(stats.total), `上市 ${data.stocks.filter((stock) => stock.market === '上市').length} · 上櫃 ${data.stocks.filter((stock) => stock.market === '上櫃').length}`],
            ['官方 PE 覆蓋', `${stats.officialPe}/${stats.total}`, '交易所近四季口徑'],
            ['模型中位數差距', formatPercent(stats.medianUpside), `${stats.positive} 檔高於現價`],
            ['資料充分度中／高', `${stats.adequate}/${stats.total}`, '不是投資信心評分'],
          ].map(([label, value, note]) => <article key={label} className="rounded-2xl border border-[#dfe4dc] bg-[#fbfcf9] p-4 shadow-[0_8px_30px_rgba(23,32,29,.035)] sm:p-5"><p className="text-xs font-medium text-[#77817c]">{label}</p><p className="mt-3 font-mono text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{value}</p><p className="mt-2 text-[11px] text-[#8a938e]">{note}</p></article>)}
        </section>

        <section className="mt-5 rounded-2xl border border-[#dce2da] bg-[#fbfcf9] shadow-[0_14px_50px_rgba(23,32,29,.045)]">
          <div className="border-b border-[#e1e6df] p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold tracking-[-0.02em]">估值清單</h2><span className="rounded-full bg-[#edf2ea] px-2 py-1 font-mono text-[10px] text-[#5f6d66]">{filtered.length} 檔</span></div><p className="mt-1 text-xs text-[#7b8580]">點股票可展開三層資料與完整方法說明</p></div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <label className="relative min-w-0 sm:w-64"><span className="sr-only">搜尋股票</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋代碼、名稱或族群" className="h-10 w-full rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none transition placeholder:text-[#9ba39f] focus:border-[#739285] focus:ring-2 focus:ring-[#d9e6df]" /></label>
                <select value={market} onChange={(event) => setMarket(event.target.value as typeof market)} aria-label="市場" className="h-10 rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none focus:border-[#739285]"><option value="all">全部市場</option><option value="上市">上市</option><option value="上櫃">上櫃</option></select>
                <select value={signal} onChange={(event) => setSignal(event.target.value as SignalFilter)} aria-label="模型訊號" className="h-10 rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none focus:border-[#739285]"><option value="all">全部訊號</option><option value="opportunity">模型中位數差距 ≥ 20%</option><option value="balanced">資料充分度中／高</option><option value="risk">高估值／負差距</option><option value="issues">資料待確認</option></select>
                <select value={sortKey} onChange={(event) => changeSort(event.target.value as SortKey)} aria-label="排序" className="h-10 rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none focus:border-[#739285]"><option value="analysisUpside">模型差距</option><option value="name">名稱</option><option value="price">股價</option><option value="pe2026">原表 2026 PE</option><option value="growth2026">2026 EPS 成長</option><option value="forecastAge">資料日期</option></select>
              </div>
            </div>
            <div className="mt-4 inline-flex rounded-xl border border-[#dce2da] bg-[#f3f6f1] p-1">
              {([['overview', '估值總覽'], ['workbook', 'Excel 完整欄位 A–AB'], ['analysis', '官方＋分析預測']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`rounded-lg px-3 py-2 text-[11px] font-medium transition ${view === key ? 'bg-[#173c32] text-white shadow-sm' : 'text-[#64716b] hover:text-[#173c32]'}`}>{label}</button>)}
            </div>
          </div>

          {view === 'overview' && <OverviewTable stocks={visible} expanded={expanded} setExpanded={setExpanded} />}
          {view === 'workbook' && <WorkbookTable stocks={visible} expanded={expanded} setExpanded={setExpanded} />}
          {view === 'analysis' && <AnalysisTable stocks={visible} expanded={expanded} setExpanded={setExpanded} />}
          {!filtered.length && <div className="px-5 py-16 text-center text-sm text-[#7a8580]">沒有符合目前條件的股票。</div>}
          {filtered.length > limit && <div className="border-t border-[#e2e7e0] p-4 text-center"><button type="button" onClick={() => setLimit((value) => value + 30)} className="rounded-xl border border-[#d5ddd4] bg-white px-5 py-2.5 text-xs font-medium text-[#46544e] transition hover:border-[#9eb0a4]">再顯示 {Math.min(30, filtered.length - limit)} 檔</button></div>}
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#dfe4dc] bg-[#fafbf8] p-4"><p className="text-xs font-semibold">Excel 原表</p><p className="mt-2 text-[11px] leading-5 text-[#77817c]">保留低／高 PE、新舊 EPS、成長率、更新日與原表 fallback 公式；快照價不冒充即時價。</p></div>
          <div className="rounded-2xl border border-[#dfe4dc] bg-[#fafbf8] p-4"><p className="text-xs font-semibold">官方資料</p><p className="mt-2 text-[11px] leading-5 text-[#77817c]">行情、公告累計 EPS 與交易所近四季 PE 分別標示。官方近四季 PE 不等於 forward PE。</p></div>
          <div className="rounded-2xl border border-[#dfe4dc] bg-[#fafbf8] p-4"><p className="text-xs font-semibold">規則型情境</p><p className="mt-2 text-[11px] leading-5 text-[#77817c]">模型只用原表、官方實績與同行分布產生可稽核情境；沒有授權資料時不冒稱法人共識。</p></div>
        </section>

        <footer className="mt-8 border-t border-[#dbe1d9] py-6 text-[10px] leading-5 text-[#7f8984]">
          <div className="mb-3 flex flex-wrap gap-3"><a className="font-medium text-[#294b3f] underline decoration-[#b5c2bb] underline-offset-2" href="ai-reports/">歷史 AI 產業報告</a><a className="font-medium text-[#294b3f] underline decoration-[#b5c2bb] underline-offset-2" href="legacy-home.html">部署前舊首頁</a></div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><p>資料來源：<a className="underline decoration-[#b5c2bb] underline-offset-2 hover:text-[#294b3f]" href="https://openapi.twse.com.tw/" target="_blank" rel="noreferrer">臺灣證券交易所</a>、<a className="underline decoration-[#b5c2bb] underline-offset-2 hover:text-[#294b3f]" href="https://www.tpex.org.tw/openapi/" target="_blank" rel="noreferrer">證券櫃檯買賣中心</a>、公開資訊觀測站與原始工作簿。</p><p className="max-w-xl lg:text-right">本網站為資料整理與情境比較工具，不構成投資建議。負 EPS、轉盈／轉虧或缺值時不計算 PE；資料充分度不是投資評等。</p></div>
        </footer>
      </div>
    </main>
  );
}
