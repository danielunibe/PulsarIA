export const MAX_TIKTOK_URL_LENGTH = 2_048;

export type TikTokUrlIssue = 'empty' | 'too_long' | 'malformed' | 'non_https' | 'unsupported_platform';

export function validateTikTokUrl(value: string): { ok: true; normalized: string } | { ok: false; issue: TikTokUrlIssue } {
  const input = value.trim();
  if (!input) return { ok: false, issue: 'empty' };
  if (input.length > MAX_TIKTOK_URL_LENGTH) return { ok: false, issue: 'too_long' };

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, issue: 'malformed' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, issue: 'non_https' };
  if (parsed.username || parsed.password) return { ok: false, issue: 'malformed' };
  const host = parsed.hostname.toLowerCase();
  if (!(host === 'tiktok.com' || host.endsWith('.tiktok.com'))) {
    return { ok: false, issue: 'unsupported_platform' };
  }
  return { ok: true, normalized: input };
}
