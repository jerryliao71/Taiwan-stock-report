import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchOfficialDashboard } from '../lib/stock-data';

const outputDir = fileURLToPath(new URL('../public/data/', import.meta.url));
const outputPath = fileURLToPath(new URL('../public/data/dashboard.json', import.meta.url));
const data = await fetchOfficialDashboard();

if (data.officialQuoteCount < 100) {
  throw new Error(`Official quote coverage too low: ${data.officialQuoteCount}/${data.stocks.length}`);
}
if (data.officialEpsCount < 90) {
  throw new Error(`Official EPS coverage too low: ${data.officialEpsCount}/${data.stocks.length}`);
}
if (data.sources.some((source) => !source.ok)) {
  throw new Error(`Official source failed: ${data.sources.filter((source) => !source.ok).map((source) => source.id).join(', ')}`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

const valuationCount = data.stocks.filter((stock) => stock.officialTrailingPe !== null).length;
console.log(`Wrote ${outputPath}`);
console.log(`Quotes ${data.officialQuoteCount}/${data.stocks.length}; EPS ${data.officialEpsCount}/${data.stocks.length}; official PE ${valuationCount}/${data.stocks.length}`);
