import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(file, dependencies = {}) {
  const compiledModule = { exports: {} };
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, URL, Intl, console, setTimeout, clearTimeout,
    require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
  });
  return compiledModule.exports;
}

const adapter = loadModule('../../lib/profile-source.ts');
const player = loadModule('../../lib/tiktok-player.ts');
function record(overrides = {}) {
  return {
    id: 7, platform: 'tiktok', source_type: 'profile', profile_url: 'https://www.tiktok.com/@creator',
    url: 'https://www.tiktok.com/@creator', active: true, status: 'pending',
    watch_config_json: '{"posts":true,"likes":true,"saved":true}',
    rules_json: '{"autoEnqueue":false}', discovered_count: 0, created_at: '2026-10-12',
    ...overrides,
  };
}

test('an unqueried profile has pending states and unknown counts, including old ready rows', () => {
  for (const status of ['ready', 'pending']) {
    const profile = adapter.toProfileSource(record({ status }));
    assert.equal(profile.status, 'pending');
    assert.equal(profile.sources.posts.syncState, 'pending');
    assert.equal(profile.sources.posts.discoveredCount, null);
    assert.equal(profile.metrics.followers, null);
  }
});

test('online player uses official embed identities and rejects forged origins or messages', () => {
  assert.equal(player.tiktokPlayerUrl('https://www.tiktok.com/@creator/video/7695602749873949972?share=1'), 'https://www.tiktok.com/player/v1/7695602749873949972?controls=1&autoplay=1&loop=0&rel=0');
  for (const url of ['https://evil.test/@creator/video/123', 'https://tiktok.com.evil.test/@creator/video/123', 'https://token@www.tiktok.com/@creator/video/123', 'http://www.tiktok.com/@creator/video/123', 'https://www.tiktok.com/@creator']) {
    assert.equal(player.tiktokPlayerUrl(url), null);
  }
  const frame = {};
  const message = { origin: 'https://www.tiktok.com', source: frame, data: { 'x-tiktok-player': true, type: 'onPlayerReady' } };
  assert.equal(player.isTikTokPlayerMessage(message, frame), true);
  assert.equal(player.isTikTokPlayerMessage({ ...message, source: {} }, frame), false);
  assert.equal(player.isTikTokPlayerMessage({ ...message, origin: 'https://evil.test' }, frame), false);
});

test('canonical channel states and durable counts take precedence over old summaries', () => {
  const profile = adapter.toProfileSource(record({ status: 'partial', last_sync_at: '2026-10-12', followers_count: 0 }), [
    { kind: 'posts', enabled: true, status: 'idle', discovered_count: 12, last_successful_discovery_at: '2026-10-12' },
    { kind: 'favorites', enabled: true, status: 'requires_auth', discovered_count: 0, last_successful_discovery_at: null, error_message: 'Login required' },
    { kind: 'saved', enabled: true, status: 'rate_limited', discovered_count: 0, last_successful_discovery_at: null },
  ]);
  assert.equal(profile.status, 'error');
  assert.equal(profile.sources.posts.discoveredCount, 12);
  assert.equal(profile.sources.favorites.syncState, 'requires_session');
  assert.equal(profile.sources.favorites.discoveredCount, null);
  assert.equal(profile.sources.saved.syncState, 'rate_limited');
  assert.equal(profile.metrics.followers, 0);
});

test('favorites and legacy likes summary keys both preserve session failures', () => {
  for (const key of ['favorites', 'likes']) {
    const profile = adapter.toProfileSource(record({ last_sync_summary_json: JSON.stringify({ categories: { [key]: { state: 'requires_auth', discovered: 0 } } }) }));
    assert.equal(profile.sources.favorites.syncState, 'requires_session');
    assert.equal(profile.sources.favorites.discoveredCount, null);
  }
  const checking = adapter.toProfileSource(record({ status: 'checking' }));
  assert.equal(checking.status, 'discovering');
  assert.equal(checking.sources.posts.syncState, 'discovering');
});

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

