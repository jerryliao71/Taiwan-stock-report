# -*- coding: utf-8 -*-
"""Forward EPS derived entirely from official filings -- no analyst forecast.

Taiwan publishes two things every listed company must file: quarterly financial
statements, and *monthly* revenue. Together they pin down a forward EPS without
anyone's opinion:

    shares      = net income / basic EPS
    net margin  = net income / revenue
    forward EPS = forward revenue x net margin / shares

The share count cancels, so this collapses to a ratio of revenue against the
earnings already reported for the matching period:

    forward EPS = EPS(year to quarter Q) x forecast full-year revenue
                                         / revenue(year to quarter Q)

which is to say: hold the realised net margin flat and let actual monthly revenue
carry the estimate forward. Revenue for elapsed months is reported, not modelled;
only the remaining months use a run rate.

What this deliberately does not know: design wins, price negotiations, capacity
coming online, one-off gains, or margin mix shifts. It annualises what is already
happening rather than predicting what will.
"""

TWSE = 'https://openapi.twse.com.tw/v1'
TPEX = 'https://www.tpex.org.tw/openapi/v1'

IS_SOURCES = [f'{TWSE}/opendata/t187ap14_L', f'{TPEX}/mopsfin_t187ap14_O']
REV_SOURCES = [f'{TWSE}/opendata/t187ap05_L', f'{TPEX}/mopsfin_t187ap05_O']

# Growth above this is only partly carried into the next-year figure.
SOFT_G, KEEP_ABOVE, G_CAP, G_FLOOR = 0.20, 0.35, 0.40, -0.25


def _f(x):
    if x in (None, '', '-', '--'):
        return None
    try:
        v = float(str(x).replace(',', '').replace('%', ''))
    except ValueError:
        return None
    return None if v != v else v


def _pick(row, *names):
    for n in names:
        if n in row and row[n] not in (None, ''):
            return row[n]
    return None


def collect(fetch_json):
    """Return {code: {...}} of the raw official inputs, both markets merged."""
    inc, rev, errors = {}, {}, {}

    for url in IS_SOURCES:
        try:
            rows = fetch_json(url)
        except Exception as e:
            errors[url] = f'{type(e).__name__}: {e}'
            continue
        for r in rows:
            c = _pick(r, '公司代號', 'SecuritiesCompanyCode')
            eps = _f(_pick(r, '基本每股盈餘(元)', '基本每股盈餘'))
            sales = _f(r.get('營業收入'))
            q = _f(_pick(r, '季別', 'Season'))
            yr = _f(_pick(r, '年度', 'Year'))
            if c and eps is not None and sales and q:
                inc[c] = {'eps_ytd': eps, 'sales_ytd': sales, 'quarter': int(q),
                          'year': int(yr) + 1911 if yr else None,
                          'net_income': _f(r.get('稅後淨利')),
                          'op_income': _f(r.get('營業利益'))}

    for url in REV_SOURCES:
        try:
            rows = fetch_json(url)
        except Exception as e:
            errors[url] = f'{type(e).__name__}: {e}'
            continue
        for r in rows:
            c = _pick(r, '公司代號', 'SecuritiesCompanyCode')
            cum = _f(r.get('累計營業收入-當月累計營收'))
            cur = _f(r.get('營業收入-當月營收'))
            prev = _f(r.get('營業收入-上月營收'))
            ym = str(_pick(r, '資料年月', 'Date') or '')
            if c and cum and cur and len(ym) >= 5:
                rev[c] = {'cum': cum, 'cur': cur, 'prev': prev,
                          'month': int(ym[-2:]), 'ym': ym,
                          'yoy_ytd': _f(r.get('累計營業收入-前期比較增減(%)')),
                          'yoy_month': _f(r.get('營業收入-去年同月增減(%)'))}
    return inc, rev, errors


def estimate(code, inc, rev):
    """Full-year and next-year EPS for one stock, or a reason it cannot be done."""
    i, m = inc.get(code), rev.get(code)
    if not i:
        return {'ok': False, 'why': '官方無最新財報'}
    if not m:
        return {'ok': False, 'why': '官方無月營收'}

    q_month = i['quarter'] * 3
    gap = m['month'] - q_month
    if gap < 0 or gap > 2:
        return {'ok': False, 'why': f"營收月份({m['month']})與財報季({i['quarter']})無法對齊"}

    # revenue for exactly the period the reported EPS covers
    after = [m['cur'], m['prev']][:gap]
    if any(x is None for x in after):
        return {'ok': False, 'why': '缺少月營收明細，無法對齊期間'}
    rev_to_q = m['cum'] - sum(after)
    if rev_to_q <= 0:
        return {'ok': False, 'why': '同期營收為零或負'}

    run = m['cur'] if m['prev'] is None else (m['cur'] + m['prev']) / 2
    fy_rev = m['cum'] + run * (12 - m['month'])
    scale = fy_rev / rev_to_q
    fy_eps = i['eps_ytd'] * scale

    g = m['yoy_ytd'] / 100 if m['yoy_ytd'] is not None else None
    if g is None:
        g_damped = 0.0
    else:
        g_damped = g if g <= SOFT_G else SOFT_G + (g - SOFT_G) * KEEP_ABOVE
        g_damped = max(G_FLOOR, min(G_CAP, g_damped))
    next_eps = fy_eps * (1 + g_damped) if fy_eps > 0 else fy_eps

    return {'ok': True,
            'eps_ytd': i['eps_ytd'], 'quarter': i['quarter'], 'year': i['year'],
            'sales_ytd': i['sales_ytd'], 'rev_month': m['month'], 'rev_ym': m['ym'],
            'rev_cum': m['cum'], 'run_rate': run, 'fy_rev': fy_rev,
            'scale': scale, 'fy_eps': fy_eps,
            'rev_yoy': g, 'g_damped': g_damped, 'next_eps': next_eps,
            'loss': i['eps_ytd'] <= 0,
            'net_margin': (i['net_income'] / i['sales_ytd']) if i.get('net_income') and i['sales_ytd'] else None}
