import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('Tauri export preparation preserves Next currentScript invariants and rewrites document assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsaria-frontend-test-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'out/_next/static/chunks'), { recursive: true });
    fs.copyFileSync(new URL('../prepare-tauri-frontend.mjs', import.meta.url), path.join(root, 'scripts/prepare-tauri-frontend.mjs'));
    // Next compares this literal to document.currentScript.src, an absolute
    // URL. Changing it to './_next/' made the installed UI stay unhydrated.
    const runtime = 'const prefix="/_next/"; if (!document.currentScript.src.includes(prefix)) throw new Error("Invariant");';
    const runtimePath = path.join(root, 'out/_next/static/chunks/runtime.js');
    fs.writeFileSync(runtimePath, runtime);
    const flight = '<script>self.__next_f.push([1,"/_next/static/chunks/runtime.js"])</script>';
    fs.writeFileSync(path.join(root, 'out/index.html'), '<script src="/_next/static/chunks/runtime.js"></script>' + flight);
    fs.writeFileSync(path.join(root, 'out/index.txt'), '/_next/static/chunks/runtime.js');
    fs.writeFileSync(path.join(root, 'out/_next/static/chunks/font.css'), 'src:url(../_next/static/media/font.woff2)');
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/prepare-tauri-frontend.mjs')], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(runtimePath, 'utf8'), runtime);
    }
    assert.equal(fs.readFileSync(path.join(root, 'out/index.html'), 'utf8'), '<script src="./_next/static/chunks/runtime.js"></script>' + flight);
    assert.equal(fs.readFileSync(path.join(root, 'out/index.txt'), 'utf8'), '/_next/static/chunks/runtime.js');
    assert.equal(fs.readFileSync(path.join(root, 'out/_next/static/chunks/font.css'), 'utf8'), 'src:url(../media/font.woff2)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
