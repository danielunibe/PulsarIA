import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
for (const page of ['index.html', 'downloads.html', 'privacy.html', 'terms.html']) {
  const pagePath = path.join(root, page);
  await access(pagePath);
  const html = await readFile(pagePath, 'utf8');
  if (!html.includes('<title>')) throw new Error(`${page} has no title`);
  if (html.includes('0.1.3') || html.includes('UnovaGamesStudio')) {
    throw new Error(`${page} contains obsolete release or repository information`);
  }
}
console.log('Pulsaria website build: PASS (home, downloads, privacy, terms)');
