'use client';

import { isTauriRuntime } from '@/hooks/use-processing-settings';

export const MAX_GEMINI_PROMPT_CHARS = 120_000;
export const MAX_GEMINI_OUTPUT_TOKENS = 8_192;

function validateRequest(prompt: string, maxOutputTokens: number) {
  if (!prompt.trim()) throw new Error('Gemini rechazó un prompt vacío.');
  if (Array.from(prompt).length > MAX_GEMINI_PROMPT_CHARS) {
    throw new Error(`El prompt de Gemini supera el límite de ${MAX_GEMINI_PROMPT_CHARS} caracteres.`);
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_GEMINI_OUTPUT_TOKENS) {
    throw new Error(`maxOutputTokens debe estar entre 1 y ${MAX_GEMINI_OUTPUT_TOKENS}.`);
  }
}

/**
 * Calls the optional Gemini integration through Tauri IPC.
 *
 * No API key, endpoint or cloud request is available to the browser bundle.
 * The native command reads the key from its process environment and does not
 * persist either the prompt or the response.
 */
export async function generateGeminiResponse(
  prompt: string,
  maxOutputTokens = 1_024,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Gemini requiere abrir Pulsaria como aplicación de escritorio.');
  }
  const normalizedPrompt = prompt.trim();
  validateRequest(normalizedPrompt, maxOutputTokens);
  const { invoke } = await import('@tauri-apps/api/core');
  const response = await invoke<unknown>('generate_gemini_response', {
    prompt: normalizedPrompt,
    maxOutputTokens,
  });
  if (typeof response !== 'string' || !response.trim()) {
    throw new Error('Gemini devolvió una respuesta vacía.');
  }
  return response.trim();
}

/** Builds a manually requested RAG prompt without persisting the fragments. */
export async function generateGeminiChatResponse(query: string, context: string[]): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('No se puede enviar una consulta vacía a Gemini.');
  const contextBlock = context.length > 0
    ? context.map((chunk, index) => `[Fragmento ${index + 1}]\n${chunk}`).join('\n\n')
    : '(No se encontraron fragmentos relevantes en la biblioteca.)';
  const prompt = `Eres un asistente útil. Responde exclusivamente con base en el contexto proporcionado. Si la respuesta no está en el contexto, dilo explícitamente; no inventes datos.

Contexto:
${contextBlock}

Consulta: ${normalizedQuery}`;
  return generateGeminiResponse(prompt, 1_024);
}
