import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--') || !process.argv[index + 1]) {
    throw new Error(`Expected --name value arguments, got ${key}`);
  }
  args.set(key.slice(2), process.argv[++index]);
}

const outputPath = path.resolve(args.get('output') ?? 'pulsaria-release.spdx.json');
const npmSbomPath = path.resolve(args.get('npm-sbom') ?? '');
if (!args.has('npm-sbom') || !fs.existsSync(npmSbomPath)) {
  throw new Error('Pass an existing npm SPDX document with --npm-sbom.');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const tauri = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src-tauri/tauri.conf.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src-tauri/resources/runtime-manifest.json'), 'utf8'));
const npmSbom = JSON.parse(fs.readFileSync(npmSbomPath, 'utf8'));
if (npmSbom.spdxVersion !== 'SPDX-2.3' || !Array.isArray(npmSbom.packages)) {
  throw new Error('npm sbom must be an SPDX-2.3 document.');
}

const cargoJson = execFileSync('cargo', [
  'metadata', '--format-version=1', '--locked', '--manifest-path', path.join(projectRoot, 'src-tauri/Cargo.toml'),
], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const cargo = JSON.parse(cargoJson);
const rootPurl = `pkg:npm/pulsaria@${tauri.version}`;
const stableId = (prefix, value) => `${prefix}${crypto.createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
const packageRefs = new Set(npmSbom.packages.map((item) => item.SPDXID));
const packagePurls = new Set(npmSbom.packages.flatMap((item) => (item.externalRefs ?? [])
  .filter((reference) => reference.referenceType === 'purl')
  .map((reference) => reference.referenceLocator)));
const rootPackage = npmSbom.packages.find((item) => (item.externalRefs ?? [])
  .some((reference) => reference.referenceType === 'purl' && reference.referenceLocator === rootPurl));
if (!rootPackage) throw new Error(`npm SBOM root package does not match ${rootPurl}.`);

function packageComponent({ ecosystem, name, version, purl, license, downloadLocation, comment }) {
  const referenceLocator = purl;
  if (packagePurls.has(referenceLocator)) return null;
  const id = stableId(`SPDXRef-Package-${ecosystem}-`, referenceLocator);
  if (packageRefs.has(id)) throw new Error(`Duplicate generated SPDX identifier: ${id}`);
  packageRefs.add(id);
  packagePurls.add(referenceLocator);
  return {
    name,
    SPDXID: id,
    versionInfo: version || 'NOASSERTION',
    downloadLocation: downloadLocation || 'NOASSERTION',
    filesAnalyzed: false,
    licenseDeclared: license || 'NOASSERTION',
    licenseConcluded: 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    externalRefs: [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator }],
    sourceInfo: `Inventory source: ${ecosystem}.`,
    comment: comment || `Release inventory component from ${ecosystem}.`,
  };
}

const extraPackages = [];
for (const item of cargo.packages) {
  if (!item.source) continue;
  const purlName = encodeURIComponent(item.name).replace(/%3A/gi, ':');
  const purl = `pkg:cargo/${purlName}@${item.version}`;
  const component = packageComponent({
    ecosystem: 'cargo',
    name: item.name,
    version: item.version,
    purl,
    license: item.license || 'NOASSERTION',
    downloadLocation: item.source.startsWith('registry+')
      ? `https://crates.io/crates/${encodeURIComponent(item.name)}/${item.version}`
      : 'NOASSERTION',
    comment: `Cargo.lock package id: ${item.id}; declared license: ${item.license || 'NOASSERTION'}.`,
  });
  if (component) extraPackages.push(component);
}

const sitePackages = path.join(projectRoot, 'src-tauri/resources/python/Lib/site-packages');
if (!fs.existsSync(sitePackages)) throw new Error(`Bundled Python packages are missing: ${sitePackages}`);
const metadataDirectories = fs.readdirSync(sitePackages, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.endsWith('.dist-info'))
  .map((entry) => entry.name)
  .sort();
