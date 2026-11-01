import assert from 'node:assert/strict';
import WebSocket from 'ws';

async function main() {
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const phase = args.get('--phase');
const debugPort = Number(args.get('--debug-port'));
const apiPort = Number(args.get('--api-port'));
const mediaPath = args.get('--media-path');
const unregisteredMediaPath = args.get('--unregistered-media-path');
const framePath = args.get('--frame-path');
const unregisteredFramePath = args.get('--unregistered-frame-path');
const searchQuery = args.get('--search-query');
const exerciseExternalOpener = args.get('--exercise-external-opener') === 'true';
const expectedInaccessible = args.get('--expect-inaccessible');

for (const [name, value] of Object.entries({ phase, debugPort, apiPort, mediaPath, unregisteredMediaPath })) {
  assert.ok(value, `Missing required installed WebView smoke argument: ${name}`);
}
assert.ok(['initial', 'restart', 'repair'].includes(phase), 'Unsupported installed WebView smoke phase');
if (phase === 'repair') {
  assert.match(expectedInaccessible ?? '', /^\d+$/, 'Repair phase requires a non-negative expected inaccessible path count');
} else {
  assert.equal(expectedInaccessible, undefined, '--expect-inaccessible is only valid for the repair phase');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPageTarget() {
  const deadline = Date.now() + 90_000;
  let lastError = 'WebView2 DevTools endpoint has no page target';
  let lastTargets = [];
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        lastTargets = targets.slice(0, 10).map((candidate) => {
          let url = 'unavailable';
          try {
            const parsed = new URL(candidate.url);
            url = `${parsed.origin}${parsed.pathname}`;
          } catch { }
          return {
            type: candidate.type,
            url,
            debuggerAvailable: Boolean(candidate.webSocketDebuggerUrl),
          };
        });
        const page = targets.find((target) => target.type === 'page'
          && target.url !== 'about:blank'
          && target.webSocketDebuggerUrl);
        if (page) return page;
      } else {
        lastError = `WebView2 DevTools returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`Installed WebView2 page target did not become ready: ${lastError}; targets=${JSON.stringify(lastTargets)}`);
}

const target = await waitForPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextMessageId = 0;

socket.on('message', (payload) => {
  let message;
  try {
    message = JSON.parse(payload.toString());
  } catch {
    return;
  }
  if (message.id === undefined) return;
  const operation = pending.get(message.id);
  if (!operation) return;
  pending.delete(message.id);
  if (message.error) operation.reject(new Error(`WebView2 DevTools request failed (${message.error.code})`));
  else operation.resolve(message.result);
});

socket.on('error', (error) => {
  for (const operation of pending.values()) operation.reject(error);
  pending.clear();
});

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out connecting to the installed WebView2 debugger')), 15_000);
  socket.once('open', () => {
    clearTimeout(timeout);
    resolve();
  });
  socket.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});

function send(method, params = {}) {
  const id = ++nextMessageId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for installed WebView2 ${method}`));
    }, 15_000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    allowUnsafeEvalBlockedByCSP: false,
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
    throw new Error(`Installed WebView evaluation failed: ${description}`);
  }
  return response.result?.value;
}

