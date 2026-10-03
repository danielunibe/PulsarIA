'use client';

import { useCallback, useEffect, useState, type ElementType, type FormEvent } from 'react';
import { toast } from 'sonner';
import { isTauriRuntime } from '@/hooks/use-processing-settings';
import {
  FaBolt,
  FaBookmark,
  FaCheck,
  FaDownload,
  FaEllipsisVertical,
  FaGear,
  FaHeart,
  FaInfo,
  FaPause,
  FaPlay,
  FaRotate,
  FaTableCells,
  FaTrash,
  FaTriangleExclamation,
  FaUser,
  FaXmark,
} from '@/components/icon-library';
import {
  PROFILE_SOURCE_KEYS,
  normalizeTikTokProfileInput,
  toProfileSource,
  type PersistedCollectionSourceRecord,
  type ProfileSource,
  type ProfileSourceEntry,
  type ProfileSourceKey,
  type ProfileSourceSelection,
} from '@/lib/profile-source';
import { TikTokIcon } from './Header';

const EMPTY_SELECTION: ProfileSourceSelection = {
  posts: true,
  reposts: false,
  saved: false,
  favorites: false,
};

const SOURCE_META: Record<ProfileSourceKey, { label: string; icon: ElementType }> = {
  posts: { label: 'Publicaciones', icon: FaTableCells },
  reposts: { label: 'Reposts', icon: FaRotate },
  saved: { label: 'Guardados', icon: FaBookmark },
  favorites: { label: 'Favoritos', icon: FaHeart },
};

interface RegisterProfileSourceResult {
  source: PersistedCollectionSourceRecord;
  duplicate: boolean;
}

