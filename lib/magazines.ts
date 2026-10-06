/**
 * Revistas / Tomos Inteligentes — tipos espejo del contrato editorial Rust
 * (`src-tauri/src/domain/editorial.rs`) y acceso IPC.
 *
 * El backend es la única autoridad de persistencia (SQLite). Este módulo no
 * escribe nada por su cuenta: solo mapea registros snake_case a
 * presentación camelCase y envuelve `invoke` con detección de shell nativo,
 * siguiendo el patrón de `VideoGrid` (IPC con fallback, sin credenciales
 * inventadas en modo navegador).
 */

/** Registro de tomo tal como lo serializa el backend (snake_case). */
export interface MagazineVolumeRecord {
  id: string;
  volume_number: string;
  title: string;
  subtitle: string;
  category: string;
  description: string;
  color: string;
  accent_glow: string;
  spine_gradient: string;
  cover_gradient: string;
  hero_frame_path: string | null;
  editorial_state: string;
  article_count: number;
  source_count: number;
  created_at: string;
  updated_at: string;
}

/** Registro de artículo tal como lo serializa el backend (snake_case). */
export interface MagazineArticleRecord {
  id: string;
  volume_id: string;
  chapter_id: number | null;
  title: string;
  article_type: string;
  summary: string;
  structured_content_json: string;
  editorial_state: string;
  active_version: number;
  hero_frame_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Propuesta editorial de un nuevo tomo sugerido por el motor editorial (no persistido en magazine_volumes). */
export interface NewVolumeCandidate {
  suggested_title: string;
  rationale: string;
  suggested_category: string;
  suggested_chapter?: string | null;
  supporting_job_ids: number[];
  confidence?: number | null;
}

/** Tomo listo para presentar en el librero. */
export interface MagazineVolumeView {
  id: string;
  volumeNumber: string;
  title: string;
  subtitle: string;
  category: string;
  color: string;
  accentGlow: string;
  spineGradient: string;
  coverGradient: string;
  articleCount: number;
  videoCount: number;
  editorialState: string;
  description: string;
  updatedAt: string;
}

const FALLBACK_GRADIENTS: Record<string, { spine: string; cover: string; color: string }> = {
  recipes: {
    color: '#ff9a3c',
    spine: 'linear-gradient(180deg, #d35400 0%, #78281f 100%)',
    cover: 'linear-gradient(145deg, #1e130c 0%, #120b07 100%)',
  },
  tech: {
    color: '#38bdf8',
    spine: 'linear-gradient(180deg, #0284c7 0%, #082f49 100%)',
    cover: 'linear-gradient(145deg, #091524 0%, #050b14 100%)',
  },
  guides: {
    color: '#34d399',
    spine: 'linear-gradient(180deg, #059669 0%, #064e3b 100%)',
    cover: 'linear-gradient(145deg, #091f16 0%, #05100c 100%)',
  },
  lifestyle: {
    color: '#a855f7',
    spine: 'linear-gradient(180deg, #7e22ce 0%, #3b0764 100%)',
    cover: 'linear-gradient(145deg, #190c24 0%, #0d0614 100%)',
  },
};

/** Visual editorial por categoría cuando el registro no trae uno propio. */
function fallbackVisual(category: string): { color: string; spine: string; cover: string } {
  const known = FALLBACK_GRADIENTS[category];
  if (known) return { color: known.color, spine: known.spine, cover: known.cover };
  return {
    color: '#94a3b8',
    spine: 'linear-gradient(180deg, #475569 0%, #0f172a 100%)',
    cover: 'linear-gradient(145deg, #111827 0%, #030712 100%)',
  };
}

/** Mapea un registro SQLite a la vista del librero. */
export function toMagazineVolumeView(record: MagazineVolumeRecord): MagazineVolumeView {
  const visual = fallbackVisual(record.category);
  return {
    id: record.id,
    volumeNumber: record.volume_number,
    title: record.title,
    subtitle: record.subtitle,
    category: record.category,
    color: record.color || visual.color,
    accentGlow:
      record.accent_glow || 'rgba(148, 163, 184, 0.35)',
    spineGradient: record.spine_gradient || visual.spine,
    coverGradient: record.cover_gradient || visual.cover,
    articleCount: record.article_count,
    videoCount: record.source_count,
    editorialState: record.editorial_state,
    description: record.description,
    updatedAt: record.updated_at,
  };
}

/** Etiqueta legible de un estado editorial para la interfaz. */
export function presentEditorialState(state: string): string {
  switch (state) {
    case 'draft':
      return 'Borrador';
    case 'processing':
      return 'Procesando';
    case 'published':
      return 'Publicado';
    case 'updating':
      return 'Actualizando';
    case 'requires_review':
      return 'Requiere revisión';
    case 'failed':
      return 'Falló';
    case 'archived':
      return 'Archivado';
    default:
      return state;
  }
}

/** Filtra tomos por texto libre (título, subtítulo, categoría, descripción). */
export function filterMagazineVolumes(
  volumes: MagazineVolumeView[],
  query: string,
): MagazineVolumeView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return volumes;
  return volumes.filter((volume) =>
    [volume.title, volume.subtitle, volume.category, volume.description, volume.volumeNumber]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}

/**
 * Lee los tomos desde el backend nativo. Rechaza fuera del shell Tauri para
 * que la vista pueda mostrar vista previa sin inventar datos de biblioteca.
 */
export async function fetchMagazineVolumes(): Promise<MagazineVolumeView[]> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const records = await invoke<MagazineVolumeRecord[]>('get_magazine_volumes');
  return records.map(toMagazineVolumeView);
}