const thirdPartyLicenseFiles = [];
const commonSpdxLicenses = new Map([
  ['MIT', 'MIT'], ['MIT LICENSE', 'MIT'],
  ['APACHE-2.0', 'Apache-2.0'], ['APACHE 2.0', 'Apache-2.0'], ['APACHE SOFTWARE LICENSE', 'Apache-2.0'],
  ['BSD-3-CLAUSE', 'BSD-3-Clause'], ['3-CLAUSE BSD LICENSE', 'BSD-3-Clause'],
  ['MPL-2.0', 'MPL-2.0'], ['MPL-2.0 AND MIT', 'MPL-2.0 AND MIT'],
]);
for (const directory of metadataDirectories) {
  const metadataPath = path.join(sitePackages, directory, 'METADATA');
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const value = (field) => metadata.match(new RegExp(`^${field}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? '';
  const name = value('Name');
  const version = value('Version');
  if (!name || !version) continue;
  const normalizedName = name.toLowerCase().replaceAll('_', '-');
  const purlName = encodeURIComponent(normalizedName).replace(/%3A/gi, ':');
  const purl = `pkg:pypi/${purlName}@${version}`;
  const licenseExpression = value('License-Expression');
  const declaredLicense = licenseExpression || commonSpdxLicenses.get(value('License').toUpperCase()) || '';
  const classifiers = [...metadata.matchAll(/^Classifier:\s*License :: OSI Approved :: (.+)$/gim)]
    .map((match) => match[1].trim().toUpperCase());
  const classifierLicense = classifiers.map((classifier) => commonSpdxLicenses.get(classifier)).find(Boolean) || '';
  let resolvedLicense = declaredLicense || classifierLicense;
  let licenseEvidence = '';
  if (normalizedName === 'colorama' && version === '0.4.6') {
    const licensePath = path.join(sitePackages, directory, 'licenses', 'LICENSE.txt');
    if (!fs.existsSync(licensePath)) throw new Error(`Bundled Colorama license is missing: ${licensePath}`);
    const licenseText = fs.readFileSync(licensePath, 'utf8');
    if (!/All rights reserved\./i.test(licenseText)
      || !/Neither the name of the copyright holders, nor those of its contributors/i.test(licenseText)) {
      throw new Error('Colorama 0.4.6 license text does not match the expected three-clause BSD terms.');
    }
    resolvedLicense = 'BSD-3-Clause';
    const licenseBytes = fs.readFileSync(licensePath);
    const checksum = crypto.createHash('sha256').update(licenseBytes).digest('hex').toUpperCase();
    const releasePath = `python/Lib/site-packages/${directory}/licenses/LICENSE.txt`;
    licenseEvidence = `; bundled license evidence: ${releasePath}`;
    thirdPartyLicenseFiles.push({
      fileName: `./src-tauri/resources/${releasePath}`,
      SPDXID: stableId('SPDXRef-File-thirdparty-', `${purl}:${checksum}`),
      fileTypes: ['TEXT'],
      checksums: [{ algorithm: 'SHA256', checksumValue: checksum }],
      licenseConcluded: 'NOASSERTION',
      licenseInfoInFile: ['BSD-3-Clause'],
      licenseComments: 'Colorama 0.4.6 license text bundled under the Python site-packages dist-info directory.',
      copyrightText: 'Copyright (c) 2010 Jonathan Hartley',
      comment: `Pulsaria third-party license file: ${purl}; path=${releasePath}; sizeBytes=${licenseBytes.length}.`,
    });
  }
  const component = packageComponent({
    ecosystem: 'pypi',
    name,
    version,
    purl,
    license: resolvedLicense || 'NOASSERTION',
    downloadLocation: 'NOASSERTION',
    comment: `Bundled Python dist-info: ${directory}; license metadata: ${resolvedLicense || value('License') || classifiers.join('; ') || 'not declared'}${licenseEvidence}.`,
  });
  if (component) extraPackages.push(component);
}

const runtimeFiles = manifest.components.flatMap((component) => component.files ?? [])
  .filter((file) => file.status === 'present' && file.sha256 && Number.isFinite(file.sizeBytes));
if (runtimeFiles.length === 0) throw new Error('Runtime manifest did not provide hashed bundled files.');
const spdxFiles = runtimeFiles.map((file) => {
  const runtimePath = String(file.path).replaceAll('\\', '/');
  if (!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`Invalid runtime SHA-256 for ${runtimePath}.`);
  const checksum = file.sha256.toUpperCase();
  const extension = path.extname(runtimePath).toLowerCase();
  return {
    fileName: `./src-tauri/resources/${runtimePath}`,
    SPDXID: stableId('SPDXRef-File-runtime-', `${runtimePath}:${checksum}`),
    fileTypes: [extension === '.py' ? 'SOURCE' : ['.dll', '.exe', '.pyd'].includes(extension) ? 'BINARY' : 'OTHER'],
    checksums: [{ algorithm: 'SHA256', checksumValue: checksum }],
    licenseConcluded: 'NOASSERTION',
    licenseInfoInFile: ['NOASSERTION'],
    licenseComments: 'Bundled runtime file; component license is recorded in THIRD_PARTY_NOTICES.md and requires review.',
    copyrightText: 'NOASSERTION',
    comment: `Pulsaria runtime manifest path: ${runtimePath}; sizeBytes=${file.sizeBytes}.`,
  };
});

const legalMappings = tauri.bundle.resources.filter
  ? tauri.bundle.resources.filter((resource) => String(resource.destination ?? '').startsWith('resources/legal/'))
  : Object.entries(tauri.bundle.resources)
    .filter(([, destination]) => String(destination).startsWith('resources/legal/'))
    .map(([source, destination]) => ({ source, destination }));
const legalFiles = legalMappings.map(({ source, destination }) => {
  const sourcePath = path.resolve(projectRoot, 'src-tauri', source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Packaged legal source is missing: ${source}`);
  const content = fs.readFileSync(sourcePath);
  const checksum = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
  return {
    fileName: `./${String(destination).replaceAll('\\', '/')}`,
    SPDXID: stableId('SPDXRef-File-legal-', `${destination}:${checksum}`),
    fileTypes: ['TEXT'],
    checksums: [{ algorithm: 'SHA256', checksumValue: checksum }],
    licenseConcluded: 'NOASSERTION',
    licenseInfoInFile: ['NOASSERTION'],
    licenseComments: 'Pulsaria legal and notice document; review status is recorded in THIRD_PARTY_NOTICES.md.',
    copyrightText: 'NOASSERTION',
    comment: `Pulsaria packaged legal file: ${String(destination).replaceAll('\\', '/')}; source=${String(source).replaceAll('\\', '/')}; sizeBytes=${content.length}.`,
  };
});
if (legalFiles.length === 0) throw new Error('Tauri config does not package any legal resource files.');

