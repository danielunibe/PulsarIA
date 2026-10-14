/**
 * Canonical profile-source domain shared by the registration UI and its
 * persistence adapter.  Acquisition metadata is intentionally nullable: a
 * profile can be registered before Pulsaria has discovered anything about it.
 */

export const PROFILE_SOURCE_KEYS = ['posts', 'reposts', 'saved', 'favorites'] as const;

export type ProfileSourceKey = (typeof PROFILE_SOURCE_KEYS)[number];
export type ProfileStatus = 'registering' | 'pending' | 'discovering' | 'ready' | 'error' | 'paused';
export type ProfileSourceSyncState =
  | 'pending'
  | 'idle'
  | 'discovering'
  | 'discovering_recent'
  | 'backfilling'
  | 'syncing'
  | 'paused'
  | 'requires_session'
  | 'requires_auth'
  | 'rate_limited'
  | 'unavailable'
  | 'unsupported'
  | 'error';

export interface ProfileSourceSelection {
  posts: boolean;
  reposts: boolean;
  saved: boolean;
  favorites: boolean;
}

export interface ProfileMetrics {
  following: number | null;
  followers: number | null;
  likes: number | null;
  posts: number | null;
}

export interface ProfileSourceEntry {
  enabled: boolean;
  discoveredCount: number | null;
  syncState: ProfileSourceSyncState;
  errorMessage: string | null;
}

export interface ProfileSourceRules {
  autoEnqueue: boolean;
  ignoreDuplicates: boolean;
}

