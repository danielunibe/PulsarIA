import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { trustedExternalUrl } from '../../lib/external-links.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const capability = JSON.parse(fs.readFileSync(new URL('../../src-tauri/capabilities/main.json', import.meta.url), 'utf8'));

function directives(csp) {
  return Object.fromEntries(csp.split(';').map((entry) => {
    const [name, ...values] = entry.trim().split(/\s+/);
    return [name, values];
  }));
}

test('asset protocol starts empty and the webview has no shell-open capability', () => {
  assert.equal(config.app.security.assetProtocol.enable, true);
  assert.deepEqual(config.app.security.assetProtocol.scope, []);
  assert.equal(capability.permissions.includes('shell:allow-open'), false);
  assert.equal(Object.hasOwn(config.plugins, 'shell'), false);
  const cargo = fs.readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../../src-tauri/src/main.rs', import.meta.url), 'utf8');
  const packageManifest = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
  assert.doesNotMatch(main, /tauri_plugin_shell::init/);
  assert.equal(packageManifest.devDependencies['@tauri-apps/plugin-shell'], undefined);
});

test('production and development CSPs restrict scripts, connections, frames, and schemes separately', () => {
  const policies = [
    ['production', directives(config.app.security.csp)],
    ['development', directives(config.app.security.devCsp)],
  ];

  for (const [name, policy] of policies) {
    assert.ok(policy['default-src'].includes("'self'"), name + ' must default to the app origin');
    assert.ok(policy['object-src'].includes("'none'"), name + ' must disable plugins');
    assert.ok(policy['frame-src'].includes('https://www.tiktok.com'), name + ' must allow the official player');
    assert.deepEqual(policy['frame-src'], ['https://www.tiktok.com']);
    assert.equal(policy['script-src'].includes('*'), false, name + ' must not use wildcard script access');
    assert.equal(policy['connect-src'].includes('*'), false, name + ' must not use wildcard network access');
    assert.equal(policy['media-src'].includes('*'), false, name + ' must not use wildcard media access');
    assert.equal(policy['img-src'].includes('*'), false, name + ' must not use wildcard image access');
    assert.equal(policy['style-src'].includes('*'), false, name + ' must not use wildcard style access');
    assert.equal(policy['font-src'].includes('*'), false, name + ' must not use wildcard font access');
    assert.equal(policy['worker-src'].includes('*'), false, name + ' must not use wildcard worker access');
  }

  assert.equal(policies[0][1]['script-src'].includes("'unsafe-eval'"), false);
  assert.equal(policies[1][1]['script-src'].includes("'unsafe-eval'"), false);
  assert.ok(policies[0][1]['script-src'].includes("'unsafe-inline'"));
  assert.ok(policies[1][1]['script-src'].includes("'unsafe-inline'"));
  assert.ok(policies[1][1]['connect-src'].includes('http://127.0.0.1:3000'));
  assert.ok(policies[1][1]['connect-src'].includes('ws://127.0.0.1:3000'));
  assert.ok(policies[0][1]['connect-src'].includes('http://127.0.0.1:8080'));
  assert.ok(policies[1][1]['connect-src'].includes('http://127.0.0.1:8080'));
  assert.deepEqual(policies[0][1]['img-src'], [
    "'self'", 'asset:', 'http://asset.localhost', 'data:', 'blob:', 'https://www.tiktok.com',
    'https://picsum.photos', 'https://images.unsplash.com', 'https://i.imgur.com',
  ]);
  assert.deepEqual(policies[1][1]['img-src'], [
    "'self'", 'asset:', 'http://asset.localhost', 'data:', 'blob:', 'https://www.tiktok.com',
    'https://picsum.photos', 'https://images.unsplash.com', 'https://i.imgur.com',
    'http://127.0.0.1:3000',
  ]);
});

test('the native opener is reachable only through the strict Rust allowlist command', () => {
  const command = fs.readFileSync(new URL('../../src-tauri/src/commands.rs', import.meta.url), 'utf8');
  assert.match(command, /fn open_external_url\(url: String\)/);
  assert.match(command, /validate_external_url\(&url\)[\s\S]*?tauri_plugin_opener::open_url/);
  assert.doesNotMatch(command, /app\.shell\(\)/);
  assert.ok(trustedExternalUrl('https://www.tiktok.com/@creator/video/123'));
  assert.ok(trustedExternalUrl('https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md'));
});

