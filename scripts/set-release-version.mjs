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
  return { filePath, value: JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) };
}

const updates = new Map();
function writeJson(filePath, value) {
  let content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (value.version !== undefined) content = content.replace(/("version"\s*:\s*")[^"]*(")/, `$1${value.version}$2`);
  if (value.packages?.['']?.version !== undefined) {
    content = content.replace(/("packages"\s*:\s*\{\s*""\s*:\s*\{[\s\S]*?"version"\s*:\s*")[^"]*(")/, `$1${value.packages[''].version}$2`);
  }
  if (value.release_version !== undefined) {
    content = /"release_version"\s*:/.test(content)
      ? content.replace(/("release_version"\s*:\s*")[^"]*(")/, `$1${value.release_version}$2`)
      : `${JSON.stringify(value, null, 2)}\n`;
  }
  if (JSON.stringify(JSON.parse(content)) !== JSON.stringify(value)) throw new Error(`Could not preserve JSON fields in ${filePath}.`);
  updates.set(filePath, content);
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

const releaseManifest = readJson('legal/release-manifest.json');
releaseManifest.value.release_version = version;
writeJson(releaseManifest.filePath, releaseManifest.value);

const projectManifest = readJson('PROJECT.manifest.json');
projectManifest.value.version = version;
writeJson(projectManifest.filePath, projectManifest.value);

const runtimeManifest = readJson('src-tauri/resources/runtime-manifest.json');
runtimeManifest.value.version = version;
writeJson(runtimeManifest.filePath, runtimeManifest.value);

const cargoManifestPath = path.join(projectRoot, 'src-tauri', 'Cargo.toml');
const cargoManifest = fs.readFileSync(cargoManifestPath, 'utf8');
const nextCargoManifest = cargoManifest.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
  `$1${version}$2`,
);
if (!/(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/.test(cargoManifest)) {
  throw new Error('Could not update src-tauri/Cargo.toml package version.');
}
updates.set(cargoManifestPath, nextCargoManifest);

const cargoLockPath = path.join(projectRoot, 'src-tauri', 'Cargo.lock');
if (fs.existsSync(cargoLockPath)) {
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
  const nextCargoLock = cargoLock.replace(
    /(name\s*=\s*"pulsaria"\r?\nversion\s*=\s*")[^"]+(")/,
    `$1${version}$2`,
  );
  if (!/(name\s*=\s*"pulsaria"\r?\nversion\s*=\s*")[^"]+(")/.test(cargoLock)) {
    throw new Error('Could not locate Pulsaria version in src-tauri/Cargo.lock.');
  }
  updates.set(cargoLockPath, nextCargoLock);
}

// Parse and validate every input before any file is changed. Repeated calls
// with the same version are safe, including JSON produced by PowerShell.
for (const [filePath, content] of updates) fs.writeFileSync(filePath, content, 'utf8');
console.log(`Release version synchronized: ${version}`);
