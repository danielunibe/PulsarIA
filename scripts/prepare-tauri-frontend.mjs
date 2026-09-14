import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'out');
const rewritableExtensions = new Set(['.css', '.html', '.js', '.json', '.txt']);

async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(entryPath)));
        } else if (rewritableExtensions.has(path.extname(entry.name).toLowerCase())) {
            files.push(entryPath);
        }
    }

    return files;
}

const files = await collectFiles(outputRoot);
let rewrittenFiles = 0;
let rewrittenReferences = 0;

for (const filePath of files) {
    const before = await readFile(filePath, 'utf8');
    const extension = path.extname(filePath).toLowerCase();
    const after = extension === '.css'
        ? before
            .replace(/\.\.\/_next\/static\/media\//g, '../media/')
            .replace(/\/_next\/static\/media\//g, '../media/')
        : before
            .replaceAll('../_next/', './_next/')
            .replace(/(?<!\.)\/_next\//g, './_next/');

    if (after !== before) {
        await writeFile(filePath, after, 'utf8');
        rewrittenFiles += 1;
        rewrittenReferences += (before.match(/\/_next\//g) ?? []).length;
    }

    if (after.includes('../_next/')) {
        throw new Error(`Referencia _next no relativa al documento en ${filePath}`);
    }
}

const indexPath = path.join(outputRoot, 'index.html');
const indexStats = await stat(indexPath);
if (indexStats.size === 0) {
    throw new Error('El export frontend está vacío: out/index.html no contiene contenido.');
}

console.log(
    `Tauri frontend preparado: ${rewrittenReferences} referencias relativas en ${rewrittenFiles} archivos.`,
);
