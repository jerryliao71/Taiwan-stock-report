# 資料與模型方法

## 1. Excel 原表

Excel 快照完整對應 A–AB。F–I 的 PE 沿用原表 fallback：

- 2028 PE：2028E EPS 缺值時改用 2027E，再缺則用 2026E。
- 2027 PE：2027E EPS 缺值時改用 2026E，再缺則用 2025E。
- 2026／2025 PE：使用同年度 EPS。
- 參考價：第一個可用的 2027E、2026E、2025E EPS × 原表低／高 PE 中點。

「Excel 完整欄位」使用原表快照價重算，並在跨年度代算 PE 時標示實際 EPS 基準年。「估值總覽」的 forward PE 則使用最新官方價除以原表同年度 EPS；兩者不可混稱原表數字。

## 2. 官方資料

| 用途 | 來源 |
| --- | --- |
| 上市收盤行情 | `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` |
| 上櫃收盤行情 | `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes` |
| 上市累計基本 EPS | `https://openapi.twse.com.tw/v1/opendata/t187ap14_L` |
| 上櫃累計基本 EPS | `https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O` |
| 上市官方近四季 PE | `https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL` |
| 上櫃官方近四季 PE | `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis` |

官方近四季 PE 與 forward PE 口徑不同；網站分欄呈現。每個來源與個股都保留資料日期，HTTP 成功不等於當日資料。

## 3. Codex 規則型情境 2026.08-v1

這是可稽核的規則型情境，不是券商共識、目標價或預期報酬。

### EPS

- 若官方累計 EPS 是 2026Qq，2026 模型 EPS = 官方累計 EPS + `(1 - q/4) × 原表 2026E EPS`。已公布期間以實績取代原表線性分攤，剩餘期間保留原表假設。
- 若只有原表，沿用原表 2026E；若只有同年度官方實績，使用簡單年化 `累計 EPS × 4/q`，並降低資料充分度。
- 2027／2028 僅在正 EPS 與有效日期下計算。原表個股成長率和同族群成長率中位數依原表新鮮度加權；族群樣本不足五檔時使用同市場備援。
- 負 EPS、零 EPS、轉盈／轉虧不計算百分比成長或 PE。

### PE 與情境值

- 模型 forward PE = 最新價 ÷ 模型 EPS。
- 同行 2027E forward PE 取 p25／median／p75；至少五個樣本，八個以上先做 IQR 異常值排除。
- 原表在 90／180／365 天內的權重分別為 60%／40%／20%；其餘權重來自同行四分位數。
- 同行不足時只沿用原表區間並標示「原表區間代用」，不冒稱模型同業區間。
- 情境低／中／高值 = 模型基準 EPS × PE 低／中／高；網站顯示「相對情境中位數差距」，不稱上漲空間。

### 資料充分度

資料充分度只衡量價格日期、同年度官方 EPS、原表新鮮度、同行樣本、正 EPS 與來源衝突，不是投資信心或評等。模型未調整季節性、一次性損益、股本變動、股利及淨負債。
