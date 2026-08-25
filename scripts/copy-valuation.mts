import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../valuation/dist/', import.meta.url));
const output = fileURLToPath(new URL('../gh-pages-dist/valuation/', import.meta.url));

try {
  await access(source);
} catch {
  console.warn(
    'valuation/dist not found - run `npm run build:valuation` first. Skipping.',
  );
  process.exit(0);
}

await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true, force: true });
console.log('Copied the valuation dashboard into the Pages artifact.');
