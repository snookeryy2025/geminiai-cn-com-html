import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createPayload, keyFileName } from './submit-indexnow.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
// Fail before producing a deployment if sitemap URLs or the local key are invalid.
await createPayload(root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const pages = (await readdir(root)).filter(name => name.endsWith('.html'));
const assets = [...pages, 'css', 'js', 'images', 'robots.txt', 'sitemap.xml', keyFileName];
for (const name of assets) {
    await cp(join(root, name), join(output, name), { recursive: true });
}
console.log(`[build] ${pages.length} HTML pages and public assets copied to dist.`);
