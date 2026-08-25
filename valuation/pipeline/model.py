# -*- coding: utf-8 -*-
"""Rules-based fair-multiple model.

Fair price = base-year forecast EPS x fair PE. The forecast EPS comes from the
hand-maintained sheet; everything else here is derived. See METHODOLOGY in the
rendered page for the reasoning behind each coefficient.
"""
import math, statistics as st
from datetime import date

ANCHOR = {
 'IC設計':18,'晶圓代工':18,'廠務':14,'封裝':14,'封測':14,'半導體設備':18,'半導體材料':17,
 '半導體耗材':17,'半導體通路':12,'檢測分析':18,'國防':20,'航太':16,'被動元件':15,'PCB':14,
 'CCL':16,'CCL材料':15,'PCB設備材料':15,'網通':14,'光通':22,'電源供應':19,'電池模組':15,
 '功率元件':15,'散熱':19,'記憶體':8,'記憶體模組':10,'伺服器組裝':12,'伺服器零組件':17,
 '連接器':19,'線束連接器':18,'機構件':12,'品牌PC':11,'面板':11,'石化':12,'碳素化工':12,
 '紡織':10,'自行車':11,'車用零件':12,'營建工程':10,'其他':14,
}
NAME_ANCHOR = {
 '2330':20,'2303':11,'2454':19,'3443':28,'3661':24,'5274':28,'2345':20,'2383':20,
 '3017':20,'6805':20,'2317':13,'2382':12,'3231':11,'3706':10,'6488':16,'2059':18,
 '8299':8,'2344':8,'2337':8,'8150':10,'2451':9,'5289':10,'6415':20,'3533':19,
}
DEEP_CYCLICAL = {'記憶體','記憶體模組','面板','石化'}
W_MKT = 0.25          # weight given to the price's own implied multiple
CAL_TARGET = 1.12     # median stock is calibrated to +12% upside
STALE_DAYS = 190


def _pct(a, b):
    return None if (a is None or b is None or b <= 0) else a / b - 1.0


def _days_since(iso, today):
    if not iso:
        return None
    try:
        y, m, d = (int(x) for x in iso.split('-'))
        return (today - date(y, m, d)).days
    except Exception:
        return None