try {
  await send('Runtime.enable');
  let page = null;
  const readyDeadline = Date.now() + 60_000;
  while (Date.now() < readyDeadline) {
    page = await evaluate(`({
      readyState: document.readyState,
      titlePresent: Boolean(document.title),
      bodyPresent: Boolean(document.body && document.body.children.length),
      nativeShell: Boolean(window.__TAURI_INTERNALS__),
      origin: location.origin
    })`);
    if (page.readyState === 'complete' && page.bodyPresent && page.nativeShell) break;
    await delay(500);
  }
  assert.equal(page.readyState, 'complete', 'Installed Next page did not finish loading');
  assert.equal(page.bodyPresent, true, 'Installed Next page rendered no document body');
  assert.equal(page.nativeShell, true, 'Installed page did not expose the Tauri IPC bridge');

  let csp = null;
  let api = null;
  let media = null;
  let content = null;
  let external = null;
  let repair = null;

  if (phase === 'initial') {
    const cspProbeHost = 'pulsaria-csp-probe.invalid';
    csp = await evaluate(`(() => new Promise((resolve) => {
      const host = ${JSON.stringify(cspProbeHost)};
      const violations = [];
      const onViolation = (event) => {
        if (String(event.blockedURI || '').includes(host) || event.blockedURI === 'eval') {
          violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
        }
      };
      document.addEventListener('securitypolicyviolation', onViolation, true);
      const blockedFrame = document.createElement('iframe');
      blockedFrame.src = 'https://' + host + '/frame';
      document.body.appendChild(blockedFrame);
      const blockedScript = document.createElement('script');
      blockedScript.src = 'https://' + host + '/script.js';
      document.head.appendChild(blockedScript);
      let unsafeEval;
      try {
        unsafeEval = { result: window.eval('1 + 1') };
      } catch (error) {
        unsafeEval = { name: error.name };
      }
      const fetchProbe = fetch('https://' + host + '/connect').then(() => false, () => true);
      Promise.race([fetchProbe, new Promise((done) => setTimeout(() => done(false), 1500))]).then((connectBlocked) => {
        setTimeout(() => {
          blockedFrame.remove();
          blockedScript.remove();
          document.removeEventListener('securitypolicyviolation', onViolation, true);
          resolve({ violations, connectBlocked, unsafeEval });
        }, 300);
      });
    }))()`);
    const directives = new Set(csp.violations.map((violation) => violation.directive));
    assert.ok(directives.has('frame-src'), 'Installed CSP did not block an unapproved frame origin');
    assert.ok(directives.has('script-src-elem') || directives.has('script-src'), 'Installed CSP did not block an unapproved script origin');
    assert.ok(directives.has('connect-src') && csp.connectBlocked, 'Installed CSP did not block an unapproved connection');
    assert.equal(csp.unsafeEval?.name, 'EvalError', `Installed CSP did not block eval: ${JSON.stringify(csp)}`);
    assert.ok(directives.has('script-src'), `Installed CSP did not report the eval restriction: ${JSON.stringify(csp)}`);

    api = await evaluate(`(async () => {
      const token = await window.__TAURI_INTERNALS__.invoke('get_api_session_token');
      const base = 'http://127.0.0.1:${apiPort}';
      const authorized = await fetch(base + '/api/v1/jobs', { headers: { Authorization: 'Bearer ' + token } });
      const unauthorized = await fetch(base + '/api/v1/jobs');
      return {
        origin: location.origin,
        tokenPresent: typeof token === 'string' && token.length > 0,
        authorizedStatus: authorized.status,
        unauthorizedStatus: unauthorized.status
      };
    })()`);
    assert.equal(api.tokenPresent, true, 'Installed UI could not obtain a session token through IPC');
    assert.equal(api.authorizedStatus, 200, 'Installed UI API request failed with its IPC token or CORS');
    assert.ok([401, 403].includes(api.unauthorizedStatus), 'Installed API accepted a request without a session token');

    const deniedPath = JSON.stringify(unregisteredMediaPath);
    const authorizedPath = JSON.stringify(mediaPath);
    media = await evaluate(`(async () => {
      const internals = window.__TAURI_INTERNALS__;
      let unregisteredRejected = false;
      try {
        await internals.invoke('authorize_renderable_asset', { path: ${deniedPath} });
      } catch {
        unregisteredRejected = true;
      }
      const authorizedPath = await internals.invoke('authorize_renderable_asset', { path: ${authorizedPath} });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.style.cssText = 'position:fixed;left:-10000px;top:0;width:64px;height:64px';
      video.src = internals.convertFileSrc(authorizedPath);
      document.body.appendChild(video);
      const decoded = await new Promise((resolve) => {
        let finished = false;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          resolve(value);
        };
        const timeout = setTimeout(() => finish({ error: 'video decode timed out' }), 12000);
        video.addEventListener('error', () => finish({ error: video.error?.message || 'video decode failed' }), { once: true });
        video.addEventListener('loadeddata', async () => {
          try {
            await video.play();
            await new Promise((done) => setTimeout(done, 450));
            finish({
              readyState: video.readyState,
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration,
              currentTime: video.currentTime
            });
          } catch (error) {
            finish({ error: error instanceof Error ? error.name : 'video playback rejected' });
          }
        }, { once: true });
        video.load();
      });
      video.pause();
      video.remove();
      return {
        unregisteredRejected,
        authorizedPathMatches: authorizedPath === ${authorizedPath},
        decoded
      };
    })()`);
    assert.equal(media.unregisteredRejected, true, 'Installed IPC authorized a test file not registered in SQLite');
    assert.equal(media.authorizedPathMatches, true, 'Installed IPC changed the exact persisted test media path');
    assert.ok(!media.decoded.error, `Installed WebView could not decode/play the authorized MP4: ${media.decoded.error}`);
    assert.ok(media.decoded.readyState >= 2, 'Installed WebView never decoded a video frame');
    assert.equal(media.decoded.width, 64, 'Installed video has an unexpected decoded width');
    assert.equal(media.decoded.height, 64, 'Installed video has an unexpected decoded height');
    assert.ok(media.decoded.duration > 0 && media.decoded.currentTime > 0, 'Installed video did not advance during playback');

    for (const [name, value] of Object.entries({ framePath, unregisteredFramePath, searchQuery })) {
      assert.ok(value, `Initial installed content smoke requires ${name}`);
    }
    const deniedFramePath = JSON.stringify(unregisteredFramePath);
    const authorizedFramePath = JSON.stringify(framePath);
    const query = JSON.stringify(searchQuery);
    content = await evaluate(`(async () => {
      const internals = window.__TAURI_INTERNALS__;
      let unregisteredRejected = false;
      try {
        await internals.invoke('authorize_renderable_asset', { path: ${deniedFramePath} });
      } catch {
        unregisteredRejected = true;
      }
      const authorizedPath = await internals.invoke('authorize_renderable_asset', { path: ${authorizedFramePath} });
      const image = new Image();
      image.style.cssText = 'position:fixed;left:-10000px;top:0;width:64px;height:64px';
      document.body.appendChild(image);
      const decoded = await new Promise((resolve) => {
        let finished = false;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          resolve(value);
        };
        const timeout = setTimeout(() => finish({ error: 'authorized keyframe decode timed out' }), 12000);
        image.addEventListener('load', () => finish({ width: image.naturalWidth, height: image.naturalHeight }), { once: true });
        image.addEventListener('error', () => finish({ error: 'authorized keyframe decode failed' }), { once: true });
        image.src = internals.convertFileSrc(authorizedPath);
      });
      image.remove();
      const response = await internals.invoke('search_library', {
        request: { query: ${query}, mode: 'exact', limit: 10, context: null }
      });
      const match = (response.results || []).find((item) =>
        item.primaryMoment?.representation === 'transcript'
        && String(item.primaryMoment?.excerpt || '').toLowerCase().includes(${query}.toLowerCase())
      );
      return {
        unregisteredRejected,
        authorizedPathMatches: authorizedPath === ${authorizedFramePath},
        decoded,
        lexical: response.capabilities?.lexical === true,
        resultCount: Array.isArray(response.results) ? response.results.length : 0,
        transcriptMatch: Boolean(match),
        matchedRepresentation: match?.primaryMoment?.representation ?? null,
        matchedThumbnail: match?.primaryMoment?.matchThumbnail ?? null
      };
    })()`);
    assert.equal(content.unregisteredRejected, true, 'Installed IPC authorized an unregistered synthetic keyframe');
    assert.equal(content.authorizedPathMatches, true, 'Installed IPC changed the exact persisted keyframe path');
    assert.ok(!content.decoded?.error, `Installed WebView could not decode the persisted keyframe: ${content.decoded?.error}`);
    assert.ok(content.decoded.width > 0 && content.decoded.height > 0, 'Installed WebView returned empty keyframe dimensions');
    assert.equal(content.lexical, true, 'Installed unified search did not report lexical search as available');
    assert.ok(content.resultCount > 0 && content.transcriptMatch, 'Installed unified search did not find the transcribed synthetic fixture');
    assert.equal(content.matchedRepresentation, 'transcript', 'Installed search returned a non-transcript match for the Whisper fixture');
    assert.equal(content.matchedThumbnail, framePath, 'Installed search did not preserve the exact keyframe artifact path');

    if (exerciseExternalOpener) {
      const legalUrl = 'https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md';
      external = await evaluate(`(async () => {
        let unapprovedRejected = false;
        try {
          await window.__TAURI_INTERNALS__.invoke('open_external_url', { url: 'https://example.invalid/' });
        } catch {
          unapprovedRejected = true;
        }
        try {
          await window.__TAURI_INTERNALS__.invoke('open_external_url', { url: ${JSON.stringify(legalUrl)} });
          return { unapprovedRejected, approvedUrlDispatched: true };
        } catch (error) {
          return { unapprovedRejected, approvedUrlDispatched: false, error: String(error) };
        }
      })()`);
      assert.equal(external.unapprovedRejected, true, 'Installed app accepted an unapproved external URL');
      assert.equal(external.approvedUrlDispatched, true, `Installed OS opener rejected an approved legal URL: ${external.error || 'unknown error'}`);
    } else {
      external = { skipped: true, reason: 'Opening a system browser is exercised only on an isolated CI runner' };
    }
  } else if (phase === 'restart') {
    const authorizedPath = JSON.stringify(mediaPath);
    media = await evaluate(`(async () => {
      const internals = window.__TAURI_INTERNALS__;
      const path = await internals.invoke('authorize_renderable_asset', { path: ${authorizedPath} });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = internals.convertFileSrc(path);
      document.body.appendChild(video);
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'restarted video decode timed out' }), 10000);
        video.addEventListener('error', () => { clearTimeout(timeout); resolve({ error: 'restarted video decode failed' }); }, { once: true });
        video.addEventListener('loadeddata', () => {
          clearTimeout(timeout);
          resolve({ readyState: video.readyState, width: video.videoWidth, height: video.videoHeight });
        }, { once: true });
        video.load();
      });
      video.remove();
      return result;
    })()`);
    assert.ok(!media.error, `Restarted installed WebView lost its synthetic media reference: ${media.error}`);
    assert.ok(media.readyState >= 2 && media.width === 64 && media.height === 64, 'Restarted installed WebView could not decode the persisted media');
  } else {
    repair = await evaluate(`window.__TAURI_INTERNALS__.invoke('repair_library')`);
    const inaccessible = repair?.inaccessible_media_paths ?? repair?.inaccessibleMediaPaths;
    assert.ok(Number.isInteger(inaccessible), `Installed repair_library returned no inaccessible path count: ${JSON.stringify(repair)}`);
    if (expectedInaccessible !== undefined) {
      assert.equal(inaccessible, Number(expectedInaccessible), 'Installed repair_library reported an unexpected inaccessible path count');
    }
  }

  page = await evaluate(`({ origin: location.origin, readyState: document.readyState, nativeShell: Boolean(window.__TAURI_INTERNALS__) })`);
  process.stdout.write(`${JSON.stringify({ phase, page, csp, api, media, content, external, repair })}\n`);
} finally {
  socket.close();
}
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  process.stdout.write(`PULSARIA_WEBVIEW_SMOKE_ERROR ${JSON.stringify({ message, stack })}\n`);
  process.exitCode = 1;
});
