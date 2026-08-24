import { copyFile, cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = fileURLToPath(new URL('../gh-pages-dist/', import.meta.url));
const reportsSource = fileURLToPath(new URL('../ai-reports/', import.meta.url));
const reportsOutput = fileURLToPath(new URL('../gh-pages-dist/ai-reports/', import.meta.url));

await mkdir(outputRoot, { recursive: true });
await cp(reportsSource, reportsOutput, { recursive: true, force: true });
await copyFile(`${repoRoot}index.html`, `${outputRoot}legacy-home.html`);

for (const filename of await readdir(repoRoot)) {
  if (/^taiwan-ai-weekly-\d{8}\.html$/.test(filename)) {
    await copyFile(`${repoRoot}${filename}`, `${outputRoot}${filename}`);
  }
}

console.log('Copied legacy AI reports into the Pages artifact.');
