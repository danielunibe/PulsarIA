/**
 * REST fallback client.
 *
 * Native Tauri calls receive a short-lived process token through IPC. Plain
 * browser development can opt in only by explicitly setting
 * window.__PULSAR_DEV_API_TOKEN__ in that local session; there is no
 * anonymous fallback for protected API routes.
 */
declare global {
  interface Window {
    __PULSAR_DEV_API_TOKEN__?: string;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const isTauri = typeof window !== 'undefined'
    && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const token = await invoke<string>('get_api_session_token');
      headers.set('Authorization', `Bearer ${token}`);
    } catch (error) {
      // Let the server reject the request instead of inventing credentials,
      // but retain evidence in the console so a native IPC failure is not
      // mistaken for an anonymous API response.
      console.warn('Could not obtain the native API session token:', error);
    }
  } else if (typeof window !== 'undefined' && window.__PULSAR_DEV_API_TOKEN__) {
    headers.set('Authorization', `Bearer ${window.__PULSAR_DEV_API_TOKEN__}`);
  }

  return fetch(input, { ...init, headers });
}
