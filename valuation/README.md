# 台股財測評價台

<https://jerryliao71.github.io/Taiwan-stock-report/valuation/>

以 125 檔個股的 EPS 財測為輸入，用規則式模型推導每一檔的合理本益比、目標價區間與評等，
並標出與原表設定分歧、財測達成落後、數據異常之處。

## 這裡的資料哪些會自動更新

| 欄位 | 來源 | 更新 |
| --- | --- | --- |
| 上市收盤價、漲跌幅 | 證交所 `exchangeReport/STOCK_DAY_ALL` | 每交易日 |
| 上櫃收盤價 | 櫃買中心 `tpex_mainboard_quotes` | 每交易日 |
| 興櫃參考價 | 櫃買中心 `tpex_esb_latest_statistics` | 每交易日 |
| 官方本益比／股價淨值比／殖利率 | 證交所 `BWIBBU_ALL`、櫃買 `tpex_mainboard_peratio_analysis` | 每交易日 |
| 實際累計 EPS | 公開資訊觀測站 `t187ap06_L_ci`、`mopsfin_t187ap06_O_ci` | 每季 |
| **EPS 財測 2025–2028** | **無官方來源，人工維護** | **手動** |

台灣已取消強制財務預測。證交所的財測資料集 `t187ap15_L` 全市場只有 6 家公司
（2412、2454、2515、3036、3702、4904），本表 125 檔中僅聯發科在內，
因此財測欄位沒有任何官方來源可自動更新。

## 要改財測時

直接編輯 [`data/forecasts.json`](data/forecasts.json) 後 commit，排程會在下次執行時採用。
排程只寫入 `data/official.json` 與 `dist/`，**永遠不會覆寫 `forecasts.json`**。

每檔的欄位：

```jsonc
{
  "code": "2330", "name": "台積電", "market": "上市",
  "sector": "晶圓代工",          // 影響模型採用的產業基準倍數
  "eps":     { "2024": 45.25, "2025": 66.20, "2026": 109.80, "2027": 148.60 },
  "eps_old": { "2026": 61.80, "2027": 130.00 },   // 舊財測，用於計算上修下修動能
  "pe_band": [15, 25],           // 原表人工設定的本益比區間，僅作對照
  "updated": "2026-07-18"        // 財測更新日，逾 190 天會標記為過舊
}
```

## 本機執行

```bash
npm run build:valuation      # 抓官方資料 → 跑模型 → 產生 valuation/dist/index.html
```

不需要 pip 安裝，只用 Python 標準函式庫。

## 檔案

- `pipeline/fetch_official.py` — 抓取七個官方端點，各自保留資料日期
- `pipeline/model.py` — 評價模型（產業基準、成長、財測修正、品質、市場回歸、全市場校準）
- `pipeline/build.py` — 串接並產生靜態頁
- `pipeline/fetchlib.py` — 具重試與 TLS 相容處理的抓取工具
- `templates/` — 頁面模板，`__DATA__` / `__META__` / `__PRICE_DATE__` 於建置時填入
- `data/forecasts.json` — 人工維護的財測輸入

## 已知限制

- 模型是橫斷面規則框架，不是逐家公司的基本面研究，也不是券商共識或目標價。
- 完全承接 `forecasts.json` 的財測；財測錯，結論就跟著錯。目前有 8 檔被自動標記為數據待確認。
- 刻意納入市價作為 25% 的先驗，因此在判斷「市場整體是否錯價」上必然偏保守。
- 未納入資產負債表、現金流、股利、股本變動與流動性。
- KY 外國企業與興櫃公司的綜合損益表不在官方 opendata 內，共 8 檔沒有實績可對照。

## TLS 備註

櫃買中心部分主機的憑證缺少 Subject Key Identifier 擴充，Python 3.13+ 預設的
`VERIFY_X509_STRICT` 會拒絕連線，且該行為在其負載平衡的主機間不一致。
`fetchlib.py` 會在嚴格模式失敗後改用非嚴格模式重試——**仍然驗證憑證鏈與主機名稱**，只是不要求該擴充欄位。
