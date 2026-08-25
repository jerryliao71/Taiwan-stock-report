# -*- coding: utf-8 -*-
"""Fetch official data, run the valuation model, render the static page.

Output: valuation/dist/index.html (self-contained, no runtime network calls).
Run from anywhere:  python3 valuation/pipeline/build.py
"""
import json, re, sys
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_official
from model import build as run_model

ROOT = Path(__file__).resolve().parents[1]
TPE = timezone(timedelta(hours=8))


CANONICAL = 'https://jerryliao71.github.io/Taiwan-stock-report/'
DESCRIPTION = ('125 檔台股的財測本益比評價：股價與官方實績每個交易日自證交所、櫃買中心、'
               '公開資訊觀測站更新，合理本益比以規則式模型推導並逐檔列出假設。')


def wrap_document(body):
    """Wrap the templates into a standalone HTML document.

    The templates are fragments -- they carry <title>, the font <link>s and their
    <style> blocks inline, because they were first written for a host that supplied
    the <head>. Served directly from Pages there is no such host, and a page with no
    charset renders as mojibake and with no viewport does not scale on phones. Hoist
    the head-only elements out of the fragment and emit a real document around it.
    """
    head_parts = []

    def take(pattern):
        nonlocal body
        for m in re.findall(pattern, body, flags=re.S | re.I):
            head_parts.append(m)
        body = re.sub(pattern, '', body, flags=re.S | re.I)

    take(r'<title>.*?</title>')
    take(r'<link\b[^>]*>')
    take(r'<style\b[^>]*>.*?</style>')

    head = '\n'.join(head_parts)
    return (
        '<!doctype html>\n<html lang="zh-Hant">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<meta name="description" content="{DESCRIPTION}">\n'
        '<meta name="color-scheme" content="light dark">\n'
        f'<link rel="canonical" href="{CANONICAL}">\n'
        '<meta property="og:type" content="website">\n'
        '<meta property="og:locale" content="zh_TW">\n'
        '<meta property="og:title" content="台股財測評價台">\n'
        f'<meta property="og:description" content="{DESCRIPTION}">\n'
        f'<meta property="og:url" content="{CANONICAL}">\n'
        f'{head}\n</head>\n<body>\n{body.strip()}\n</body>\n</html>\n'
    )


def pctf(x, d=0):
    return '—' if x is None else f'{x*100:.{d}f}%'


def describe(recs, K):
    for r in recs:
        if r.get('contradicted'):
            a = r['act']
            r['why'] = (f"官方財報顯示 {a['year']} 年累計至 Q{a['quarter']} 的實際 EPS 為 "
                        f"{a['eps_cum']:.2f} 元，公司仍在虧損，但原表同年度財測為 {a['forecast']:.2f} 元。"
                        '整套評價建立在財測正確的前提上，此前提已被官方實績推翻，'
                        '因此模型不給出合理本益比與目標價。請先更新財測再重新評價。')
        elif r['suspect']:
            r['why'] = ('原表財測在數量級上出現異常，模型不對本檔推導合理本益比，也不給出目標價。'
                        '下方 EPS 序列為原表數值，請先回原始資料源核對後再行評價。')
        elif r['base_eps'] is None:
            r['why'] = '原表未填任何年度 EPS 財測，缺少定價基礎。'
        else:
            bits = [f"產業基準 {r['anchor']}x（{r['sector']}）"]
            bits.append(f"加權成長 {pctf(r['g_blend'])}→可持續成長採 {pctf(r['g_sus'])}，成長係數 {r['gf']:.2f}"
                        if r['g_blend'] is not None else '無成長資料，成長係數採中性')
            if r['revision'] is not None and abs(r['revision']) > 0.03:
                bits.append(f"財測{'上修' if r['revision']>0 else '下修'} {pctf(abs(r['revision']))}，修正係數 {r['rf']:.2f}")
            if r['qnotes']:
                bits.append(f"品質調整 {r['qf']:.2f}（{'、'.join(r['qnotes'])}）")
            if r['pe_now']:
                bits.append(f"市場現價隱含 {r['pe_now']:.1f}x，取 25% 權重回歸")
            bits.append(f"全市場校準 ×{K:.3f}")
            r['why'] = '；'.join(bits) + '。'

        tl = []
        if r['upside'] is not None:
            if r['upside'] >= 0.30:
                tl.append('模型評價明顯高於市價')
            elif r['upside'] <= -0.25:
                tl.append('市價已高於模型評價')
        if r['diverge_dir'] and r['diverge_dir'] != '看法接近':
            tl.append(f"{r['diverge_dir']}（原表 {r['pe_mid0']:.1f}x vs 本模型 {r['pe_mid']:.1f}x）")
        if r['drift'] is not None and abs(r['drift']) > 0.15:
            tl.append(f"官方價較原表快照 {pctf(r['drift'])}")
        if r['stale']:
            tl.append('財測更新日期偏舊')
        if r['flags']:
            tl.append('；'.join(r['flags']))
        r['headline'] = '｜'.join(tl) if tl else '評價與原表看法相近'


