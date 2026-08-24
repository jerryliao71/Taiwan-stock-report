# Taiwan Stock Report

台股估值雷達將原始 Excel、交易所／MOPS 官方資料與規則型分析情境分開呈現，部署於：

<https://jerryliao71.github.io/Taiwan-stock-report/>

## 資料層

- **Excel 原表**：125 檔股票、A–AB 欄位、原表快照價、低／高 PE、新舊 EPS、更新日與原始 fallback 公式。
- **官方實績**：TWSE／TPEx 收盤行情、MOPS 最新季累計基本 EPS、交易所近四季 PE／P-B／殖利率。
- **Codex 規則型情境**：使用原表、官方累計 EPS 與同行分布產生 EPS、forward PE 與估值區間；不是券商共識或目標價。

詳細定義見 [docs/METHODOLOGY.md](docs/METHODOLOGY.md)。

## 本機指令

```bash
npm ci
npm run update:data
npm run build:github
npm run lint
```

如要重新匯入本機 Excel：

```bash
python3 scripts/import-workbook.py /absolute/path/to/台股投資.xlsx
```

GitHub Actions 在台北時間每個工作日 18:20 抓取官方資料並重新部署，也可從 Actions 手動執行。
