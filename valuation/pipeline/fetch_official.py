# -*- coding: utf-8 -*-
"""Pull prices, exchange PE and actual cumulative EPS from TWSE / TPEx open data.

Every figure the scheduled job refreshes comes from here. Forecast EPS does NOT:
Taiwan dropped mandatory financial forecasts, and the only official forecast feed
(t187ap15_L) carries 6 companies market-wide, so forecasts stay hand-maintained in
data/forecasts.json.

Each source keeps its own as-of date. An HTTP 200 does not mean the payload is
today's -- the exchanges publish on their own cadence and the page shows the date
each number actually carries.
"""
import json, re, sys
from pathlib import Path
from fetchlib import fetch_json

TWSE = 'https://openapi.twse.com.tw/v1'
TPEX = 'https://www.tpex.org.tw/openapi/v1'

SOURCES = {
    'twse_quote':  f'{TWSE}/exchangeReport/STOCK_DAY_ALL',
    'twse_pe':     f'{TWSE}/exchangeReport/BWIBBU_ALL',
    'twse_is':     f'{TWSE}/opendata/t187ap06_L_ci',
    'tpex_quote':  f'{TPEX}/tpex_mainboard_quotes',
    'tpex_pe':     f'{TPEX}/tpex_mainboard_peratio_analysis',
    'tpex_is':     f'{TPEX}/mopsfin_t187ap06_O_ci',
    'esb_quote':   f'{TPEX}/tpex_esb_latest_statistics',
}

def roc_to_iso(s):
    """Convert a ROC-era date such as 1150825 to 2026-08-25."""
    s = re.sub(r'\D', '', str(s or ''))
    if len(s) != 7:
        return ''
    return f'{int(s[:3]) + 1911:04d}-{s[3:5]}-{s[5:7]}'

def num(v):
    if v in (None, '', '--', 'N/A'):
        return None
    try:
        f = float(str(v).replace(',', '').replace('+', ''))
    except ValueError:
        return None
    return None if f != f else f

def chg_pct(close, change):
    """Both exchanges publish Change as an absolute dollar move, not a percentage.
    Previous close = close - change, so the percentage has to be derived."""
    if close is None or change is None:
        return None
    prev = close - change
    return None if prev <= 0 else change / prev * 100.0

def key_of(row, *names):
    for n in names:
        if n in row:
            return row[n]
    return None

def build():
    raw, errors = {}, {}
    for name, url in SOURCES.items():
        try:
            raw[name] = fetch_json(url)
        except Exception as e:                       # one dead feed must not kill the run
            raw[name] = []
            errors[name] = f'{type(e).__name__}: {e}'
            print(f'  !! {name}: {e}', file=sys.stderr)
        print(f'  {name:11s} {len(raw[name]):5d} rows')

    price, pe, eps = {}, {}, {}
    asof = {}

    for r in raw['twse_quote']:
        c = r.get('Code')
        p = num(r.get('ClosingPrice'))
        if c and p:
            price[c] = {'price': p, 'change': chg_pct(p, num(r.get('Change'))),
                        'date': roc_to_iso(r.get('Date')), 'src': 'TWSE'}
    for r in raw['tpex_quote']:
        c = key_of(r, 'SecuritiesCompanyCode', 'CompanyCode')
        p = num(r.get('Close'))
        if c and p:
            price[c] = {'price': p, 'change': chg_pct(p, num(r.get('Change'))),
                        'date': roc_to_iso(r.get('Date')), 'src': 'TPEx'}
    for r in raw['esb_quote']:
        c = key_of(r, 'SecuritiesCompanyCode', 'CompanyCode')
        # 興櫃 quotes the volume-weighted average as the reference price
        p = num(key_of(r, 'Average', 'LatestPrice', 'PreviousAveragePrice'))
        if c and p:
            prev = num(r.get('PreviousAveragePrice'))
            price[c] = {'price': p, 'change': (p / prev - 1) * 100 if prev else None,
                        'date': roc_to_iso(r.get('Date')), 'src': '興櫃'}

    for r in raw['twse_pe']:
        c = r.get('Code')
        if c:
            pe[c] = {'pe': num(r.get('PEratio')), 'pb': num(r.get('PBratio')),
                     'yield': num(r.get('DividendYield')), 'date': roc_to_iso(r.get('Date'))}
    for r in raw['tpex_pe']:
        c = r.get('SecuritiesCompanyCode')
        if c:
            pe[c] = {'pe': num(r.get('PriceEarningRatio')), 'pb': num(r.get('PriceBookRatio')),
                     'yield': num(r.get('YieldRatio')), 'date': roc_to_iso(r.get('Date'))}

    for rows, ck, yk, sk in ((raw['twse_is'], '公司代號', '年度', '季別'),
                             (raw['tpex_is'], 'SecuritiesCompanyCode', 'Year', 'Season')):
        for r in rows:
            c = r.get(ck)
            e = num(r.get('基本每股盈餘（元）'))
            if not c or e is None:
                continue
            yr, q = num(r.get(yk)), num(r.get(sk))
            if yr is None or q is None:
                continue
            eps[c] = {'eps_cum': e, 'year': int(yr) + 1911, 'quarter': int(q),
                      'date': roc_to_iso(key_of(r, '出表日期', 'Date'))}

    for k, d in (('price', price), ('pe', pe), ('eps', eps)):
        dates = sorted({v['date'] for v in d.values() if v.get('date')})
        asof[k] = dates[-1] if dates else ''

    return {'price': price, 'pe': pe, 'eps_actual': eps, 'asof': asof,
            'errors': errors, 'sources': SOURCES}

if __name__ == '__main__':
    print('抓取官方資料…')
    out = build()
    p = Path(__file__).resolve().parents[1] / 'data' / 'official.json'
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"價格 {len(out['price'])}、官方PE {len(out['pe'])}、實績EPS {len(out['eps_actual'])}")
    print('資料日期:', out['asof'], '錯誤:', out['errors'] or '無')
