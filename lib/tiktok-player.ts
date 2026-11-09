/** Official TikTok embed URL; only canonical video identities are accepted. */
export function tiktokPlayerUrl(originalUrl: string | undefined): string | null {
  if (!originalUrl) return null;
  try {
    const url = new URL(originalUrl);
    if (url.protocol !== 'https:' || url.username || url.password
      || !['www.tiktok.com', 'tiktok.com'].includes(url.hostname) || url.port) return null;
    const match = url.pathname.match(/^\/@[a-zA-Z0-9._]{1,24}\/video\/(\d+)\/?$/);
    if (!match) return null;
    return `https://www.tiktok.com/player/v1/${match[1]}?controls=1&autoplay=1&loop=0&rel=0`;
  } catch { return null; }
}

export function isTikTokPlayerMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, frameWindow: Window | null | undefined): boolean {
  return Boolean(frameWindow && event.source === frameWindow && event.origin === 'https://www.tiktok.com'
    && event.data && typeof event.data === 'object' && event.data['x-tiktok-player'] === true);
}
