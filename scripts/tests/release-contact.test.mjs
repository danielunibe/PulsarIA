import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateReleaseContact } from '../verify-release-contact.mjs';

const beta4 = {
  public_owner: 'Daniel Unibe',
  legal_contact_email: 'danielunibe10@gmail.com',
  notice_city: 'Guadalajara, Jalisco, México',
  release_version: '0.1.0-beta.4',
  public_contact_review_status: 'pending',
  public_contact_review_version: '0.1.0-beta.4',
};

test('candidate artifact may be prepared while public contact review is pending', () => {
  assert.deepEqual(validateReleaseContact(beta4, { candidateOnly: true }), []);
});

test('publication gate rejects pending public contact review', () => {
  assert.match(validateReleaseContact(beta4).join(' '), /review is pending/i);
});

test('publication gate accepts an approved contact disclosure for the same version', () => {
  const reviewed = { ...beta4, public_contact_review_status: 'approved' };
  assert.deepEqual(validateReleaseContact(reviewed), []);
});

test('contact approval cannot be reused for another release version', () => {
  const staleReview = { ...beta4, release_version: '0.1.0-beta.5', public_contact_review_status: 'approved' };
  assert.match(validateReleaseContact(staleReview).join(' '), /review version does not match/i);
});

test('contact gate requires the CV-backed name, city, and valid email', () => {
  const incomplete = { ...beta4, public_owner: '', notice_city: '', legal_contact_email: 'not-an-email' };
  const errors = validateReleaseContact(incomplete, { candidateOnly: true }).join(' ');
  assert.match(errors, /public_owner/);
  assert.match(errors, /valid legal contact email/);
  assert.match(errors, /notice_city/);
});

test('public postal and street address fields are rejected', () => {
  const withAddress = { ...beta4, notice_address: 'must not be published' };
  assert.match(validateReleaseContact(withAddress, { candidateOnly: true }).join(' '), /address is not permitted/i);
});

test('Windows BOM manifests pass the candidate CLI while publication stays blocked', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsaria-contact-bom-'));
  const manifestPath = path.join(directory, 'manifest.json');
  const verifier = fileURLToPath(new URL('../verify-release-contact.mjs', import.meta.url));
  try {
    fs.writeFileSync(manifestPath, `\uFEFF${JSON.stringify(beta4)}`, 'utf8');
    const candidate = spawnSync(process.execPath, [verifier, '--manifest', manifestPath, '--candidate-only'], { encoding: 'utf8' });
    assert.equal(candidate.status, 0, candidate.stderr);
    assert.match(candidate.stdout, /CANDIDATE CONTACT CHECK: PASS/);
    const publication = spawnSync(process.execPath, [verifier, '--manifest', manifestPath], { encoding: 'utf8' });
    assert.equal(publication.status, 1);
    assert.match(publication.stderr, /review is pending/i);
  } finally {
    fs.unlinkSync(manifestPath);
    fs.rmdirSync(directory);
  }
});