/** Lee los artículos de un tomo desde el backend nativo. */
export async function fetchMagazineArticles(
  volumeId: string,
): Promise<MagazineArticleRecord[]> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<MagazineArticleRecord[]>('get_magazine_articles', { volumeId });
}

/** Registro de compilación tal como lo serializa el backend (snake_case). */
export interface MagazineCompilationRecord {
  id: number;
  volume_id: string;
  status: string;
  progress: number;
  message: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

/** Resultado del pipeline editorial tal como lo serializa el backend. */
export interface CompilationOutcome {
  compilation_id: number;
  status: string;
  article_id: string | null;
  version: number | null;
  conflict_count: number;
  unchanged: boolean;
  message: string;
  candidate?: NewVolumeCandidate | null;
}

/** Etiqueta legible de un estado de compilación para la interfaz. */
export function presentCompilationState(status: string): string {
  switch (status) {
    case 'queued':
      return 'En cola';
    case 'processing':
      return 'Compilando';
    case 'completed':
      return 'Estable';
    case 'failed':
      return 'Falló';
    case 'cancelled':
      return 'Cancelada';
    case 'requires_review':
      return 'Requiere revisión';
    default:
      return status;
  }
}

/** La compilación más reciente de una lista (el backend ya ordena DESC). */
export function latestCompilation(
  compilations: MagazineCompilationRecord[],
): MagazineCompilationRecord | null {
  return compilations.length > 0 ? compilations[0] : null;
}

/** Lee las compilaciones de un tomo desde el backend nativo. */
export async function fetchMagazineCompilations(
  volumeId: string,
): Promise<MagazineCompilationRecord[]> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<MagazineCompilationRecord[]>('get_magazine_compilations', { volumeId });
}

/**
 * Compila un job de la biblioteca hacia un tomo con el proveedor real.
 * Falla cerrado sin clave Gemini en el proceso nativo (error accionable).
 */
export async function compileMagazineSource(
  jobId: number,
  volumeId: string,
  chapterId?: number | null,
  updateArticleId?: string | null,
): Promise<CompilationOutcome> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CompilationOutcome>('compile_magazine_source', {
    jobId,
    volumeId,
    chapterId: chapterId ?? null,
    updateArticleId: updateArticleId ?? null,
  });
}

/** Compila múltiples fuentes hacia un tomo (Fase 4: Multi-Source Editorial Synthesis). */
export async function compileMultiSourceEditorial(
  jobIds: number[],
  volumeId: string,
  chapterId?: number | null,
  updateArticleId?: string | null,
): Promise<CompilationOutcome> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CompilationOutcome>('compile_multi_source_editorial', {
    jobIds,
    volumeId,
    chapterId: chapterId ?? null,
    updateArticleId: updateArticleId ?? null,
  });
}

/** Recupera la propuesta de NewVolumeCandidate asociada a una compilación (si existe). */
export async function fetchMagazineCompilationCandidate(
  compilationId: number,
): Promise<NewVolumeCandidate | null> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<NewVolumeCandidate | null>('get_magazine_compilation_candidate', {
    compilationId,
  });
}

/** Reejecuta una compilación no exitosa con sus parámetros guardados. */
export async function retryMagazineCompilation(
  compilationId: number,
): Promise<CompilationOutcome> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CompilationOutcome>('retry_magazine_compilation', { compilationId });
}

/** Indica si el proceso nativo tiene clave Gemini configurada. */
export async function fetchGeminiStatus(): Promise<boolean> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('get_gemini_status');
}

/* ========================================================================
 * FASE 3 — Reader: detalles, capítulos, medio resoluble y deep links.
 * ====================================================================== */

/** Capítulo tal como lo serializa el backend (snake_case). */
export interface MagazineChapterRecord {
  id: number;
  volume_id: string;
  title: string;
  description: string | null;
  ordinal: number;
  created_at: string;
  updated_at: string;
}

/** Fuente vinculada tal como la serializa el backend. */
export interface MagazineSourceRecord {
  id: number;
  article_id: string;
  job_id: number;
  content_id: number | null;
  source_role: string;
  citation_label: string | null;
  created_at: string;
}

/** Evidencia trazable tal como la serializa el backend. */
export interface MagazineEvidenceRecord {
  id: number;
  article_id: string;
  source_id: number;
  job_id: number;
  evidence_kind: string;
  timestamp_start: number | null;
  timestamp_end: number | null;
  keyframe_path: string | null;
  transcript_text: string | null;
  extracted_fact: string | null;
  confidence: number;
  created_at: string;
}

