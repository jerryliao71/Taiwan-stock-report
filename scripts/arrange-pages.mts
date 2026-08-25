/**
 * Decide what sits at each Pages URL.
 *
 *   /          valuation dashboard  (valuation/dist/index.html)
 *   /radar/    the React estimate radar, previously the site root
 *   /ai-reports/  published by copy-legacy-reports.mts
 *
 * The radar's asset and data URLs are absolute (vite `base` + BASE_URL), so
 * relocating its index.html does not change anything it loads.
 */
import { access, cp, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../gh-pages-dist/', import.meta.url));
const valuation = fileURLToPath(new URL('../valuation/dist/index.html', import.meta.url));

const exists = async (p: string) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(valuation))) {
  throw new Error(
    'valuation/dist/index.html is missing - run `npm run build:valuation` before build:github.',
  );
}

if (await exists(`${dist}index.html`)) {
  await mkdir(`${dist}radar/`, { recursive: true });
  await rename(`${dist}index.html`, `${dist}radar/index.html`);
  console.log('Moved the estimate radar to /radar/.');
}

await cp(valuation, `${dist}index.html`, { force: true });
console.log('Placed the valuation dashboard at the site root.');
