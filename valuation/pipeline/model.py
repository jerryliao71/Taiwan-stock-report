# -*- coding: utf-8 -*-
"""Rules-based fair-multiple model.

Fair price = base-year forecast EPS x fair PE. The forecast EPS comes from the
hand-maintained sheet; everything else here is derived. See METHODOLOGY in the
rendered page for the reasoning behind each coefficient.
"""
import math, statistics as st
from datetime import date

# Fair multiple for a company in this industry growing ~15%/yr, expressed against
# the forward EPS this pipeline derives from official filings. Higher than a
# textbook trailing PE because that base is one damped year ahead, not trailing.
ANCHOR = {
 'IC設計':24.5,'晶圓代工':24.5,'廠務':19,'封裝':19,'封測':19,'半導體設備':24.5,'半導體材料':23,
 '半導體耗材':23,'半導體通路':16,'檢測分析':24.5,'國防':27,'航太':21.5,'被動元件':20,'PCB':19,
 'CCL':21.5,'CCL材料':20,'PCB設備材料':20,'網通':19,'光通':29.5,'電源供應':25.5,'電池模組':20,
 '功率元件':20,'散熱':25.5,'記憶體':11,'記憶體模組':13.5,'伺服器組裝':16,'伺服器零組件':23,
 '連接器':25.5,'線束連接器':24.5,'機構件':16,'品牌PC':15,'面板':15,'石化':16,'碳素化工':16,
 '紡織':13.5,'自行車':15,'車用零件':16,'營建工程':13.5,'其他':19,
}
# Per-name overrides where the industry anchor misses franchise quality or risk.
NAME_ANCHOR = {
 '2330':27,'2303':15,'2454':25.5,'3443':38,'3661':32.5,'5274':38,'2345':27,'2383':27,
 '3017':27,'6805':27,'2317':17.5,'2382':16,'3231':15,'3706':13.5,'6488':21.5,'2059':24.5,
 '8299':11,'2344':11,'2337':11,'8150':13.5,'2451':12,'5289':13.5,'6415':27,'3533':25.5,
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


def build(forecasts, official, nowcast=None, overrides=None, today=None):
    today = today or date.today()
    ov_all = (overrides or {}).get('overrides', {})
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

        r['excluded'] = False
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

        # ---- valuation base: annualised official run-rate, not anyone's forecast ----
        nc = (nowcast or {}).get(c)
        r['nc'] = nc if (nc and nc.get('ok')) else None
        r['nc_why'] = None if r['nc'] else (nc or {}).get('why', '未取得官方推算')
        if r['nc'] and r['nc']['fy_eps'] > 0:
            # forward one year, same basis the sector anchors were set on: the
            # annualised run-rate carried forward by damped revenue momentum
            r['base_eps'] = r['nc']['next_eps']
            r['base_yr'] = r['nc']['year'] + 1
            r['base_src'] = '官方推算'
        elif r['nc'] and r['nc']['fy_eps'] <= 0:
            r['base_eps'], r['base_yr'], r['base_src'] = None, r['nc']['year'], '官方推算'
        else:
            # only the handful with no official filings fall back to the sheet
            for y in (2027, 2026, 2025):
                if eps.get(y) and eps[y] > 0:
                    r['base_eps'], r['base_yr'], r['base_src'] = eps[y], y, '原表財測'
                    break
            else:
                r['base_eps'] = r['base_yr'] = None
                r['base_src'] = '無'
        r['sheet_eps_same_yr'] = eps.get(r['base_yr']) if r['base_yr'] else None

        # ---- manual correction layer: always wins over the automatic base ----
        ov = dict(ov_all.get(c) or {})
        r['override'] = None
        if ov:
            exp = ov.get('expires')
            expired = False
            if exp:
                try:
                    y_, m_, d_ = (int(x) for x in exp.split('-'))
                    expired = date(y_, m_, d_) < today
                except Exception:
                    expired = False
            applied = {}
            auto_eps = r['base_eps']
            if not expired:
                if ov.get('exclude'):
                    r['excluded'] = True
                if ov.get('sector'):
                    r['sector'] = ov['sector']
                if ov.get('eps') is not None:
                    r['base_eps'] = float(ov['eps'])
                    r['base_yr'] = int(ov.get('eps_year') or r['base_yr'] or 0) or r['base_yr']
                    r['base_src'] = '人工校正'
                    applied['eps'] = ov['eps']
                if ov.get('anchor') is not None:
                    applied['anchor'] = float(ov['anchor'])
                if ov.get('pe_mid') is not None:
                    applied['pe_mid'] = float(ov['pe_mid'])
                if ov.get('sector'):
                    applied['sector'] = ov['sector']
            r['override'] = {'reason': ov.get('reason', ''), 'date': ov.get('date', ''),
                             'expires': exp or '', 'expired': expired,
                             'applied': applied, 'auto_eps': auto_eps}

        # ---- integrity flags ----
        # The base is now derived from filings, so the old typo hunt against the
        # sheet no longer gates the valuation. What can still go wrong is the
        # annualisation itself, and that is what these check.
        flags = []
        nc = r['nc']
        r['low_conf'] = False

        if nc and nc['loss']:
            flags.append(f"{nc['year']} 年累計至 Q{nc['quarter']} 實際 EPS 為 "
                         f"{nc['eps_ytd']:.2f} 元，公司仍在虧損，無法以本益比評價")
        if r['base_eps'] is None and not (nc and nc['loss']):
            flags.append(r['nc_why'] or '無可用的評價基礎')
        if nc and nc['ok'] and nc['scale'] > 3.0:
            r['low_conf'] = True
            flags.append(f"近月營收年化後為已實現期間的 {nc['scale']:.1f} 倍，"
                         '推算高度依賴最近兩個月的營收，可信度較低')
        if r['base_src'] == '原表財測':
            flags.append(f"官方無最新財報（{r['nc_why']}），改用原表人工財測")
        if r['base_eps'] and P and P / r['base_eps'] > 70:
            flags.append(f"推算本益比達 {P/r['base_eps']:.0f}x，獲利基期可能偏低")

        # sheet forecast is now only a cross-check, never an input
        r['sheet_gap'] = None
        se = r['sheet_eps_same_yr']
        if r['base_src'] == '官方推算' and se and se > 0 and r['base_eps']:
            r['sheet_gap'] = r['base_eps'] / se - 1
            if abs(r['sheet_gap']) > 0.35:
                flags.append(f"官方推算較原表人工財測{'高' if r['sheet_gap']>0 else '低'} "
                             f"{abs(r['sheet_gap'])*100:.0f}%，人工財測可能需更新")

        r['flags'] = flags
        # nothing is withheld for a suspected typo any more; only a genuine
        # inability to price -- a loss, or no usable base at all.
        r['suspect'] = False
        r['unpriceable'] = (nc and nc['loss']) or r['base_eps'] is None

        # ---- growth: official cumulative revenue YoY, falling back to the sheet ----
        if r['nc'] and r['nc']['rev_yoy'] is not None:
            g = r['nc']['rev_yoy']
            r['g_src'] = '官方營收年增'
        else:
            parts = [(r['g2026'], .25), (r['g2027'], .45), (r['g2028'], .30)]
            parts = [(x, w) for x, w in parts if x is not None]
            g = sum(x * w for x, w in parts) / sum(w for _, w in parts) if parts else None
            r['g_src'] = '原表財測' if g is not None else '無'
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

        r['anchor'] = NAME_ANCHOR.get(c, ANCHOR.get(r['sector'], 19))
        _ovp = (r['override'] or {}).get('applied', {})
        if 'anchor' in _ovp:
            r['anchor'] = _ovp['anchor']
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

    pool = [r for r in recs if r['base_eps'] and r['price']
            and not r['unpriceable'] and not r.get('excluded')]
    med = st.median([(r['base_eps'] * r['pe_blend']) / r['price'] for r in pool]) if pool else 1.0
    K = CAL_TARGET / med
    cal = {'k': K, 'n': len(pool), 'median_raw_upside': med - 1, 'w_mkt': W_MKT}

    for r in recs:
        _ovp = (r['override'] or {}).get('applied', {})
        if 'pe_mid' in _ovp:
            pe = _ovp['pe_mid']
        else:
            pe = max(6.0, min(55.0, r['pe_blend'] * K))
            if r['sector'] in DEEP_CYCLICAL:
                pe = min(pe, 17.5)
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
        if r['unpriceable']:
            for k in ('target', 't_lo', 't_hi', 'upside', 'pe_mid', 'pe_lo', 'pe_hi'):
                r[k] = None

        u = r['upside']
        r['rating'] = ('虧損中' if (r['nc'] and r['nc']['loss']) else
                       '無法評價' if u is None else
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
        r['show_coef'] = not r['unpriceable']
    return recs, cal, K