async function panel({ native = true, rights = true, sources = [], summary = {} } = {}) {
  const state = [];
  let index = 0;
  const calls = [], selections = [], toasts = [], requestedRights = [];
  const effects = [];
  const hooks = {
    useState(initial) {
      const current = index++;
      if (!Object.hasOwn(state, current)) state[current] = typeof initial === 'function' ? initial() : initial;
      return [state[current], (next) => { state[current] = typeof next === 'function' ? next(state[current]) : next; }];
    },
    useCallback: (fn) => fn,
    useEffect: (effect) => effects.push(effect),
  };
  const api = loadModule('../../components/TikTokSourcesPanel.tsx', {
    react: hooks,
    '@/lib/profile-source': adapter,
    '@/hooks/use-processing-settings': { isTauriRuntime: () => native },
    '@/components/icon-library': {}, './Header': {},
    sonner: { toast: Object.fromEntries(['info', 'error', 'success', 'warning'].map((kind) => [kind, (message) => toasts.push({ kind, message })])) },
    '@tauri-apps/api/core': { invoke: async (command, args) => {
      calls.push({ command, args });
      if (command === 'register_profile_source') { sources.push(record()); return { source: sources.at(-1), duplicate: false }; }
      if (command === 'get_collection_sources') return sources;
      if (command === 'get_profile_channels') return [];
      if (command === 'sync_collection_source_now') return { partial: false, error_count: 0, message: 'Consulta completada', ...summary };
      throw new Error(`Unexpected command: ${command}`);
    } },
  });
  function render() {
    index = 0;
    return api.TikTokSourcesPanel({
      contentRightsAccepted: rights,
      onProfileSelect: (...args) => selections.push(args),
      onRequestContentRights: () => requestedRights.push(true),
    });
  }
  // Run the real initial read through the mocked IPC; never mount native listeners.
  render();
  effects[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { render, calls, selections, toasts, requestedRights };
}

test('adding uses saved options, opens the profile, and never invokes a scan', async () => {
  const fixture = await panel();
  let nodes = elements(fixture.render());
  nodes.find((node) => node.type === 'input' && node.props.id === 'tiktok-profile-input').props.onChange({ target: { value: '@creator' } });
  nodes.find((node) => node.type === 'select').props.onChange({ target: { value: '50' } });
  nodes = elements(fixture.render());
  await nodes.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const command = fixture.calls.find((call) => call.command === 'register_profile_source');
  assert.equal(command.args.input.autoEnqueue, false);
  assert.equal(command.args.input.historyLimit, 50);
  assert.equal(fixture.calls.some((call) => call.command === 'sync_collection_source_now'), false);
  assert.equal(fixture.selections[0][0].id, 7);
  assert.equal(fixture.selections[0][1], 'all');
});

test('profile content controls reach the consumer and partial queries show a warning', async () => {
  const fixture = await panel({ sources: [record()], summary: { partial: true, error_count: 1, message: 'Requiere sesión' } });
  const card = elements(fixture.render()).find((node) => node.props?.profile?.id === 7);
  card.props.onSelect();
  card.props.onSelectChannel('favorites');
  assert.equal(fixture.selections[0][1], 'all');
  assert.equal(fixture.selections[1][1], 'favorites');
  await card.props.onSync();
  // The UI callback launches the async handler; let its IPC continuation finish.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fixture.toasts.at(-1).kind, 'warning');
  assert.equal(fixture.toasts.at(-1).message, 'Requiere sesión');
  assert.equal(fixture.toasts.some((toast) => toast.kind === 'success'), false);
});

test('querying without content rights requests the existing gate and does not invoke IPC', async () => {
  const fixture = await panel({ rights: false, sources: [record()] });
  const card = elements(fixture.render()).find((node) => node.props?.profile?.id === 7);
  await card.props.onSync();
  assert.equal(fixture.requestedRights.length, 1);
  assert.equal(fixture.calls.some((call) => call.command === 'sync_collection_source_now'), false);
});

test('browser preview clearly disables registration', async () => {
  const fixture = await panel({ native: false });
  const nodes = elements(fixture.render());
  assert.equal(nodes.find((node) => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
});

test('the rights gate keeps the profile form mounted so a draft is not lost', () => {
  const state = [];
  let index = 0;
  const ProfilePanel = () => null;
  const api = loadModule('../../components/AddLinks.tsx', {
    react: {
      useState(initial) {
        const slot = index++;
        if (!Object.hasOwn(state, slot)) state[slot] = initial;
        return [state[slot], (value) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
      },
      useRef: (initial) => ({ current: initial }), useEffect: () => {},
      useCallback: (fn) => fn, useMemo: (fn) => fn(),
    },
    'react-dom': { createPortal: (children) => children },
    '@/components/TikTokSourcesPanel': { TikTokSourcesPanel: ProfilePanel },
    '@/lib/url-validation': {}, '@/components/icon-library': {},
    '@/hooks/use-processing-settings': { isTauriRuntime: () => false },
    '@/lib/i18n': { useI18n: () => ({ t: (key) => key }) },
  });
  const render = () => { index = 0; return elements(api.AddLinks({ mode: 'profiles', onSubmitLinks: async () => ({}) })); };
  let nodes = render();
  assert.equal(nodes.find((node) => node.props?.id === 'gView'), undefined);
  nodes.find((node) => node.type === ProfilePanel).props.onRequestContentRights();
  nodes = render();
  assert.ok(nodes.find((node) => node.props?.id === 'gView'));
  assert.equal(nodes.find((node) => node.props?.id === 'wView').props.hidden, true);
  assert.ok(nodes.find((node) => node.type === ProfilePanel), 'gate must not unmount the form or discard its draft');
});