KEEP = ['code', 'name', 'market', 'market_sheet', 'sector', 'sheet_sector', 'sector_fixed',
        'note', 'updated', 'stale', 'stale_days', 'sheet_price', 'drift',
        'price', 'chg', 'price_date', 'price_src', 'pe_official', 'pb', 'yield',
        'e2024', 'e2025', 'e2025_old', 'e2026', 'e2026_old', 'e2027', 'e2027_old', 'e2028', 'e2028_old',
        'g2025', 'g2026', 'g2027', 'g2028', 'g_blend', 'base_eps', 'base_yr',
        'anchor', 'gf', 'rf', 'qf', 'pe_now', 'pe_mid', 'pe_lo', 'pe_hi', 'pe_mid0', 'diverge_dir',
        'target', 't_lo', 't_hi', 'upside', 'rating', 'suspect', 'show_coef', 'flags',
        'why', 'headline', 'act', 'lo0', 'hi0']


def slim(r):
    def rnd(v):
        return round(v, 4) if isinstance(v, float) else v
    o = {k: rnd(r.get(k)) for k in KEEP}
    # the template reads the sheet's own EPS keys as e24..e28
    for y in (2024, 2025, 2026, 2027, 2028):
        o[f'e{str(y)[2:]}'] = o.pop(f'e{y}')
        if f'e{y}_old' in o:
            o[f'e{str(y)[2:]}_old'] = o.pop(f'e{y}_old')
        if f'g{y}' in o:
            o[f'g{str(y)[2:]}'] = o.pop(f'g{y}')
    if isinstance(o.get('act'), dict):
        o['act'] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in o['act'].items()}
    return o


def main():
    fc = json.loads((ROOT / 'data' / 'forecasts.json').read_text(encoding='utf-8'))
    print('抓取官方資料…')
    off = fetch_official.build()
    (ROOT / 'data' / 'official.json').write_text(
        json.dumps(off, ensure_ascii=False, indent=1), encoding='utf-8')

    recs, cal, K = run_model(fc, off, today=datetime.now(TPE).date())
    describe(recs, K)

    codes = {s['code'] for s in fc['stocks']}
    def cov(d):
        hit = codes & set(d)
        return len(hit), sorted({s['name'] for s in fc['stocks'] if s['code'] not in d})

    np_, miss_p = cov(off['price'])
    ne, miss_e = cov(off['pe'])
    na, miss_a = cov(off['eps_actual'])
    freshness = [
        {'label': '收盤價 / 漲跌', 'date': off['asof']['price'], 'covered': np_, 'total': len(codes),
         'missing': miss_p, 'note': '上市取證交所每日成交行情，上櫃取櫃買中心，興櫃取當日加權平均成交價。'},
        {'label': '官方本益比 / 股價淨值比 / 殖利率', 'date': off['asof']['pe'], 'covered': ne, 'total': len(codes),
         'missing': miss_e, 'note': '交易所以近四季實際 EPS 計算，與本頁的預估本益比口徑不同，不可混用。'},
        {'label': '實際累計 EPS', 'date': off['asof']['eps'], 'covered': na, 'total': len(codes),
         'missing': miss_a, 'note': 'KY 外國企業與興櫃公司的綜合損益表未納入官方 opendata，故無實績可對照。'},
        {'label': 'EPS 財測（2025–2028）', 'date': fc.get('sheet_basis', ''), 'covered': len(codes), 'total': len(codes),
         'missing': [], 'note': '無官方來源，人工維護於 valuation/data/forecasts.json，排程不會覆寫。'},
    ]

    agg = {}
    for r in recs:
        if r['upside'] is not None and not r['suspect']:
            agg.setdefault(r['sector'], []).append(r['upside'])
    import statistics as st
    sector_stats = sorted(
        [{'sector': k, 'n': len(v), 'med': round(st.median(v), 4)} for k, v in agg.items() if len(v) >= 2],
        key=lambda x: -x['med'])

    meta = {'cal': cal, 'sector_stats': sector_stats, 'freshness': freshness,
            'built': datetime.now(TPE).strftime('%Y-%m-%d %H:%M'),
            'price_date': off['asof']['price'], 'errors': off['errors'],
            'market_corrections': fc.get('market_corrections', {})}

    tpl = ROOT / 'templates'
    body = '\n'.join((tpl / f'part{i}.html').read_text(encoding='utf-8') for i in range(1, 7))
    html = wrap_document(body)
    html = html.replace('__PRICE_DATE__', off['asof']['price'] or '—')
    html = html.replace('__DATA__', json.dumps([slim(r) for r in recs], ensure_ascii=False, separators=(',', ':')))
    html = html.replace('__META__', json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
    for ph in ('__DATA__', '__META__', '__PRICE_DATE__'):
        assert ph not in html, f'unreplaced placeholder {ph}'

    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(html, encoding='utf-8')
    print(f'→ {out/"index.html"}  {len(html.encode())/1024:.0f} KB')
    print(f"價格 {np_}/{len(codes)}、官方PE {ne}/{len(codes)}、實績EPS {na}/{len(codes)}")
    print(f"校準 k={cal['k']:.3f}（原始中位上檔 {cal['median_raw_upside']*100:+.1f}%）")
    if off['errors']:
        print('!! 來源錯誤:', off['errors'])


if __name__ == '__main__':
    main()