export interface ProfileSource {
  id: number;
  platform: 'tiktok';
  canonicalUrl: string;
  username: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  verified: boolean | null;
  metrics: ProfileMetrics;
  sources: Record<ProfileSourceKey, ProfileSourceEntry>;
  rules: ProfileSourceRules;
  createdAt: string;
  updatedAt: string;
  status: ProfileStatus;
  scanLimit: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface NormalizedTikTokProfileInput {
  platform: 'tiktok';
  username: string;
  handle: string;
  canonicalUrl: string;
}

export type ProfileInputResult =
  | { ok: true; profile: NormalizedTikTokProfileInput }
  | { ok: false; reason: 'empty' | 'malformed' | 'unsupported_platform' | 'invalid_handle' };

/**
 * Normalizes only profile roots.  Activity paths such as /liked or /video are
 * deliberately rejected because Task 01 registers a profile identity, not a
 * content URL.  Query strings, fragments and a trailing slash do not change
 * the identity.
 */
export function normalizeTikTokProfileInput(value: string): ProfileInputResult {
  let input = value.trim();
  if (!input) return { ok: false, reason: 'empty' };

  let username: string;
  if (input.startsWith('@')) {
    if (/[/:?#]/.test(input)) return { ok: false, reason: 'invalid_handle' };
    username = input.slice(1);
  } else if (!input.includes('/') && !input.includes(':') && !input.includes('?') && !input.includes('#')) {
    // Bare username without @ (e.g. "lua.noctual")
    username = input;
  } else {
    // If protocol was omitted (e.g. "tiktok.com/@usuario"), prepend https://
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = `https://${input}`;
    }
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, reason: 'malformed' };
    if (parsed.username || parsed.password) return { ok: false, reason: 'malformed' };
    const host = parsed.hostname.toLowerCase();
    if (host !== 'tiktok.com' && host !== 'www.tiktok.com') {
      return { ok: false, reason: 'unsupported_platform' };
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) {
      return { ok: false, reason: 'invalid_handle' };
    }
    const segment = segments[0];
    username = segment.startsWith('@') ? segment.slice(1) : segment;
  }

  if (!/^[a-zA-Z0-9._]{1,24}$/.test(username)) {
    return { ok: false, reason: 'invalid_handle' };
  }

  const handle = `@${username}`;
  return {
    ok: true,
    profile: {
      platform: 'tiktok',
      username,
      handle,
      canonicalUrl: `https://www.tiktok.com/${handle}`,
    },
  };
}

export interface PersistedCollectionSourceRecord {
  id: number;
  url: string;
  profile_url: string;
  source_type?: string;
  platform: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  verified?: boolean | null;
  following_count?: number | null;
  followers_count?: number | null;
  likes_count?: number | null;
  posts_count?: number | null;
  active: boolean;
  status: string;
  watch_config_json: string;
  rules_json?: string | null;
  last_sync_summary_json?: string | null;
  discovered_count: number;
  created_at: string;
  updated_at?: string | null;
  history_limit?: number | null;
  last_sync_at?: string | null;
  last_error?: string | null;
}

export interface PersistedProfileChannelRecord {
  kind: string;
  enabled: boolean;
  status: string;
  discovered_count: number;
  last_successful_discovery_at: string | null;
  error_message: string | null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return (JSON.parse(value) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

type BackendWatchConfig = { posts?: boolean; likes?: boolean; favorites?: boolean; saved?: boolean; reposts?: boolean };
type BackendSummary = {
  categories?: Record<string, { discovered?: number; state?: string }>;
};

function sourceState(enabled: boolean, status: string, category: string): ProfileSourceSyncState {
  if (!enabled || status === 'paused') return 'paused';
  if (status === 'checking') return 'discovering';
  if (category === 'requires_session' || category === 'requires_auth' || status === 'needs_auth') return 'requires_session';
  if (category === 'rate_limited') return 'rate_limited';
  if (category === 'unsupported' || category === 'unavailable') return 'unsupported';
  if (category === 'error' || category === 'private') return 'error';
  if (category === 'discovering' || category === 'discovering_recent' || category === 'backfilling') {
    return 'discovering';
  }
  if (category === 'syncing') return 'syncing';
  if (category === 'idle' || category === 'completed_initial_backfill') return 'idle';
  if (status === 'error') return 'error';
  return 'pending';
}

function profileStatus(source: PersistedCollectionSourceRecord): ProfileStatus {
  if (!source.active || source.status === 'paused') return 'paused';
  if (source.status === 'error' || source.status === 'needs_auth') return 'error';
  if (source.status === 'partial') return 'error';
  if (source.status === 'checking') return 'discovering';
  if (source.status === 'pending' || !source.last_sync_at) return 'pending';
  return 'ready';
}

/** Maps the existing collection_sources row into the profile domain model. */
export function toProfileSource(source: PersistedCollectionSourceRecord, channels: PersistedProfileChannelRecord[] = []): ProfileSource {
  const normalized = normalizeTikTokProfileInput(source.profile_url || source.url);
  const fallbackHandle = source.username?.startsWith('@')
    ? source.username
    : source.username
      ? `@${source.username}`
      : '@perfil';
  const handle = normalized.ok ? normalized.profile.handle : fallbackHandle;
  const username = normalized.ok ? normalized.profile.username : handle.replace(/^@/, '');
  const watch = parseJson<BackendWatchConfig>(source.watch_config_json, {});
  const summary = parseJson<BackendSummary | null>(source.last_sync_summary_json, null);
  const status = source.status || 'ready';
  const entries = Object.fromEntries(PROFILE_SOURCE_KEYS.map((key) => {
    const channel = channels.find((item) => item.kind === key);
    const category = summary?.categories?.[key] ?? (key === 'favorites' ? summary?.categories?.likes : undefined);
    const enabled = channel?.enabled ?? Boolean(key === 'favorites' ? watch.likes ?? watch.favorites : watch[key]);
    const state = channel && channel.status === 'idle' && !channel.last_successful_discovery_at
      ? 'pending' : channel?.status ?? category?.state ?? 'pending';
    const count = channel
      ? channel.last_successful_discovery_at ? channel.discovered_count : null
      : typeof category?.discovered === 'number' && ['idle', 'completed_initial_backfill'].includes(state) ? category.discovered : null;
    return [key, { enabled, discoveredCount: count, syncState: sourceState(enabled, status, state), errorMessage: channel?.error_message ?? null }];
  })) as Record<ProfileSourceKey, ProfileSourceEntry>;

  return {
    id: source.id,
    platform: 'tiktok',
    canonicalUrl: normalized.ok ? normalized.profile.canonicalUrl : source.profile_url || source.url,
    username,
    handle,
    displayName: source.display_name ?? null,
    avatarUrl: source.avatar_url ?? null,
    coverUrl: source.cover_url ?? null,
    verified: source.verified ?? null,
    metrics: {
      following: source.following_count ?? null,
      followers: source.followers_count ?? null,
      likes: source.likes_count ?? null,
      posts: source.posts_count ?? null,
    },
    sources: entries,
    rules: {
      autoEnqueue: (() => {
        const rawRules = parseJson<{ auto_enqueue?: boolean; autoEnqueue?: boolean }>(source.rules_json, {});
        return rawRules.auto_enqueue ?? rawRules.autoEnqueue ?? true;
      })(),
      ignoreDuplicates: (() => {
        const rawRules = parseJson<{ ignore_duplicates?: boolean; ignoreDuplicates?: boolean }>(source.rules_json, {});
        return rawRules.ignore_duplicates ?? rawRules.ignoreDuplicates ?? true;
      })(),
    },
    createdAt: source.created_at,
    updatedAt: source.updated_at || source.created_at,
    status: profileStatus(source),
    scanLimit: source.history_limit ?? 0,
    lastSyncAt: source.last_sync_at ?? null,
    lastError: source.last_error ?? null,
  };
}

/** Provider boundary for a future authorized TikTok metadata adapter. */
export interface TikTokProfileMetadataProvider {
  getProfileMetadata(profile: Pick<ProfileSource, 'canonicalUrl' | 'handle'>): Promise<Partial<Pick<ProfileSource, 'displayName' | 'avatarUrl' | 'coverUrl' | 'verified' | 'metrics'>>>;
}
