import { lstatSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = realpathSync(path.resolve(scriptsDir, '..'));
const cachePath = path.join(projectRoot, '.next');

try {
  const entry = lstatSync(cachePath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Refusing to clean .next because it is not a regular directory.');
  }

  const resolvedCachePath = realpathSync(cachePath);
  if (
    path.dirname(resolvedCachePath) !== projectRoot ||
    path.basename(resolvedCachePath) !== '.next'
  ) {
    throw new Error(`Refusing to clean a path outside the project build cache: ${resolvedCachePath}`);
  }

  rmSync(resolvedCachePath, { recursive: true, force: true });
  console.log('Removed the project .next build cache.');
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('The project .next build cache is already clean.');
  } else {
    throw error;
  }
}
