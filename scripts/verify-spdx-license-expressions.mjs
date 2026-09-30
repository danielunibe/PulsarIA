import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parseSpdxExpression from 'spdx-expression-parse';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--') || !process.argv[index + 1]) {
    throw new Error(`Expected --name value arguments, got ${key}`);
  }
  args.set(key.slice(2), process.argv[++index]);
}

const sbomArgument = args.get('sbom');
if (!sbomArgument) throw new Error('Pass the SPDX document with --sbom.');
const sbomPath = path.resolve(projectRoot, sbomArgument);
const sbomText = fs.readFileSync(sbomPath, 'utf8').replace(/^\uFEFF/, '');
const sbom = JSON.parse(sbomText);
if (sbom.spdxVersion !== 'SPDX-2.3' || !Array.isArray(sbom.packages) || !Array.isArray(sbom.files)) {
  throw new Error('The release SBOM must be a valid SPDX-2.3 document with packages and files arrays.');
}

const expressions = [];
function collect(subject, field, value) {
  if (value === undefined) return;
  const values = Array.isArray(value) ? value : [value];
  for (const expression of values) {
    if (expression === 'NOASSERTION' || expression === 'NONE') continue;
    if (typeof expression !== 'string' || expression.trim() === '') {
      throw new Error(`${subject}.${field} must contain an SPDX expression or an SPDX sentinel.`);
    }
    expressions.push({ subject, field, expression });
  }
}

for (const item of sbom.packages) {
  collect(item.SPDXID || item.name || 'package', 'licenseDeclared', item.licenseDeclared);
  collect(item.SPDXID || item.name || 'package', 'licenseConcluded', item.licenseConcluded);
}
for (const item of sbom.files) {
  collect(item.SPDXID || item.fileName || 'file', 'licenseConcluded', item.licenseConcluded);
  collect(item.SPDXID || item.fileName || 'file', 'licenseInfoInFile', item.licenseInfoInFile);
}

const errors = [];
for (const entry of expressions) {
  try {
    parseSpdxExpression(entry.expression);
  } catch (error) {
    errors.push(`${entry.subject}.${entry.field}: ${entry.expression} (${error.message})`);
  }
}

if (errors.length > 0) {
  console.error(`SPDX expression validation: FAIL (${errors.length} invalid expression${errors.length === 1 ? '' : 's'})`);
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  const unique = new Set(expressions.map((entry) => entry.expression));
  console.log(`SPDX expression validation: PASS (${sbom.packages.length} packages, ${sbom.files.length} files, ${unique.size} unique expressions)`);
}
