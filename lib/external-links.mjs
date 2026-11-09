const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'm.tiktok.com',
]);

const LEGAL_GITHUB_PATHS = new Set([
  '/danielunibe/PulsarIA/blob/main/EULA.es.md',
  '/danielunibe/PulsarIA/blob/main/EULA.en.md',
  '/danielunibe/PulsarIA/blob/main/TERMS_OF_USE.es.md',
  '/danielunibe/PulsarIA/blob/main/TERMS_OF_USE.en.md',
  '/danielunibe/PulsarIA/blob/main/PRIVACY.es.md',
  '/danielunibe/PulsarIA/blob/main/PRIVACY.en.md',
  '/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.es.md',
  '/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.en.md',
  '/danielunibe/PulsarIA/blob/main/SECURITY.md',
]);

export function trustedExternalUrl(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const authority = value.split('://', 2)[1]?.split(/[/?#]/, 1)[0] ?? '';
    if (url.protocol !== 'https:' || url.username || url.password
      || authority.includes('@') || authority.includes(':')) return null;
    if (TIKTOK_HOSTS.has(url.hostname)) return url.href;
    if (url.hostname === 'github.com' && !url.search && !url.hash && LEGAL_GITHUB_PATHS.has(url.pathname)) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function isNativeShell() {
  return typeof window !== 'undefined'
    && ('__TAURI_INTERNALS__' in window
      || window.location.protocol === 'tauri:'
      || window.location.hostname === 'tauri.localhost');
}

export async function openTrustedExternalUrl(value) {
  const url = trustedExternalUrl(value);
  if (!url || typeof window === 'undefined') return false;

  if (isNativeShell()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url });
      return true;
    } catch {
      return false;
    }
  }

  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}
