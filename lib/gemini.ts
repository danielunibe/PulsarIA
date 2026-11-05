'use client';

import { isTauriRuntime } from '@/hooks/use-processing-settings';
import { generateConfiguredAi } from '@/lib/ai-providers';

export const MAX_GEMINI_PROMPT_CHARS = 120_000;
export const MAX_GEMINI_OUTPUT_TOKENS = 8_192;

function validateRequest(prompt: string, maxOutputTokens: number) {
  if (!prompt.trim()) throw new Error('No se puede enviar un prompt de síntesis vacío.');
  if (Array.from(prompt).length > MAX_GEMINI_PROMPT_CHARS) {
    throw new Error(`El prompt de síntesis supera el límite de ${MAX_GEMINI_PROMPT_CHARS} caracteres.`);
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_GEMINI_OUTPUT_TOKENS) {
    throw new Error(`El límite de salida debe estar entre 1 y ${MAX_GEMINI_OUTPUT_TOKENS} tokens.`);
  }
}

/**
 * Calls the provider assigned to search synthesis through Tauri IPC.
 *
 * No API key or endpoint is available to the browser bundle. The native
 * command resolves keys from Windows Credential Manager and does not persist
 * the prompt or response. Gemini remains the default route.
 */
export async function generateGeminiResponse(
  prompt: string,
  maxOutputTokens = 1_024,
  expectedProfileId?: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Gemini requiere abrir Pulsaria como aplicación de escritorio.');
  }
  const normalizedPrompt = prompt.trim();
  validateRequest(normalizedPrompt, maxOutputTokens);
  const response = await generateConfiguredAi('search_synthesis', normalizedPrompt, maxOutputTokens, undefined, expectedProfileId);
  if (typeof response.text !== 'string' || !response.text.trim()) {
    throw new Error('El proveedor asignado devolvió una respuesta vacía.');
  }
  return response.text.trim();
}

/** Builds a manually requested RAG prompt without persisting the fragments. */
export async function generateGeminiChatResponse(query: string, context: string[], expectedProfileId?: string): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('No se puede enviar una consulta vacía a Gemini.');
  const contextBlock = context.length > 0
    ? context.map((chunk, index) => `[Fragmento ${index + 1}]\n${chunk}`).join('\n\n')
    : '(No se encontraron fragmentos relevantes en la biblioteca.)';
  const prompt = `Eres un asistente útil. Responde exclusivamente con base en el contexto proporcionado. Si la respuesta no está en el contexto, dilo explícitamente; no inventes datos.

Contexto:
${contextBlock}

Consulta: ${normalizedQuery}`;
  return generateGeminiResponse(prompt, 1_024, expectedProfileId);
}
