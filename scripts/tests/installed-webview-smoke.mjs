import assert from 'node:assert/strict';
import WebSocket from 'ws';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const phase = args.get('--phase');
const debugPort = Number(args.get('--debug-port'));
const apiPort = Number(args.get('--api-port'));
const mediaPath = args.get('--media-path');
const unregisteredMediaPath = args.get('--unregistered-media-path');

for (const [name, value] of Object.entries({ phase, debugPort, apiPort, mediaPath, unregisteredMediaPath })) {
  assert.ok(value, `Missing required installed WebView smoke argument: ${name}`);
}
assert.ok(['initial', 'restart'].includes(phase), 'Unsupported installed WebView smoke phase');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPageTarget() {
  const deadline = Date.now() + 90_000;
  let lastError = 'WebView2 DevTools endpoint has no page target';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
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
  throw new Error(`Installed WebView2 page target did not become ready: ${lastError}`);
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

  if (phase === 'initial') {
    const cspProbeHost = 'pulsaria-csp-probe.invalid';
    const inlineEvalProbe = "try { window.__pulsariaInstalledCspEval = { result: window.eval('1 + 1') }; } catch (error) { window.__pulsariaInstalledCspEval = { name: error.name }; }";
    csp = await evaluate(`(() => new Promise((resolve) => {
      const host = ${JSON.stringify(cspProbeHost)};
      const violations = [];
      const onViolation = (event) => {
        if (String(event.blockedURI || '').includes(host) || event.blockedURI === 'eval') {
          violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        }
      };
      document.addEventListener('securitypolicyviolation', onViolation, true);
      const blockedFrame = document.createElement('iframe');
      blockedFrame.src = 'https://' + host + '/frame';
      document.body.appendChild(blockedFrame);
      const blockedScript = document.createElement('script');
      blockedScript.src = 'https://' + host + '/script.js';
      document.head.appendChild(blockedScript);
      const evalProbe = document.createElement('script');
      evalProbe.textContent = ${JSON.stringify(inlineEvalProbe)};
      document.head.appendChild(evalProbe);
      const fetchProbe = fetch('https://' + host + '/connect').then(() => false, () => true);
      Promise.race([fetchProbe, new Promise((done) => setTimeout(() => done(false), 1500))]).then((connectBlocked) => {
        setTimeout(() => {
          const evalResult = window.__pulsariaInstalledCspEval || null;
          blockedFrame.remove();
          blockedScript.remove();
          evalProbe.remove();
          document.removeEventListener('securitypolicyviolation', onViolation, true);
          delete window.__pulsariaInstalledCspEval;
          resolve({ violations, connectBlocked, unsafeEval: evalResult });
        }, 300);
      });
    }))()`);
    const directives = new Set(csp.violations.map((violation) => violation.directive));
    assert.ok(directives.has('frame-src'), 'Installed CSP did not block an unapproved frame origin');
    assert.ok(directives.has('script-src-elem') || directives.has('script-src'), 'Installed CSP did not block an unapproved script origin');
    assert.ok(directives.has('connect-src') && csp.connectBlocked, 'Installed CSP did not block an unapproved connection');
    assert.equal(csp.unsafeEval?.name, 'EvalError', 'Installed CSP unexpectedly allowed eval');
    assert.ok(directives.has('script-src'), 'Installed CSP did not report the eval restriction');

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
  } else {
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
  }

  page = await evaluate(`({ origin: location.origin, readyState: document.readyState, nativeShell: Boolean(window.__TAURI_INTERNALS__) })`);
  process.stdout.write(`${JSON.stringify({ phase, page, csp, api, media })}\n`);
} finally {
  socket.close();
}