const described = new Set(npmSbom.documentDescribes ?? []);
for (const item of [...extraPackages, ...spdxFiles, ...legalFiles, ...thirdPartyLicenseFiles]) described.add(item.SPDXID);
const document = {
  ...npmSbom,
  name: `pulsaria-release-${tauri.version}`,
  documentNamespace: `https://spdx.org/spdxdocs/pulsaria-${tauri.version}-${crypto.randomUUID()}`,
  creationInfo: {
    created: new Date().toISOString(),
    creators: ['Tool: npm/cli', 'Tool: pulsaria-release-sbom-builder'],
  },
  documentDescribes: [...described],
  packages: [...npmSbom.packages, ...extraPackages],
  files: [...(npmSbom.files ?? []), ...spdxFiles, ...legalFiles, ...thirdPartyLicenseFiles],
};

const purls = document.packages.flatMap((item) => (item.externalRefs ?? [])
  .filter((reference) => reference.referenceType === 'purl')
  .map((reference) => reference.referenceLocator));
const counts = {
  npm: purls.filter((value) => value.startsWith('pkg:npm/')).length,
  cargo: purls.filter((value) => value.startsWith('pkg:cargo/')).length,
  python: purls.filter((value) => value.startsWith('pkg:pypi/')).length,
  runtimeFiles: document.files.filter((item) => item.comment?.startsWith('Pulsaria runtime manifest path: ')).length,
  packagedLegalFiles: document.files.filter((item) => item.comment?.startsWith('Pulsaria packaged legal file: ')).length,
  thirdPartyLicenseFiles: document.files.filter((item) => item.comment?.startsWith('Pulsaria third-party license file: ')).length,
};
if (counts.npm < 2 || counts.cargo === 0 || counts.python === 0 || counts.runtimeFiles !== runtimeFiles.length || counts.packagedLegalFiles !== legalFiles.length || counts.thirdPartyLicenseFiles !== 1) {
  throw new Error(`Aggregate SBOM is incomplete: ${JSON.stringify(counts)}.`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`Pulsaria aggregate SPDX SBOM: PASS (${JSON.stringify(counts)}; version ${packageJson.version})`);
