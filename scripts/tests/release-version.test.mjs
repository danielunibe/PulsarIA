import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsaria-version-test-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(new URL('../set-release-version.mjs', import.meta.url), path.join(root, 'scripts/set-release-version.mjs'));
  for (const file of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'legal/release-manifest.json', 'PROJECT.manifest.json', 'src-tauri/resources/runtime-manifest.json']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `\uFEFF${JSON.stringify({ version: '0.1.0-beta.2', packages: { '': { version: '0.1.0-beta.2' } } })}`);
  }
  fs.writeFileSync(path.join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "pulsaria"\nversion = "0.1.0-beta.2"\n');
  fs.writeFileSync(path.join(root, 'src-tauri/Cargo.lock'), '[[package]]\nname = "pulsaria"\nversion = "0.1.0-beta.2"\n');
  return root;
}

test('Windows BOM inputs and repeated synchronization produce consistent beta versions', () => {
  const root = fixture();
  try {
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/set-release-version.mjs'), 'v0.1.0-beta.3'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages[''].version, '0.1.0-beta.3');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'legal/release-manifest.json'), 'utf8')).release_version, '0.1.0-beta.3');
    assert.match(fs.readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8'), /version = "0.1.0-beta.3"/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid later input leaves earlier manifests untouched', () => {
  const root = fixture();
  try {
    const before = fs.readFileSync(path.join(root, 'package.json'));
    fs.writeFileSync(path.join(root, 'PROJECT.manifest.json'), '{invalid');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/set-release-version.mjs'), 'v0.1.0-beta.3']);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readFileSync(path.join(root, 'package.json')), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
