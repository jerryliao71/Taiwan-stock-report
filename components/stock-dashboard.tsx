'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardData, GrowthMetric, StockRecord } from '@/lib/types';

type SignalFilter = 'all' | 'opportunity' | 'balanced' | 'risk' | 'issues';
type SortKey = 'name' | 'price' | 'changePct' | 'pe2026' | 'growth2026' | 'referencePrice' | 'upside' | 'forecastAge';
type SortDirection = 'asc' | 'desc';

const compactNumber = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
const priceNumber = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const percentNumber = new Intl.NumberFormat('zh-TW', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

function formatNumber(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${compactNumber.format(value)}${suffix}`;
}

function formatPrice(value: number | null): string {
  return value === null ? '—' : priceNumber.format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : percentNumber.format(value);
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
    case 'upside': return stock.upside;
    case 'forecastAge': return stock.forecastAgeDays;
  }
}

function opportunityTone(value: number | null): string {
  if (value === null) return 'bg-[#edf0ec] text-[#6f7974]';
  if (value >= 0.2) return 'bg-[#dff3e6] text-[#176444]';
  if (value <= -0.2) return 'bg-[#f8e3e0] text-[#9b3732]';
  return 'bg-[#eef1ed] text-[#53605a]';
}

function sourceDot(ok: boolean): string {
  return ok ? 'bg-[#47b77f]' : 'bg-[#e2a43a]';
}

function isBalanced(stock: StockRecord): boolean {
  const growth2026 = stock.growth['2026'];
  const growth2027 = stock.growth['2027'];
  return stock.upside !== null && stock.upside >= 0.2
    && stock.pe['2026'] !== null && stock.pe['2026'] <= 30
    && stock.pe['2027'] !== null && stock.pe['2027'] <= 25
    && growth2026.kind === 'percent' && (growth2026.value ?? -1) >= 0.2
    && growth2027.kind === 'percent' && (growth2027.value ?? -1) >= 0
    && stock.forecastAgeDays !== null && stock.forecastAgeDays <= 90;
}

function SourceStatusPanel({ data }: { data: DashboardData }) {
  const quoteSources = data.sources.filter((source) => source.id.endsWith('Quotes'));
  const latestDate = quoteSources.map((source) => source.date).filter(Boolean).sort().at(-1) ?? null;

  return (
    <aside className="rounded-2xl border border-[#dbe2d9] bg-[#173c32] p-5 text-white shadow-[0_20px_50px_rgba(23,60,50,.12)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-medium text-[#a6bbb3]">官方資料同步</p>
          <p className="mt-2 text-xl font-semibold">{data.officialQuoteCount ? `${data.officialQuoteCount} / ${data.stocks.length} 檔` : '等待首次同步'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${data.officialQuoteCount ? 'bg-[#d8ff6b] text-[#173c32]' : 'bg-white/10 text-[#cad8d2]'}`}>
          {data.officialQuoteCount ? 'OFFICIAL' : 'BASELINE'}
        </span>
      </div>
      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        {data.sources.map((source) => (
          <div key={source.id} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="flex items-center gap-2 text-[#c2d0ca]"><i className={`h-1.5 w-1.5 rounded-full ${sourceDot(source.ok)}`} />{source.label}</span>
            <span className="font-mono text-[#91a9a0]">{source.date ?? (source.ok ? '已連線' : '待同步')}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-[#8fa69d]">最新行情日期 {latestDate ?? '—'} · 資料日期以官方回傳為準</p>
    </aside>
  );
}

function DetailPanel({ stock }: { stock: StockRecord }) {
  const years = ['2024', '2025', '2026', '2027', '2028'] as const;
  return (
    <div className="grid gap-5 bg-[#f4f7f2] p-5 lg:grid-cols-[1.3fr_1fr_1fr]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#738079]">EPS 路徑</p>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {years.map((year) => (
            <div key={year} className="rounded-xl border border-[#dfe5dc] bg-white p-3">
              <p className="font-mono text-[10px] text-[#8a948f]">{year}{year === '2024' ? 'A' : 'E'}</p>
              <p className="mt-2 font-mono text-sm font-semibold">{formatNumber(stock.eps[year])}</p>
              {year !== '2024' && <p className={`mt-1 text-[10px] ${growthTone(stock.growth[year])}`}>{growthLabel(stock.growth[year])}</p>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[#7c8781]">財測日期：{stock.forecastAsOf ?? '未提供'}。2025–2028 為工作簿假設，不代表官方或即時法人共識。</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#738079]">估值公式</p>
        <div className="mt-3 rounded-xl border border-[#dfe5dc] bg-white p-4 text-xs leading-6 text-[#53605a]">
          <p><strong className="text-[#17201d]">基準年：</strong>{stock.referenceYear ? `${stock.referenceYear}E` : '無法判定'}</p>
          <p><strong className="text-[#17201d]">PE 區間：</strong>{formatNumber(stock.lowPe, 'x')} – {formatNumber(stock.highPe, 'x')}</p>
          <p><strong className="text-[#17201d]">計算：</strong>基準 EPS × PE 中點</p>
          <p><strong className="text-[#17201d]">參考價：</strong>{formatPrice(stock.referencePrice)}</p>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#738079]">資料稽核</p>
        <div className="mt-3 rounded-xl border border-[#dfe5dc] bg-white p-4">
          <p className="text-xs text-[#53605a]">公告 EPS：<strong className="font-mono text-[#17201d]">{formatNumber(stock.actualEpsYtd)}</strong> <span className="text-[10px] text-[#8a948f]">{stock.actualEpsPeriod ?? '尚未同步'}</span></p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stock.quality.length ? stock.quality.map((issue) => <span key={issue} className="rounded-full bg-[#fff0ce] px-2 py-1 text-[10px] font-medium text-[#805315]">{issue}</span>) : <span className="rounded-full bg-[#dff3e6] px-2 py-1 text-[10px] font-medium text-[#176444]">資料完整</span>}
          </div>
          {stock.note && <p className="mt-3 text-[11px] text-[#7c8781]">備註：{stock.note}</p>}
        </div>
      </div>
    </div>
  );
}

export default function StockDashboard({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState<'all' | '上市' | '上櫃'>('all');
  const [signal, setSignal] = useState<SignalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('upside');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [limit, setLimit] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);

  const syncOfficialData = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch('/api/stocks', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next: DashboardData = await response.json();
      if (!Array.isArray(next.stocks) || !next.stocks.length) throw new Error('官方資料格式不符');
      setData(next);
    } catch {
      setSyncError('官方來源暫時無法同步，畫面仍使用工作簿快照。');
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => { void syncOfficialData(); }, [syncOfficialData]);
  useEffect(() => { setLimit(30); setExpanded(null); }, [search, market, signal]);

  const stats = useMemo(() => {
    const validUpside = data.stocks.map((stock) => stock.upside).filter((value): value is number => value !== null);
    return {
      total: data.stocks.length,
      positive: validUpside.filter((value) => value > 0).length,
      medianUpside: median(validUpside),
      fresh: data.stocks.filter((stock) => stock.forecastAgeDays !== null && stock.forecastAgeDays <= 90).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('zh-TW');
    const rows = data.stocks.filter((stock) => {
      if (market !== 'all' && stock.market !== market) return false;
      if (normalizedSearch && !`${stock.code} ${stock.name} ${stock.group ?? ''}`.toLocaleLowerCase('zh-TW').includes(normalizedSearch)) return false;
      if (signal === 'opportunity' && !(stock.upside !== null && stock.upside >= 0.2)) return false;
      if (signal === 'balanced' && !isBalanced(stock)) return false;
      if (signal === 'risk' && !((stock.upside !== null && stock.upside <= -0.2) || (stock.pe['2026'] !== null && stock.pe['2026'] >= 40))) return false;
      if (signal === 'issues' && !stock.quality.length) return false;
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

  const updateSort = (next: SortKey) => {
    if (next === sortKey) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortKey(next); setSortDirection(next === 'name' ? 'asc' : 'desc'); }
  };

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '';
  const visible = filtered.slice(0, limit);

  return (
    <main className="min-h-screen bg-[#f3f5f1] text-[#17201d]">
      <header className="sticky top-0 z-40 border-b border-[#dfe4dc] bg-[#f8faf6]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#173c32] text-sm font-bold text-[#d8ff6b]">TW</div>
            <div><p className="text-sm font-bold tracking-[-0.01em]">台股估值雷達</p><p className="text-[10px] text-[#6d7772]">TWSE · TPEx · MOPS</p></div>
          </div>
          <button type="button" onClick={() => void syncOfficialData()} disabled={syncing} className="flex items-center gap-2 rounded-full border border-[#d8ded6] bg-white px-3 py-2 text-xs font-medium text-[#46544e] shadow-sm transition hover:border-[#b9c7be] disabled:cursor-wait disabled:opacity-65">
            <span className={`h-2 w-2 rounded-full ${syncing ? 'animate-pulse bg-[#e2a43a]' : data.officialQuoteCount ? 'bg-[#43ad77]' : 'bg-[#e2a43a]'}`} />
            {syncing ? '同步官方資料…' : data.officialQuoteCount ? `官方行情 ${data.officialQuoteCount}/${data.stocks.length}` : '同步官方行情'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(330px,.4fr)]">
          <div className="flex flex-col justify-center rounded-2xl border border-[#dde3db] bg-[#fafbf8] p-5 shadow-[0_10px_40px_rgba(23,32,29,.035)] sm:p-7">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.17em] text-[#648075]">Taiwan equity intelligence</p>
            <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">每天更新價格，讓估值假設不再停在試算表。</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#68736e]">行情與公告 EPS 取自官方來源；2025–2028 財測沿用原工作簿並保留日期。每一檔股票都重新計算實際年度 PE、參考價與價差。</p>
          </div>
          <SourceStatusPanel data={data} />
        </section>

        {syncError && <div className="mt-4 rounded-xl border border-[#edcf9a] bg-[#fff5df] px-4 py-3 text-xs text-[#7e5419]">{syncError}</div>}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['追蹤股票', compactNumber.format(stats.total), `上市 ${data.stocks.filter((stock) => stock.market === '上市').length} · 上櫃 ${data.stocks.filter((stock) => stock.market === '上櫃').length}`],
            ['模型上行', compactNumber.format(stats.positive), `有效樣本 ${data.stocks.filter((stock) => stock.upside !== null).length} 檔`],
            ['價差中位數', formatPercent(stats.medianUpside), '依更新後股價重算'],
            ['90 天內財測', `${((stats.fresh / stats.total) * 100).toFixed(1)}%`, `${stats.fresh} / ${stats.total} 檔`],
          ].map(([label, value, note]) => (
            <article key={label} className="rounded-2xl border border-[#dfe4dc] bg-[#fbfcf9] p-4 shadow-[0_8px_30px_rgba(23,32,29,.035)] sm:p-5">
              <p className="text-xs font-medium text-[#77817c]">{label}</p>
              <p className="mt-3 font-mono text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{value}</p>
              <p className="mt-2 text-[11px] text-[#8a938e]">{note}</p>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-[#dce2da] bg-[#fbfcf9] shadow-[0_14px_50px_rgba(23,32,29,.045)]">
          <div className="border-b border-[#e1e6df] p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex items-center gap-2"><h2 className="text-lg font-semibold tracking-[-0.02em]">估值清單</h2><span className="rounded-full bg-[#edf2ea] px-2 py-1 font-mono text-[10px] text-[#5f6d66]">{filtered.length} 檔</span></div>
                <p className="mt-1 text-xs text-[#7b8580]">點選股票可查看 EPS 路徑、估值基準與資料警示</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <label className="relative min-w-0 sm:w-64"><span className="sr-only">搜尋股票</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋代碼、名稱或族群" className="h-10 w-full rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none transition placeholder:text-[#9ba39f] focus:border-[#739285] focus:ring-2 focus:ring-[#d9e6df]" /></label>
                <select value={market} onChange={(event) => setMarket(event.target.value as typeof market)} aria-label="市場" className="h-10 rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none focus:border-[#739285]"><option value="all">全部市場</option><option value="上市">上市</option><option value="上櫃">上櫃</option></select>
                <select value={signal} onChange={(event) => setSignal(event.target.value as SignalFilter)} aria-label="模型訊號" className="h-10 rounded-xl border border-[#dce2da] bg-white px-3 text-xs outline-none focus:border-[#739285]"><option value="all">全部訊號</option><option value="opportunity">價差 ≥ 20%</option><option value="balanced">資料完整且估值平衡</option><option value="risk">高估值／下行</option><option value="issues">資料待確認</option></select>
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
              <thead className="bg-[#f4f6f2] text-[10px] uppercase tracking-[0.065em] text-[#77817c]">
                <tr>
                  <th className="px-4 py-3"><button onClick={() => updateSort('name')} className="font-semibold">股票{sortIndicator('name')}</button></th>
                  <th className="px-4 py-3 font-semibold">市場／族群</th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('price')} className="font-semibold">股價{sortIndicator('price')}</button></th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('changePct')} className="font-semibold">漲跌{sortIndicator('changePct')}</button></th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('pe2026')} className="font-semibold">2026 PE{sortIndicator('pe2026')}</button></th>
                  <th className="px-4 py-3 font-semibold">2027 PE</th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('growth2026')} className="font-semibold">EPS 26/27{sortIndicator('growth2026')}</button></th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('referencePrice')} className="font-semibold">參考價{sortIndicator('referencePrice')}</button></th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('upside')} className="font-semibold">模型價差{sortIndicator('upside')}</button></th>
                  <th className="px-4 py-3"><button onClick={() => updateSort('forecastAge')} className="font-semibold">資料狀態{sortIndicator('forecastAge')}</button></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ece6]">
                {visible.map((stock) => (
                  <Fragment key={stock.code}>
                    <tr className="transition-colors hover:bg-[#f5f8f3]">
                      <td className="px-4 py-3"><button type="button" onClick={() => setExpanded(expanded === stock.code ? null : stock.code)} aria-expanded={expanded === stock.code} className="text-left"><div className="font-semibold">{stock.name}</div><div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-[#8a938e]"><span>{stock.code}</span><span>{expanded === stock.code ? '收合 −' : '詳情 +'}</span></div></button></td>
                      <td className="px-4 py-3"><div className="text-xs text-[#5e6b65]">{stock.market}</div><div className="mt-1 max-w-24 truncate text-[10px] text-[#929b96]">{stock.group ?? '未分類'}</div></td>
                      <td className="px-4 py-3"><div className="font-mono font-semibold">{formatPrice(stock.price)}</div><div className="mt-1 text-[10px] text-[#929b96]">{stock.priceSource} · {stock.priceDate ?? '快照'}</div></td>
                      <td className={`px-4 py-3 font-mono text-xs ${stock.changePct !== null && stock.changePct < 0 ? 'text-[#a13b35]' : 'text-[#176444]'}`}>{formatPercent(stock.changePct)}</td>
                      <td className="px-4 py-3 font-mono">{formatNumber(stock.pe['2026'], 'x')}</td>
                      <td className="px-4 py-3 font-mono">{formatNumber(stock.pe['2027'], 'x')}</td>
                      <td className="px-4 py-3"><div className={`font-mono text-xs ${growthTone(stock.growth['2026'])}`}>{growthLabel(stock.growth['2026'])}</div><div className={`mt-1 font-mono text-[10px] ${growthTone(stock.growth['2027'])}`}>{growthLabel(stock.growth['2027'])}</div></td>
                      <td className="px-4 py-3"><div className="font-mono">{formatPrice(stock.referencePrice)}</div><div className="mt-1 text-[10px] text-[#929b96]">{stock.referenceYear ? `${stock.referenceYear}E` : '—'}</div></td>
                      <td className="px-4 py-3"><span className={`inline-flex min-w-[76px] justify-center rounded-full px-2.5 py-1.5 font-mono text-xs font-semibold ${opportunityTone(stock.upside)}`}>{formatPercent(stock.upside)}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2 text-[10px]"><span className={`h-1.5 w-1.5 rounded-full ${stock.quality.length ? 'bg-[#e2a43a]' : 'bg-[#47b77f]'}`} /><span className="text-[#66736c]">{stock.quality.length ? stock.quality[0] : '完整'}</span></div><div className="mt-1 font-mono text-[10px] text-[#949c98]">{stock.forecastAgeDays === null ? '無日期' : `${stock.forecastAgeDays} 天`}</div></td>
                    </tr>
                    {expanded === stock.code && <tr><td colSpan={10} className="p-0"><DetailPanel stock={stock} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#e5eae3] lg:hidden">
            {visible.map((stock) => (
              <article key={stock.code} className="p-4">
                <button type="button" onClick={() => setExpanded(expanded === stock.code ? null : stock.code)} className="w-full text-left" aria-expanded={expanded === stock.code}>
                  <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{stock.name} <span className="ml-1 font-mono text-[10px] font-normal text-[#909994]">{stock.code}</span></p><p className="mt-1 text-[10px] text-[#87918c]">{stock.market} · {stock.group ?? '未分類'} · {stock.priceSource}</p></div><span className={`rounded-full px-2.5 py-1.5 font-mono text-xs font-semibold ${opportunityTone(stock.upside)}`}>{formatPercent(stock.upside)}</span></div>
                  <div className="mt-4 grid grid-cols-4 gap-2"><div><p className="text-[9px] uppercase text-[#929b96]">股價</p><p className="mt-1 font-mono text-xs font-semibold">{formatPrice(stock.price)}</p></div><div><p className="text-[9px] uppercase text-[#929b96]">26 PE</p><p className="mt-1 font-mono text-xs">{formatNumber(stock.pe['2026'], 'x')}</p></div><div><p className="text-[9px] uppercase text-[#929b96]">EPS 26</p><p className={`mt-1 font-mono text-xs ${growthTone(stock.growth['2026'])}`}>{growthLabel(stock.growth['2026'])}</p></div><div><p className="text-[9px] uppercase text-[#929b96]">參考價</p><p className="mt-1 font-mono text-xs">{formatPrice(stock.referencePrice)}</p></div></div>
                </button>
                {expanded === stock.code && <div className="mt-4 -mx-4 -mb-4"><DetailPanel stock={stock} /></div>}
              </article>
            ))}
          </div>

          {!filtered.length && <div className="px-5 py-16 text-center text-sm text-[#7a8580]">沒有符合目前條件的股票。</div>}
          {filtered.length > limit && <div className="border-t border-[#e2e7e0] p-4 text-center"><button type="button" onClick={() => setLimit((value) => value + 30)} className="rounded-xl border border-[#d5ddd4] bg-white px-5 py-2.5 text-xs font-medium text-[#46544e] transition hover:border-[#9eb0a4]">再顯示 {Math.min(30, filtered.length - limit)} 檔</button></div>}
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#dfe4dc] bg-[#fafbf8] p-4"><p className="text-xs font-semibold">官方行情</p><p className="mt-2 text-[11px] leading-5 text-[#77817c]">上市取自 TWSE、上櫃取自 TPEx 每日收盤 OpenAPI；網站後端代理並保留官方資料日期。</p></div>
          <div className="rounded-2xl border border-[#dfe4dc] bg-[#fafbf8] p-4"><p className="text-xs font-semibold">公告 EPS</p><p className="mt-2 text-[11px] leading-5 text-[#77817c]">MOPS 端點提供最新季累計實績；不等同單季 EPS，也不等同未來法人預估。</p></div>
          <div className="rounded-2xl border border-[#dfe4dc] bg-[#fafbf8] p-4"><p className="text-xs font-semibold">財測假設</p><p className="mt-2 text-[11px] leading-5 text-[#77817c]">2025–2028 EPS 與 PE 區間源自工作簿。未來若取得 TEJ、CMoney、FactSet 或 LSEG 授權，可替換此資料層。</p></div>
        </section>

        <footer className="mt-8 border-t border-[#dbe1d9] py-6 text-[10px] leading-5 text-[#7f8984]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <p>資料來源：<a className="underline decoration-[#b5c2bb] underline-offset-2 hover:text-[#294b3f]" href="https://openapi.twse.com.tw/" target="_blank" rel="noreferrer">臺灣證券交易所</a>、<a className="underline decoration-[#b5c2bb] underline-offset-2 hover:text-[#294b3f]" href="https://www.tpex.org.tw/openapi/" target="_blank" rel="noreferrer">證券櫃檯買賣中心</a>、公開資訊觀測站。官方資料與網站衍生計算分開標示。</p>
            <p className="max-w-xl lg:text-right">本網站為研究工具，不構成投資建議。參考價＝可用年度 EPS × PE 區間中點；缺值不再以 −100% 代替，負轉正則標示為「轉盈」。</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