def build(forecasts, official, today=None):
    today = today or date.today()
    price, opes, aeps = official['price'], official['pe'], official['eps_actual']
    recs = []

    for s in forecasts['stocks']:
        c = s['code']
        eps = {int(k): v for k, v in s['eps'].items()}
        old = {int(k): v for k, v in s['eps_old'].items()}
        q = price.get(c, {})
        P = q.get('price')

        r = dict(code=c, name=s['name'], market=s['market'], market_sheet=s['market_sheet'],
                 sector=s['sector'], sheet_sector=s['sheet_sector'], sector_fixed=s['sector_fixed'],
                 note=s['note'], updated=s['updated'], sheet_price=s['sheet_price'],
                 price=P, chg=q.get('change'), price_date=q.get('date',''), price_src=q.get('src',''),
                 lo0=(s['pe_band'] or [None,None])[0], hi0=(s['pe_band'] or [None,None])[1])

        r['drift'] = (P / s['sheet_price'] - 1) if (P and s['sheet_price']) else None
        op = opes.get(c, {})
        r['pe_official'] = op.get('pe'); r['pb'] = op.get('pb'); r['yield'] = op.get('yield')

        for y in (2024, 2025, 2026, 2027, 2028):
            r[f'e{y}'] = eps.get(y)
            r[f'e{y}_old'] = old.get(y)
        r['g2025'] = _pct(eps.get(2025), eps.get(2024))
        r['g2026'] = _pct(eps.get(2026), eps.get(2025))
        r['g2027'] = _pct(eps.get(2027), eps.get(2026))
        r['g2028'] = _pct(eps.get(2028), eps.get(2027))

        # ---- forecast progress: actual cumulative EPS vs the same year's forecast ----
        a = aeps.get(c)
        r['act'] = None
        if a and a['quarter']:
            fc = eps.get(a['year'])
            r['act'] = {'eps_cum': a['eps_cum'], 'year': a['year'], 'quarter': a['quarter'],
                        'date': a['date'], 'forecast': fc,
                        'progress': (a['eps_cum'] / fc) if (fc and fc > 0) else None,
                        'pace': (a['quarter'] / 4.0)}
            if r['act']['progress'] is not None:
                # >1 means the year is already running ahead of the full-year forecast
                r['act']['vs_pace'] = r['act']['progress'] / r['act']['pace']

        # ---- base year: 2027 forward, same basis as the sheet ----
        for y in (2027, 2026, 2025):
            if eps.get(y) and eps[y] > 0:
                r['base_eps'], r['base_yr'] = eps[y], y
                break
        else:
            r['base_eps'] = r['base_yr'] = None

        # ---- integrity flags ----
        flags = []
        if r['base_eps'] is None:
            flags.append('原表未填任何年度財測')
        for y in (2026, 2027):
            n_, o_ = eps.get(y), old.get(y)
            if n_ and o_ and o_ > 0 and (n_ / o_ > 4 or n_ / o_ < 0.25):
                flags.append(f'{y} 財測較舊值變動 {n_/o_:.1f}x，疑似誤植')
        for y in (2026, 2027):
            g = r[f'g{y}']
            if g is not None and g > 5:
                flags.append(f'{y} EPS 年增 {g*100:.0f}%，基期極低或誤植')
        for y in (2024, 2025, 2026):
            if eps.get(y) is not None and eps[y] <= 0:
                flags.append(f'{y} 為虧損')
        if r['base_eps'] and P and P / r['base_eps'] > 70:
            flags.append(f"{r['base_yr']} 年預估 PE 達 {P/r['base_eps']:.0f}x，股價或財測需確認")
        if r['act'] and r['act'].get('vs_pace') is not None:
            v = r['act']['vs_pace']
            if v < 0.55:
                flags.append(f"實績進度僅達季節步調的 {v*100:.0f}%，全年財測恐難達成")
        r['flags'] = flags
        r['suspect'] = any(('誤植' in f or '需確認' in f) for f in flags)

        # ---- blended growth -> sustainable growth ----
        parts = [(r['g2026'], .25), (r['g2027'], .45), (r['g2028'], .30)]
        parts = [(g, w) for g, w in parts if g is not None]
        g = sum(x * w for x, w in parts) / sum(w for _, w in parts) if parts else None
        r['g_blend'] = g
        if g is None:
            gs = 0.18
        elif g <= 0.20:
            gs = max(-0.20, g)
        else:
            gs = min(0.42, 0.20 + (g - 0.20) * 0.35)
        r['g_sus'] = gs
        gf = max(0.80, min(1.25, 1.0 + (gs - 0.18) / 1.00))

        revs = [n_ / o_ - 1 for n_, o_ in ((eps.get(y), old.get(y)) for y in (2026, 2027))
                if n_ and o_ and o_ > 0 and 0.25 <= n_ / o_ <= 4]
        rev = sum(revs) / len(revs) if revs else None
        r['revision'] = rev
        rf = max(0.94, min(1.08, 1.0 + (rev or 0) * 0.12))

        qf, qn = 1.0, []
        if any(eps.get(y) is not None and eps[y] <= 0 for y in (2024, 2025, 2026)):
            qf *= 0.85; qn.append('近年曾虧損')
        elif any(r[f'g{y}'] is not None and abs(r[f'g{y}']) > 1.5 for y in (2025, 2026, 2027)):
            qf *= 0.92; qn.append('獲利波動大')
        if '景氣循環' in r['note']:
            qf *= 0.90; qn.append('景氣循環股')
        if r['sector'] in DEEP_CYCLICAL:
            qf *= 0.92; qn.append('深度循環產業')
            gf = min(gf, 1.15)
        r['gf'], r['rf'], r['qf'], r['qnotes'] = gf, rf, qf, qn

        r['anchor'] = NAME_ANCHOR.get(c, ANCHOR.get(r['sector'], 14))
        r['pe_raw'] = r['anchor'] * gf * rf * qf
        r['pe_now'] = (P / r['base_eps']) if (P and r['base_eps']) else None

        d = _days_since(r['updated'], today)
        r['stale_days'] = d
        r['stale'] = (d is None) or (d > STALE_DAYS)
        recs.append(r)

    # ---- shrink toward the market, then calibrate the whole vector ----
    for r in recs:
        if r['pe_now']:
            m = max(3.0, min(90.0, r['pe_now']))
            r['pe_blend'] = math.exp((1 - W_MKT) * math.log(r['pe_raw']) + W_MKT * math.log(m))
        else:
            r['pe_blend'] = r['pe_raw']

    pool = [r for r in recs if r['base_eps'] and r['price'] and not r['suspect']]
    med = st.median([(r['base_eps'] * r['pe_blend']) / r['price'] for r in pool]) if pool else 1.0
    K = CAL_TARGET / med
    cal = {'k': K, 'n': len(pool), 'median_raw_upside': med - 1, 'w_mkt': W_MKT}

    for r in recs:
        pe = max(5.0, min(45.0, r['pe_blend'] * K))
        if r['sector'] in DEEP_CYCLICAL:
            pe = min(pe, 13.0)
        r['pe_mid'] = round(pe, 1)
        r['pe_lo'] = round(pe * 0.82 * 2) / 2
        r['pe_hi'] = round(pe * 1.18 * 2) / 2
        if r['base_eps'] and r['price']:
            r['target'] = r['base_eps'] * r['pe_mid']
            r['t_lo'] = r['base_eps'] * r['pe_lo']
            r['t_hi'] = r['base_eps'] * r['pe_hi']
            r['upside'] = r['target'] / r['price'] - 1
        else:
            r['target'] = r['t_lo'] = r['t_hi'] = r['upside'] = None
        if r['suspect'] or r['base_eps'] is None:
            for k in ('target', 't_lo', 't_hi', 'upside', 'pe_mid', 'pe_lo', 'pe_hi'):
                r[k] = None

        u = r['upside']
        r['rating'] = ('資料待確認' if r['suspect'] else '無法評價' if u is None else
                       '顯著低估' if u >= .30 else '價值浮現' if u >= .10 else
                       '接近合理' if u >= -.10 else '偏貴' if u >= -.25 else '顯著高估')

        if r['lo0'] and r['hi0'] and r['pe_mid']:
            m0 = (r['lo0'] + r['hi0']) / 2
            r['pe_mid0'] = m0
            dv = r['pe_mid'] / m0 - 1 if m0 > 0 else None
            r['diverge_dir'] = ('我方較樂觀' if dv and dv > .25 else
                                '我方較保守' if dv and dv < -.25 else '看法接近') if dv is not None else None
        else:
            r['pe_mid0'] = (r['lo0'] + r['hi0']) / 2 if (r['lo0'] and r['hi0']) else None
            r['diverge_dir'] = None
        r['show_coef'] = not r['suspect'] and r['base_eps'] is not None
    return recs, cal, K
