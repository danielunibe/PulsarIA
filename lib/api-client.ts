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

/** Identifies the trusted desktop shell without granting browser REST access. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window
    || window.location.protocol === 'tauri:'
    || window.location.hostname === 'tauri.localhost';
}

/** Turns local API/IPC failures into messages that explain the next action. */
export function localApiErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  const normalized = raw.toLowerCase();
  if (!raw) return fallback;

  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|connection refused/.test(normalized)) {
    return 'No pudimos conectar con la biblioteca local. Comprueba que Pulsaria siga ejecutándose y vuelve a intentarlo.';
  }

  const status = raw.match(/\b([45]\d{2})\b/)?.[1];
  if (status === '401' || status === '403') {
    if (!isNativeShell()) {
      return 'El modo navegador no tiene acceso a la biblioteca local. Abre Pulsaria en su ventana de escritorio.';
    }
    return 'La solicitud no fue autorizada por el motor local. Revisa la configuración e inténtalo de nuevo.';
  }
  if (status === '429') {
    return 'El motor local está ocupado. Espera un momento y vuelve a intentarlo.';
  }
  if (status?.startsWith('5')) {
    return 'El motor local devolvió un error. Revisa Salud y vuelve a intentarlo.';
  }

  return raw;
}
