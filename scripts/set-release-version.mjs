import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tagOrVersion = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const version = String(tagOrVersion ?? '').replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version/tag: ${tagOrVersion ?? '(missing)'}`);
}

function readJson(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  return { filePath, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

const packageJson = readJson('package.json');
packageJson.value.version = version;
writeJson(packageJson.filePath, packageJson.value);

const packageLock = readJson('package-lock.json');
packageLock.value.version = version;
if (packageLock.value.packages?.['']) {
  packageLock.value.packages[''].version = version;
}
writeJson(packageLock.filePath, packageLock.value);

const tauriConfig = readJson('src-tauri/tauri.conf.json');
tauriConfig.value.version = version;
writeJson(tauriConfig.filePath, tauriConfig.value);

const cargoManifestPath = path.join(projectRoot, 'src-tauri', 'Cargo.toml');
const cargoManifest = fs.readFileSync(cargoManifestPath, 'utf8');
const nextCargoManifest = cargoManifest.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
  `$1${version}$2`,
);
if (nextCargoManifest === cargoManifest) {
  throw new Error('Could not update src-tauri/Cargo.toml package version.');
}
fs.writeFileSync(cargoManifestPath, nextCargoManifest, 'utf8');

const cargoLockPath = path.join(projectRoot, 'src-tauri', 'Cargo.lock');
if (fs.existsSync(cargoLockPath)) {
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
  const nextCargoLock = cargoLock.replace(
    /(name\s*=\s*"pulsaria"\r?\nversion\s*=\s*")[^"]+(")/,
    `$1${version}$2`,
  );
  if (nextCargoLock !== cargoLock) fs.writeFileSync(cargoLockPath, nextCargoLock, 'utf8');
}

console.log(`Release version synchronized: ${version}`);
