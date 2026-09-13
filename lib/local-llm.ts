export interface VideoSummary {
  title: string;
  summary: string[];
  category: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export type LocalLlmState = 'not_installed' | 'downloading' | 'verifying' | 'ready' | 'failed';

export interface LocalLlmStatus {
  state: LocalLlmState;
  modelId: string;
  modelRevision: string;
  bytesDownloaded: number;
  totalBytes: number;
  sha256?: string | null;
  errorCode?: string | null;
}

const ALLOWED_CATEGORIES = new Set([
  'Programacion',
  'Fitness',
  'Finanzas',
  'Humor',
  'Educacion',
  'Tecnologia',
  'Otros',
]);

function isNativeShell() {
  return typeof window !== 'undefined'
    && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

async function callLocalLlm(task: 'summary' | 'chat', context: string, maxOutputTokens: number): Promise<string> {
  if (!isNativeShell()) {
    throw new Error('La IA local requiere abrir Pulsaria como aplicación de escritorio.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const response = await invoke<{ text: string; modelId: string }>('generate_local_response', {
    request: { task, context, maxOutputTokens },
  });
  return response.text;
}

export async function getLocalLlmStatus(): Promise<LocalLlmStatus> {
  if (!isNativeShell()) {
    return { state: 'not_installed', modelId: '', modelRevision: '', bytesDownloaded: 0, totalBytes: 0 };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<LocalLlmStatus>('get_local_llm_status');
}

export async function ensureLocalLlm(): Promise<LocalLlmStatus> {
  if (!isNativeShell()) throw new Error('La preparación del modelo requiere el shell nativo de Pulsaria.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<LocalLlmStatus>('ensure_local_llm');
}

export async function cancelLocalLlmDownload() {
  if (!isNativeShell()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('cancel_local_llm_download');
}

export async function generateVideoSummary(transcriptText: string): Promise<VideoSummary> {
  const transcript = transcriptText.trim();
  if (!transcript) throw new Error('No se puede resumir una transcripción vacía.');

  const prompt = `Eres un asistente experto en análisis de contenido audiovisual. A partir de la siguiente transcripción, devuelve exclusivamente JSON válido, sin markdown ni texto adicional.

Esquema obligatorio:
{"title":"string de máximo 80 caracteres","summary":["string","string","string"],"category":"Programacion|Fitness|Finanzas|Humor|Educacion|Tecnologia|Otros","sentiment":"positive|neutral|negative"}

La matriz summary debe tener exactamente tres elementos y no debes inventar información ausente de la transcripción.

Transcripción:
<<<
${transcript}
>>>`;

  const text = await callLocalLlm('summary', prompt, 512);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('El modelo local no devolvió un resumen JSON.');

  let parsed: Partial<VideoSummary>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Partial<VideoSummary>;
  } catch (error) {
    throw new Error(`El modelo local devolvió JSON inválido: ${String(error)}`);
  }

  const sentiment = parsed.sentiment;
  if (
    typeof parsed.title !== 'string' ||
    !Array.isArray(parsed.summary) ||
    parsed.summary.length !== 3 ||
    !parsed.summary.every((item) => typeof item === 'string') ||
    typeof parsed.category !== 'string' ||
    !ALLOWED_CATEGORIES.has(parsed.category) ||
    (sentiment !== 'positive' && sentiment !== 'neutral' && sentiment !== 'negative')
  ) {
    throw new Error('El resumen del modelo local no coincide con el esquema requerido.');
  }

  return {
    title: parsed.title.trim().slice(0, 80),
    summary: parsed.summary.map((item) => item.trim()),
    category: parsed.category,
    sentiment,
  };
}

export async function generateChatResponse(query: string, context: string[]): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('No se puede responder una consulta vacía.');
  const contextBlock = context.length > 0
    ? context.map((chunk, index) => `[Fragmento ${index + 1}]\n${chunk}`).join('\n\n')
    : '(No se encontraron fragmentos relevantes en la biblioteca.)';
  const prompt = `Eres un asistente útil. Responde exclusivamente con base en el contexto proporcionado. Si la respuesta no está en el contexto, dilo explícitamente; no inventes datos.

Contexto:
${contextBlock}

Consulta: ${normalizedQuery}`;

  try {
    return await callLocalLlm('chat', prompt, 1024);
  } catch (error) {
    return `No fue posible consultar el modelo local: ${error instanceof Error ? error.message : String(error)}`;
  }
}
