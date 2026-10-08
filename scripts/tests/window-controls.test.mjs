import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the actual hook without a native host. Native close normally
// resolves even when Rust intercepts it and keeps the document in the tray.
function controls({ reduced = false, nativeError, onClose } = {}) {
  const document = { documentElement: { dataset: {} } };
  const errors = [];
  let nativeCloses = 0;
  const compiledModule = { exports: {} };
  const dependencies = {
    react: {
      useState: (value) => [value, () => {}],
      useRef: (value) => ({ current: value }),
      useEffect: () => {},
    },
    '@/lib/i18n': { useI18n: () => ({ t: (key) => key }) },
    sonner: { toast: { error: (message) => errors.push(message) } },
    '@tauri-apps/api/window': {
      getCurrentWindow: () => ({
        close: async () => {
          nativeCloses++;
          if (nativeError) throw nativeError;
        },
      }),
    },
  };
  const source = fs.readFileSync(new URL('../../components/Header.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, document,
    require: (name) => dependencies[name] ?? {},
    window: { matchMedia: () => ({ matches: reduced }), setTimeout: (callback) => callback() },
    console: { warn: () => {} },
  });
  return { api: compiledModule.exports.useWindowControls(onClose), document, errors, nativeCloses: () => nativeCloses };
}

test('closing to tray restores the document for reopening, repeatedly', async () => {
  const fixture = controls();
  for (let cycle = 0; cycle < 3; cycle++) {
    await fixture.api.close();
    assert.equal(fixture.document.documentElement.dataset.leaving, undefined);
  }
  assert.equal(fixture.nativeCloses(), 3);
  assert.deepEqual(fixture.errors, []);
});

test('failed native close restores interaction and reports an error', async () => {
  const fixture = controls({ nativeError: new Error('IPC unavailable') });
  await fixture.api.close();
  assert.equal(fixture.document.documentElement.dataset.leaving, undefined);
  assert.equal(fixture.errors.length, 1);
});

test('custom close callback cannot leave the shell transparent', async () => {
  let called = false;
  const fixture = controls({ onClose: () => { called = true; } });
  await fixture.api.close();
  assert.equal(called, true);
  assert.equal(fixture.nativeCloses(), 0);
  assert.equal(fixture.document.documentElement.dataset.leaving, undefined);
});

test('reduced motion still clears a previously retained exit state', async () => {
  const fixture = controls({ reduced: true });
  fixture.document.documentElement.dataset.leaving = 'true';
  await fixture.api.close();
  assert.equal(fixture.document.documentElement.dataset.leaving, undefined);
});