/** Versión histórica tal como la serializa el backend. */
export interface MagazineArticleVersionRecord {
  id: number;
  article_id: string;
  version_number: number;
  title: string;
  summary: string;
  structured_content_json: string;
  editorial_notes_json: string | null;
  change_summary: string | null;
  created_at: string;
}

/** Conflicto tal como lo serializa el backend. */
export interface MagazineConflictRecord {
  id: number;
  article_id: string;
  fact_key: string;
  description: string;
  evidence_a_id: number;
  evidence_b_id: number;
  resolution_state: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** Detalle agregado de un artículo (una sola llamada IPC). */
export interface MagazineArticleDetails {
  article: MagazineArticleRecord;
  sources: MagazineSourceRecord[];
  evidence: MagazineEvidenceRecord[];
  versions: MagazineArticleVersionRecord[];
  conflicts: MagazineConflictRecord[];
}

/** Medio original resoluble para el inspector de fuentes. */
export interface MagazineSourceMedia {
  job_id: number;
  url: string;
  canonical_url: string | null;
  title: string | null;
  author: string | null;
  platform: string | null;
  duration_secs: number | null;
  video_path: string | null;
  poster_path: string | null;
  source_state: string;
  job_status: string;
}

/**
 * Destino interno artículo+evidencia+timestamp (deep link de fase 3).
 * Estado en memoria para links, historial y navegación desde conflictos;
 * no es una URL pública.
 */
export interface MagazineEvidenceTarget {
  articleId: string;
  evidenceId: number;
  timestamp: number | null;
}

/** Construye el destino de navegación para una evidencia. */
export function buildEvidenceTarget(
  articleId: string,
  evidence: MagazineEvidenceRecord,
): MagazineEvidenceTarget {
  return {
    articleId,
    evidenceId: evidence.id,
    timestamp: evidence.timestamp_start,
  };
}

/** Formatea segundos como `MM:SS.d` accionable (`00:14.2`). */
export function formatTimestamp(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) {
    return '—';
  }
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  const whole = Math.floor(seconds);
  const tenths = Math.floor((seconds - whole) * 10);
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(minutes, 2)}:${pad(whole, 2)}.${tenths}`;
}

/** Etiqueta legible de un tipo de artículo editorial. */
export function presentArticleType(articleType: string): string {
  switch (articleType) {
    case 'recipe':
      return 'Receta';
    case 'tutorial':
      return 'Tutorial';
    case 'guide':
      return 'Guía';
    case 'technical':
      return 'Técnico';
    case 'review':
      return 'Reseña';
    case 'reference':
      return 'Referencia';
    case 'comparison':
      return 'Comparativa';
    case 'collection':
      return 'Colección';
    case 'insight':
      return 'Insight';
    default:
      return articleType;
  }
}

/** Etiqueta legible de un tipo de evidencia. */
export function presentEvidenceKind(kind: string): string {
  switch (kind) {
    case 'transcript_segment':
      return 'Transcripción';
    case 'keyframe':
      return 'Fotograma clave';
    case 'ocr':
      return 'Texto en pantalla';
    case 'timestamp':
      return 'Momento';
    case 'metadata':
      return 'Metadata';
    default:
      return kind;
  }
}

/**
 * Convierte una ruta local a URL reproducible (patrón canónico de Pulsaria:
 * `convertFileSrc` en Tauri, URL remota tal cual, `undefined` si no hay
 * shell nativo). Misma regla que `VideoGrid`/`ExpandedVideoModal`.
 */
export async function resolveAssetUrl(
  localPath: string | null | undefined,
): Promise<string | undefined> {
  if (!localPath) return undefined;
  if (/^(https?:\/\/|data:|asset:\/\/)/i.test(localPath)) return localPath;
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(localPath);
  } catch {
    return undefined;
  }
}

/** Lee los capítulos de un tomo desde el backend nativo. */
export async function fetchMagazineChapters(
  volumeId: string,
): Promise<MagazineChapterRecord[]> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<MagazineChapterRecord[]>('get_magazine_chapters', { volumeId });
}

/** Lee el detalle agregado de un artículo (artículo+fuentes+evidencia+versiones+conflictos). */
export async function fetchMagazineArticleDetails(
  articleId: string,
): Promise<MagazineArticleDetails> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const details = await invoke<MagazineArticleDetails | null>('get_magazine_article_details', {
    articleId,
  });
  if (!details) {
    throw new Error(`El artículo ${articleId} ya no existe en la biblioteca local.`);
  }
  return details;
}

/** Resuelve el medio original de un job para el inspector de fuentes. */
export async function fetchMagazineSourceMedia(
  jobId: number,
): Promise<MagazineSourceMedia | null> {
  const { isNativeShell } = await import('@/lib/api-client');
  if (!isNativeShell()) {
    throw new Error('preview-without-native-shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<MagazineSourceMedia | null>('get_magazine_source_media', { jobId });
}

