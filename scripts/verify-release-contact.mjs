import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateReleaseContact(manifest, { candidateOnly = false, expectedVersion } = {}) {
  const errors = [];
  const version = expectedVersion ?? manifest.release_version;
  const email = String(manifest.legal_contact_email ?? manifest.legal_notice_email ?? '').trim();
  const city = String(manifest.notice_city ?? '').trim();

  if (!String(manifest.public_owner ?? '').trim()) errors.push('public_owner is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid legal contact email is required.');
  if (!city) errors.push('notice_city is required.');
  if (manifest.notice_address || manifest.postal_address || manifest.street_address) {
    errors.push('A postal or street address is not permitted in the public release manifest.');
  }
  if (!version || String(manifest.release_version ?? '') !== String(version)) {
    errors.push('The release contact review must match the expected release version.');
  }

  const reviewVersion = String(manifest.public_contact_review_version ?? '');
  if (reviewVersion !== String(version ?? '')) {
    errors.push('The public contact review version does not match the release version.');
  }

  const reviewStatus = String(manifest.public_contact_review_status ?? '').toLowerCase();
  if (candidateOnly) {
    if (!['pending', 'approved'].includes(reviewStatus)) {
      errors.push('Candidate builds require public contact review status pending or approved.');
    }
  } else if (reviewStatus !== 'approved') {
    errors.push('Public contact review is pending; a legal reviewer must approve the name, city, and email disclosure.');
  }

  return errors;
}

function readArguments(args) {
  const options = { candidateOnly: false, manifestPath: undefined, expectedVersion: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--candidate-only') options.candidateOnly = true;
    else if (arg === '--manifest') options.manifestPath = args[++index];
    else if (arg === '--expected-version') options.expectedVersion = args[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.manifestPath) throw new Error('Usage: node verify-release-contact.mjs --manifest <path> [--candidate-only] [--expected-version <version>]');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = readArguments(process.argv.slice(2));
    const manifest = JSON.parse(fs.readFileSync(options.manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    const errors = validateReleaseContact(manifest, options);
    if (errors.length) {
      console.error(`PULSARIA PUBLIC CONTACT GATE: BLOCKED\n - ${errors.join('\n - ')}`);
      process.exitCode = 1;
    } else if (options.candidateOnly) {
      console.log('PULSARIA CANDIDATE CONTACT CHECK: PASS; public release approval remains separate.');
    } else {
      console.log('PULSARIA PUBLIC CONTACT GATE: PASS');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