interface ConnectedProfileCardProps {
  profile: ProfileSource;
  selected: boolean;
  editing: boolean;
  selection: ProfileSourceSelection;
  editingAutoEnqueue: boolean;
  busy: boolean;
  syncing?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onToggle: (key: ProfileSourceKey) => void;
  onToggleEditingAutoEnqueue: (autoEnqueue: boolean) => void;
  onToggleAutoEnqueue: () => void;
  onSave: () => void;
  onSync?: () => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

function copySelection(selection: ProfileSourceSelection): ProfileSourceSelection {
  return { ...selection };
}

function selectionFromProfile(profile: ProfileSource): ProfileSourceSelection {
  return {
    posts: profile.sources.posts.enabled,
    reposts: profile.sources.reposts.enabled,
    saved: profile.sources.saved.enabled,
    favorites: profile.sources.favorites.enabled,
  };
}

function formatCount(value: number | null): string {
  return value === null ? '…' : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function sourceStateLabel(entry: ProfileSourceEntry): string {
  switch (entry.syncState) {
    case 'paused':
      return 'Pausada';
    case 'discovering':
    case 'discovering_recent':
    case 'backfilling':
      return 'Descubriendo';
    case 'syncing':
      return 'Sincronizando';
    case 'requires_session':
    case 'requires_auth':
      return 'Requiere sesión';
    case 'rate_limited':
      return 'Reintentando';
    case 'unavailable':
    case 'unsupported':
      return 'No disponible';
    case 'error':
      return 'Error';
    default:
      return entry.enabled ? 'Lista' : 'Pausada';
  }
}

function profileStatusLabel(profile: ProfileSource): string {
  switch (profile.status) {
    case 'paused':
      return 'Perfil pausado';
    case 'error':
      return 'Requiere atención';
    case 'registering':
      return 'Registrando';
    default:
      return 'Perfil listo';
  }
}

function ConnectedProfileCard({
  profile,
  selected,
  editing,
  selection,
  editingAutoEnqueue,
  busy,
  syncing,
  onSelect,
  onEdit,
  onCancelEdit,
  onToggle,
  onToggleEditingAutoEnqueue,
  onToggleAutoEnqueue,
  onSave,
  onSync,
  onToggleActive,
  onDelete,
}: ConnectedProfileCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`.profile-source-card[data-profile-id="${profile.id}"] .profile-source-menu-wrapper`)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, profile.id]);

  return (
    <article className={'profile-source-card ' + (selected ? 'is-selected' : '')} data-profile-id={profile.id}>
      <div
        className={'profile-source-cover ' + (profile.coverUrl ? 'has-cover' : '')}
        style={profile.coverUrl ? { backgroundImage: 'url("' + profile.coverUrl + '")' } : undefined}
        aria-label={profile.coverUrl ? 'Portada del perfil' : 'Portada pendiente'}
        role="img"
      >
        {!profile.coverUrl && <span>Portada pendiente</span>}
      </div>

      <div className="profile-source-body">
        <div className="profile-source-identity-row">
          <span className="profile-source-avatar" aria-label={profile.avatarUrl ? 'Avatar del perfil' : 'Avatar pendiente'}>
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" />
            ) : (
              <span aria-hidden="true">@</span>
            )}
          </span>
          <div className="profile-source-identity">
            <div className="profile-source-name-line">
              <strong>{profile.displayName || 'Nombre pendiente'}</strong>
              {profile.verified === true && (
                <span className="profile-source-verified" aria-label="Cuenta verificada" title="Cuenta verificada">
                  <FaCheck size={11} aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="profile-source-handle-row">
              <span>{profile.handle}</span>
              <span
                className={'profile-source-mode-pill ' + (profile.rules.autoEnqueue ? 'is-download' : 'is-streaming')}
                title={
                  profile.rules.autoEnqueue
                    ? 'Descarga a disco activa: Los nuevos videos se descargarán a tu disco local en segundo plano.'
                    : 'Modo Streaming activo: Los videos se transmiten sin saturar el disco; la descarga física es bajo demanda.'
                }
              >
                {profile.rules.autoEnqueue ? (
                  <>
                    <FaDownload size={9} aria-hidden="true" />
                    <span>Descarga auto</span>
                  </>
                ) : (
                  <>
                    <FaBolt size={9} aria-hidden="true" />
                    <span>Streaming</span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="profile-source-actions-group">
            <button
              type="button"
              className="profile-source-edit-button"
              onClick={editing ? onCancelEdit : onEdit}
              aria-expanded={editing}
              aria-controls={'profile-source-settings-' + profile.id}
              title={editing ? 'Cerrar configuración' : 'Editar configuración'}
            >
              {editing ? <FaXmark size={13} aria-hidden="true" /> : <FaGear size={13} aria-hidden="true" />}
              <span>{editing ? 'Cerrar' : 'Editar configuración'}</span>
            </button>

            <div className="profile-source-menu-wrapper">
              <button
                type="button"
                className={'profile-source-more-button ' + (menuOpen ? 'is-open' : '')}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label={'Opciones de configuración para ' + profile.handle}
                title="Más opciones de configuración"
              >
                <FaEllipsisVertical size={15} aria-hidden="true" />
              </button>

              {menuOpen && (
                <div className="profile-source-dropdown-menu" role="menu">
                  <div className="profile-source-dropdown-header">
                    <span>MODO DE DESCARGA / INGESTIÓN</span>
                  </div>
                  <button
                    type="button"
                    className="profile-source-dropdown-item mode-toggle-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleAutoEnqueue();
                    }}
                    disabled={busy}
                  >
                    <div className="profile-source-dropdown-item-content">
                      <span className="profile-source-dropdown-item-icon">
                        {profile.rules.autoEnqueue ? (
                          <FaBolt size={14} aria-hidden="true" />
                        ) : (
                          <FaDownload size={14} aria-hidden="true" />
                        )}
                      </span>
                      <div className="profile-source-dropdown-item-text">
                        <strong>
                          {profile.rules.autoEnqueue
                            ? 'Activar Modo Streaming'
                            : 'Activar Descarga automática'}
                        </strong>
                        <small>
                          {profile.rules.autoEnqueue
                            ? 'Reproduce en directo sin ocupar almacenamiento masivo; descarga solo bajo demanda.'
                            : 'Descarga videos a tu disco en segundo plano automáticamente.'}
                        </small>
                      </div>
                    </div>
                  </button>

                  <div className="profile-source-dropdown-divider" role="separator" />

                  {onSync && (
                    <button
                      type="button"
                      className="profile-source-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onSync();
                      }}
                      disabled={busy || syncing}
                    >
                      <FaRotate size={12} className={syncing ? 'source-spin' : ''} aria-hidden="true" />
                      <span>{syncing ? 'Sincronizando fuentes…' : 'Sincronizar ahora'}</span>
                    </button>
                  )}

                  {onToggleActive && (
                    <button
                      type="button"
                      className="profile-source-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleActive();
                      }}
                      disabled={busy}
                    >
                      {profile.status === 'paused' ? (
                        <>
                          <FaPlay size={12} aria-hidden="true" />
                          <span>Reanudar monitoreo</span>
                        </>
                      ) : (
                        <>
                          <FaPause size={12} aria-hidden="true" />
                          <span>Pausar monitoreo</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="profile-source-dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                    disabled={busy}
                  >
                    <FaGear size={12} aria-hidden="true" />
                    <span>Ajustar fuentes y filtros…</span>
                  </button>

                  {onDelete && (
                    <>
                      <div className="profile-source-dropdown-divider" role="separator" />
                      <button
                        type="button"
                        className="profile-source-dropdown-item is-danger"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete();
                        }}
                        disabled={busy}
                      >
                        <FaTrash size={12} aria-hidden="true" />
                        <span>Desenlazar perfil</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="profile-source-metrics" role="list" aria-label="Métricas conocidas del perfil">
          {([
            ['following', 'Siguiendo', profile.metrics.following],
            ['followers', 'Seguidores', profile.metrics.followers],
            ['likes', 'Me gusta', profile.metrics.likes],
          ] as const).map(([key, label, value]) => (
            <div className="profile-source-metric" key={key} role="listitem">
              <strong>{formatCount(value)}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="profile-source-section-label">
          <span>Fuentes internas</span>
          <span className="profile-source-known-note">Los datos aparecen cuando estén disponibles</span>
        </div>
        <div className="profile-source-grid" role="list" aria-label={'Fuentes de ' + profile.handle}>
          {PROFILE_SOURCE_KEYS.map((key) => {
            const meta = SOURCE_META[key];
            const entry = profile.sources[key];
            const Icon = meta.icon;
            return (
              <div className={'profile-source-entry ' + (entry.enabled ? 'is-enabled' : 'is-paused')} key={key} role="listitem">
                <span className="profile-source-entry-icon"><Icon size={14} aria-hidden="true" /></span>
                <span className="profile-source-entry-copy">
                  <strong>{meta.label}</strong>
                  <span>{sourceStateLabel(entry)}</span>
                </span>
                <b aria-label={meta.label + ': ' + (entry.discoveredCount === null ? 'pendiente' : entry.discoveredCount)}>
                  {entry.syncState === 'requires_session' || entry.syncState === 'requires_auth'
                    ? 'Requiere sesión'
                    : entry.syncState === 'unsupported' || entry.syncState === 'unavailable'
                    ? 'No disponible'
                    : entry.syncState === 'rate_limited'
                    ? 'Reintentando'
                    : formatCount(entry.discoveredCount)}
                </b>
              </div>
            );
          })}
        </div>

        {editing && (
          <div className="profile-source-settings" id={'profile-source-settings-' + profile.id}>
            <div className="profile-source-mode-section">
              <div className="profile-source-settings-heading">
                <span>Modo de almacenamiento y descarga</span>
                <span className="profile-source-mode-badge-hint">
                  {editingAutoEnqueue ? 'Descarga a disco' : 'Streaming primero'}
                </span>
              </div>
              <div className="profile-source-mode-toggle-group" role="group" aria-label="Modo de almacenamiento">
                <button
                  type="button"
                  className={'profile-source-mode-btn ' + (!editingAutoEnqueue ? 'is-active' : '')}
                  onClick={() => onToggleEditingAutoEnqueue(false)}
                  disabled={busy}
                  aria-pressed={!editingAutoEnqueue}
                >
                  <FaBolt size={14} aria-hidden="true" />
                  <div>
                    <strong>Streaming primero</strong>
                    <small>Reproduce sin saturar disco; descarga solo bajo demanda.</small>
                  </div>
                </button>
                <button
                  type="button"
                  className={'profile-source-mode-btn ' + (editingAutoEnqueue ? 'is-active' : '')}
                  onClick={() => onToggleEditingAutoEnqueue(true)}
                  disabled={busy}
                  aria-pressed={editingAutoEnqueue}
                >
                  <FaDownload size={14} aria-hidden="true" />
                  <div>
                    <strong>Descarga a disco</strong>
                    <small>Guarda archivos de video a disco en segundo plano automáticamente.</small>
                  </div>
                </button>
              </div>
            </div>

            <div className="profile-source-settings-heading">
              <span>Selecciona qué fuentes conservar activas</span>
              <span>{PROFILE_SOURCE_KEYS.filter((key) => selection[key]).length} de {PROFILE_SOURCE_KEYS.length}</span>
            </div>
            <div className="profile-source-settings-grid" role="group" aria-label="Editar fuentes del perfil">
              {PROFILE_SOURCE_KEYS.map((key) => {
                const meta = SOURCE_META[key];
                const Icon = meta.icon;
                const enabled = selection[key];
                return (
                  <button
                    type="button"
                    className={'profile-source-setting ' + (enabled ? 'is-enabled' : '')}
                    key={key}
                    aria-pressed={enabled}
                    disabled={busy}
                    onClick={() => onToggle(key)}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{meta.label}</span>
                    <small>{enabled ? 'Activa' : 'Pausada'}</small>
                  </button>
                );
              })}
            </div>
            <div className="profile-source-settings-actions">
              <button type="button" onClick={onCancelEdit} disabled={busy}>Cancelar</button>
              <button type="button" className="profile-source-save-button" onClick={onSave} disabled={busy}>
                <FaCheck size={13} aria-hidden="true" />
                {busy ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        )}

        <div className="profile-source-footer">
          <span className={'profile-source-status status-' + profile.status}><i aria-hidden="true" />{profileStatusLabel(profile)}</span>
          <span>{profile.displayName || profile.avatarUrl || profile.metrics.followers !== null ? 'Metadata verificada' : 'Metadata pendiente'}</span>
          {onSync && (
            <button
              type="button"
              className="profile-source-sync-button"
              onClick={onSync}
              disabled={busy || syncing}
              title="Sincronizar fuentes ahora"
            >
              <FaRotate size={11} className={syncing ? 'source-spin' : ''} aria-hidden="true" />
              <span>{syncing ? 'Sincronizando…' : 'Sincronizar'}</span>
            </button>
          )}
          <button type="button" className="profile-source-focus-button" onClick={onSelect} aria-pressed={selected}>
            {selected ? 'Seleccionado' : 'Seleccionar'}
          </button>
        </div>
      </div>
    </article>
  );
}

export function TikTokSourcesPanel() {
  const [profiles, setProfiles] = useState<ProfileSource[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profileInput, setProfileInput] = useState('');
  const [selection, setSelection] = useState<ProfileSourceSelection>(copySelection(EMPTY_SELECTION));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSelection, setEditingSelection] = useState<ProfileSourceSelection>(copySelection(EMPTY_SELECTION));
  const [editingAutoEnqueue, setEditingAutoEnqueue] = useState(true);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const native = isTauriRuntime();

  const refreshProfiles = useCallback(async () => {
    if (!native) {
      setLoading(false);
      return;
    }
    try {
      const records = await invokeNative<PersistedCollectionSourceRecord[]>('get_collection_sources');
      setProfiles(records
        .filter((record) => record.platform === 'tiktok' && record.source_type === 'profile')
        .map(toProfileSource));
      setFormError(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No se pudieron cargar los perfiles conectados.');
    } finally {
      setLoading(false);
    }
  }, [native]);

  const syncProfile = useCallback(async (profileId: number) => {
    if (syncingId !== null || !native) return;
    setSyncingId(profileId);
    try {
      toast.info('Sincronizando fuentes del perfil…');
      await invokeNative('sync_collection_source_now', { sourceId: profileId });
      await refreshProfiles();
      toast.success('Sincronización completada');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error(`Error sincronizando perfil: ${message}`);
    } finally {
      setSyncingId(null);
    }
  }, [native, refreshProfiles, syncingId]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (!native) return;
    let unlistenSync: (() => void) | undefined;
    let unlistenMeta: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenItem: (() => void) | undefined;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenSync = await listen('tiktok_source_sync_completed', () => {
          void refreshProfiles();
        });
        unlistenMeta = await listen('tiktok_source_metadata_updated', () => {
          void refreshProfiles();
        });
        unlistenStatus = await listen('tiktok_source_channel_status_changed', () => {
          void refreshProfiles();
        });
        unlistenItem = await listen('tiktok_source_item_discovered', () => {
          void refreshProfiles();
        });
      } catch {
        // Event system fallback
      }
    };
    void setup();
    return () => {
      unlistenSync?.();
      unlistenMeta?.();
      unlistenStatus?.();
      unlistenItem?.();
    };
  }, [native, refreshProfiles]);

  useEffect(() => {
    if (selectedId !== null && !profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(null);
    }
    if (editingId !== null && !profiles.some((profile) => profile.id === editingId)) {
      setEditingId(null);
    }
  }, [editingId, profiles, selectedId]);

  function toggleRegistrationSource(key: ProfileSourceKey) {
    setSelection((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleAllRegistrationSources() {
    const allEnabled = PROFILE_SOURCE_KEYS.every((key) => selection[key]);
    setSelection({
      posts: !allEnabled,
      reposts: !allEnabled,
      saved: !allEnabled,
      favorites: !allEnabled,
    });
  }

  async function registerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registering) return;
    setFormMessage(null);
    setFormError(null);
    const normalized = normalizeTikTokProfileInput(profileInput);
    if (!normalized.ok) {
      setFormError('Introduce una URL de perfil TikTok o un handle @usuario válido.');
      return;
    }
    if (!PROFILE_SOURCE_KEYS.some((key) => selection[key])) {
      setFormError('Selecciona al menos una fuente del perfil.');
      return;
    }
    if (!native) {
      setFormError('La persistencia de perfiles requiere abrir Pulsaria en el shell Tauri.');
      return;
    }

    setRegistering(true);
    try {
      const result = await invokeNative<RegisterProfileSourceResult>('register_profile_source', {
        input: {
          profileUrl: normalized.profile.canonicalUrl,
          selectedSources: selection,
        },
      });
      const profile = toProfileSource(result.source);
      setProfiles((current) => {
        const next = current.some((item) => item.id === profile.id)
          ? current.map((item) => item.id === profile.id ? profile : item)
          : [...current, profile];
        return next.sort((a, b) => a.id - b.id);
      });
      setSelectedId(profile.id);
      setProfileInput('');
      if (result.duplicate) {
        setFormMessage('Este perfil ya está conectado. Se seleccionó la tarjeta existente.');
        toast.info('Este perfil ya está conectado.');
      } else {
        setFormMessage('Perfil registrado y configuración guardada.');
        toast.success('Perfil TikTok registrado');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setFormError(message);
      toast.error(message);
    } finally {
      setRegistering(false);
    }
  }

  function beginEdit(profile: ProfileSource) {
    setEditingId(profile.id);
    setEditingSelection(selectionFromProfile(profile));
    setEditingAutoEnqueue(profile.rules.autoEnqueue);
    setSelectedId(profile.id);
  }

  function toggleEditingSource(key: ProfileSourceKey) {
    setEditingSelection((current) => ({ ...current, [key]: !current[key] }));
  }

  const toggleAutoEnqueue = useCallback(
    async (profile: ProfileSource) => {
      if (!native || savingId !== null) return;
      const targetAutoEnqueue = !profile.rules.autoEnqueue;
      setSavingId(profile.id);
      try {
        await invokeNative('set_profile_auto_enqueue', {
          sourceId: profile.id,
          autoEnqueue: targetAutoEnqueue,
        });
        setProfiles((current) =>
          current.map((item) =>
            item.id === profile.id
              ? {
                  ...item,
                  rules: {
                    ...item.rules,
                    autoEnqueue: targetAutoEnqueue,
                  },
                }
              : item
          )
        );
        if (targetAutoEnqueue) {
          toast.success(`Descarga a disco activada para ${profile.handle}: los videos se guardarán localmente.`);
        } else {
          toast.success(`Modo Streaming activado para ${profile.handle}: los videos se reproducirán en directo sin descargarse a disco.`);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        toast.error(`Error al cambiar modo de descarga: ${message}`);
      } finally {
        setSavingId(null);
      }
    },
    [native, savingId]
  );

  const toggleActive = useCallback(
    async (profile: ProfileSource) => {
      if (!native || savingId !== null) return;
      const nextActive = profile.status === 'paused';
      setSavingId(profile.id);
      try {
        await invokeNative('set_collection_source_active', {
          sourceId: profile.id,
          active: nextActive,
        });
        setProfiles((current) =>
          current.map((item) =>
            item.id === profile.id
              ? {
                  ...item,
                  status: nextActive ? 'ready' : 'paused',
                }
              : item
          )
        );
        toast.success(nextActive ? `Monitoreo reanudado para ${profile.handle}` : `Monitoreo pausado para ${profile.handle}`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        toast.error(`Error al actualizar estado del perfil: ${message}`);
      } finally {
        setSavingId(null);
      }
    },
    [native, savingId]
  );

  const deleteProfile = useCallback(
    async (profile: ProfileSource) => {
      if (!native || savingId !== null) return;
      const confirmed = window.confirm(
        `¿Deseas desenlazar ${profile.handle}? Se conservarán los archivos ya descargados pero se detendrá la sincronización.`
      );
      if (!confirmed) return;
      setSavingId(profile.id);
      try {
        await invokeNative('delete_collection_source', { sourceId: profile.id });
        setProfiles((current) => current.filter((item) => item.id !== profile.id));
        if (selectedId === profile.id) setSelectedId(null);
        if (editingId === profile.id) setEditingId(null);
        toast.success(`Perfil ${profile.handle} desenlazado.`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        toast.error(`Error al desenlazar perfil: ${message}`);
      } finally {
        setSavingId(null);
      }
    },
    [editingId, native, savingId, selectedId]
  );

  async function saveProfileSettings() {
    if (editingId === null || savingId !== null || !native) return;
    setSavingId(editingId);
    setFormError(null);
    try {
      const source = await invokeNative<PersistedCollectionSourceRecord>('update_profile_source_settings', {
        sourceId: editingId,
        input: {
          selectedSources: editingSelection,
          autoEnqueue: editingAutoEnqueue,
        },
      });
      const profile = toProfileSource(source);
      setProfiles((current) => current.map((item) => (item.id === profile.id ? profile : item)));
      setEditingId(null);
      setFormMessage('Configuración del perfil guardada.');
      toast.success('Configuración guardada');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setFormError(message);
      toast.error(message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="sources-panel" aria-label="Registro canónico de perfiles TikTok">
      <form className="source-profile-card" onSubmit={registerProfile} aria-label="Registrar perfil de TikTok">
        <header className="source-profile-head">
          <span className="source-profile-glyph" aria-hidden="true"><TikTokIcon size={13} /></span>
          <h3>Perfil de TikTok</h3>
          <span className="source-profile-head-spacer" aria-hidden="true" />
          <button type="button" className="source-profile-select-all" onClick={toggleAllRegistrationSources} disabled={registering}>
            {PROFILE_SOURCE_KEYS.every((key) => selection[key]) ? 'Limpiar' : 'Seleccionar todo'}
          </button>
        </header>

        <label className="source-profile-field" htmlFor="tiktok-profile-input">
          <span className="source-profile-at" aria-hidden="true"><FaUser size={14} /></span>
          <input
            id="tiktok-profile-input"
            aria-label="URL de perfil o nombre de usuario de TikTok"
            aria-describedby="tiktok-profile-input-help tiktok-profile-sync-note"
            type="text"
            value={profileInput}
            onChange={(event) => setProfileInput(event.target.value)}
            placeholder="URL de perfil o @usuario"
            autoComplete="off"
            spellCheck={false}
            disabled={registering}
          />
        </label>
        <p id="tiktok-profile-input-help" className="source-profile-help">Pega una URL o @usuario</p>
        <p id="tiktok-profile-sync-note" className="source-profile-sync-note" role="note">
          Al registrar el perfil, Pulsaria consulta las pestañas activas. Mientras Pulsaria esté abierta,
          revisa esas fuentes cada 15 minutos y añade a tu cola el contenido nuevo que cumpla las reglas.
          Puedes pausar el perfil en Ajustes.
        </p>

        <div className="source-profile-cap">
          <span>Pestañas del perfil a procesar</span>
          <span>{PROFILE_SOURCE_KEYS.filter((key) => selection[key]).length} de {PROFILE_SOURCE_KEYS.length}</span>
        </div>
        <div className="source-profile-grid" role="group" aria-label="Fuentes a registrar">
          {PROFILE_SOURCE_KEYS.map((key) => {
            const meta = SOURCE_META[key];
            const Icon = meta.icon;
            const enabled = selection[key];
            return (
              <button
                type="button"
                className={'source-profile-category source-profile-category-' + (key === 'favorites' ? 'likes' : key)}
                key={key}
                aria-pressed={enabled}
                disabled={registering}
                onClick={() => toggleRegistrationSource(key)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{meta.label}</span>
                <small>{enabled ? 'Activa' : 'Pausada'}</small>
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          className={'source-profile-cta ' + (profileInput.trim() && PROFILE_SOURCE_KEYS.some((key) => selection[key]) ? 'ready' : '')}
          disabled={registering || !profileInput.trim() || !PROFILE_SOURCE_KEYS.some((key) => selection[key])}
        >
          <FaCheck size={14} aria-hidden="true" />
          {registering ? 'Registrando…' : 'EXTRAER SELECCIÓN'}
        </button>
        {formMessage && <p className="source-form-message" role="status">{formMessage}</p>}
        {formError && <p className="source-form-error" role="alert"><FaTriangleExclamation size={14} aria-hidden="true" />{formError}</p>}
      </form>

      <div className="sources-list-heading">
        <div>
          <span className="source-eyebrow">REGISTRO CANÓNICO</span>
          <h3>Perfiles conectados</h3>
        </div>
        <span className="sources-count">{profiles.length}</span>
      </div>

      {loading ? (
        <div className="sources-empty"><FaRotate className="source-spin" size={17} aria-hidden="true" /><span>Cargando perfiles persistidos…</span></div>
      ) : profiles.length === 0 ? (
        <div className="sources-empty">
          <FaInfo size={17} aria-hidden="true" />
          <div><strong>Aún no hay fuentes conectadas</strong><span>Registra un perfil para que aparezca aquí.</span></div>
        </div>
      ) : (
        <div className="sources-cards">
          {profiles.map((profile) => (
            <ConnectedProfileCard
              key={profile.id}
              profile={profile}
              selected={selectedId === profile.id}
              editing={editingId === profile.id}
              selection={editingSelection}
              editingAutoEnqueue={editingAutoEnqueue}
              busy={savingId === profile.id}
              syncing={syncingId === profile.id}
              onSelect={() => setSelectedId(profile.id)}
              onEdit={() => beginEdit(profile)}
              onCancelEdit={() => setEditingId(null)}
              onToggle={toggleEditingSource}
              onToggleEditingAutoEnqueue={(val) => setEditingAutoEnqueue(val)}
              onToggleAutoEnqueue={() => void toggleAutoEnqueue(profile)}
              onSave={() => void saveProfileSettings()}
              onSync={() => void syncProfile(profile.id)}
              onToggleActive={() => void toggleActive(profile)}
              onDelete={() => void deleteProfile(profile)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