test('external URL validator rejects lookalikes, non-HTTPS, credentials, ports, and unapproved GitHub paths', () => {
  for (const value of [
    'https://example.com/',
    'https://tiktok.com.evil.example/@creator',
    'https://evil.tiktok.com/@creator',
    'http://www.tiktok.com/@creator/video/123',
    'https://user:password@www.tiktok.com/@creator/video/123',
    'https://www.tiktok.com:8443/@creator/video/123',
    'https://www.tiktok.com:443/@creator/video/123',
    'https://@www.tiktok.com/@creator/video/123',
    'https://www.tiktok.com./@creator/video/123',
    ' https://www.tiktok.com/@creator/video/123',
    'https://github.com/danielunibe/PulsarIA/blob/main/README.md',
    'https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md?download=1',
    'javascript:alert(1)',
  ]) {
    assert.equal(trustedExternalUrl(value), null, value);
  }
  assert.ok(trustedExternalUrl('https://www.tiktok.com/@creator/video/123'));
  assert.ok(trustedExternalUrl('https://m.tiktok.com/@creator/video/123'));
  assert.ok(trustedExternalUrl('https://vt.tiktok.com/ZExample'));
  assert.ok(trustedExternalUrl('https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md'));
});

test('all direct local-file conversions pass through the exact-reference authorization helper', () => {
  const root = new URL('../../', import.meta.url);
  const scannedRoots = ['app', 'components', 'hooks', 'lib'];
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(new URL(directory + '/', root), { withFileTypes: true })) {
      const relativePath = directory + '/' + entry.name;
      if (entry.isDirectory()) walk(relativePath);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(relativePath);
    }
  }
  for (const directory of scannedRoots) walk(directory);

  const callers = files.filter((file) => file !== 'lib/authorized-assets.ts'
    && fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8').includes('convertFileSrc'));
  assert.deepEqual(callers, []);

  const command = fs.readFileSync(new URL('../../src-tauri/src/commands.rs', import.meta.url), 'utf8');
  const helper = fs.readFileSync(new URL('../../src-tauri/src/application/asset_scope.rs', import.meta.url), 'utf8');
  const assetResolver = fs.readFileSync(new URL('../../lib/authorized-assets.ts', import.meta.url), 'utf8');
  assert.match(command, /db::is_renderable_asset_path/);
  assert.match(command, /\.allow_file\(&path\)/);
  assert.match(command, /validate_external_url\(&url\)/);
  assert.match(command, /tauri_plugin_opener::open_url/);
  assert.doesNotMatch(command, /\.shell\(\)\s*\.open\(/);
  assert.ok(assetResolver.indexOf("invoke<string>('authorize_renderable_asset'")
    < assetResolver.indexOf('convertFileSrc(authorizedPath)'));
  assert.match(helper, /ParentDir/);
  assert.match(helper, /is_network_path/);
  assert.match(helper, /file_type\(\)\.is_symlink\(\)/);
  assert.match(helper, /FILE_ATTRIBUTE_REPARSE_POINT/);

  const main = fs.readFileSync(new URL('../../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(main, /commands::authorize_renderable_asset/);
  assert.match(main, /commands::open_external_url/);
});

test('local API CORS includes only fixed development and native Tauri origins', () => {
  const gateway = fs.readFileSync(new URL('../../src-tauri/src/api/gateway.rs', import.meta.url), 'utf8');
  assert.match(gateway, /"http:\/\/tauri\.localhost"/);
  assert.match(gateway, /"tauri:\/\/localhost"/);
  assert.match(gateway, /API_CORS_ALLOWED_ORIGINS: \[&str; 6\]/);
  assert.doesNotMatch(gateway, /allow_origin\([^)]*\*[^)]*\)/);
});

test('TikTok player messages require the exact iframe source, official origin, and message marker', () => {
  const playerSource = fs.readFileSync(new URL('../../lib/tiktok-player.ts', import.meta.url), 'utf8');
  const compiled = ts.transpile(playerSource, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  });
  const playerModule = { exports: {} };
  new Function('exports', compiled)(playerModule.exports);
  const { isTikTokPlayerMessage, tiktokPlayerUrl } = playerModule.exports;
  const frameWindow = {};
  const accepted = {
    source: frameWindow,
    origin: 'https://www.tiktok.com',
    data: { type: 'onStateChange', 'x-tiktok-player': true },
  };

  assert.equal(isTikTokPlayerMessage(accepted, frameWindow), true);
  assert.equal(isTikTokPlayerMessage({ ...accepted, origin: 'https://tiktok.com' }, frameWindow), false);
  assert.equal(isTikTokPlayerMessage({ ...accepted, source: {} }, frameWindow), false);
  assert.equal(isTikTokPlayerMessage({ ...accepted, data: { type: 'onStateChange' } }, frameWindow), false);
  assert.equal(isTikTokPlayerMessage(accepted, null), false);
  assert.equal(
    tiktokPlayerUrl('https://www.tiktok.com/@creator/video/123'),
    'https://www.tiktok.com/player/v1/123?controls=1&autoplay=1&loop=0&rel=0',
  );
  assert.equal(tiktokPlayerUrl('https://evil.example/@creator/video/123'), null);
});
