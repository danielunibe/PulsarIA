import { isTauriRuntime } from '@/hooks/use-processing-settings';

export type AiProviderKind = 'open_ai' | 'gemini' | 'open_router' | 'groq' | 'open_ai_compatible';
export type AiOperation = 'assistant_chat' | 'search_synthesis' | 'recipe_extraction' | 'editorial_compilation';

export interface AiProviderProfile {
  profileId: string;
  displayName: string;
  providerKind: AiProviderKind;
  baseUrl: string;
  modelId: string;
}

export interface AiProviderProfileView extends AiProviderProfile {
  hasApiKey: boolean;
  keySource: 'credential_manager' | 'environment' | 'none';
}

export interface AiProviderPreset {
  providerKind: AiProviderKind;
  displayName: string;
  baseUrl: string;
  defaultModelId: string;
}

export interface AiProviderAssignments {
  assistantChat: string;
  searchSynthesis: string;
  recipeExtraction: string;
  editorialCompilation: string;
}

export interface AiProviderConfigView {
  profiles: AiProviderProfileView[];
  assignments: AiProviderAssignments;
  presets: AiProviderPreset[];
  localProfileId: string;
}

export interface AiProviderProfileInput {
  profileId?: string;
  displayName: string;
  providerKind: AiProviderKind;
  baseUrl: string;
  modelId: string;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) throw new Error('La configuración de proveedores requiere Pulsaria para escritorio.');
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

export const getAiProviderConfig = () => invoke<AiProviderConfigView>('get_ai_provider_config');

export const saveAiProviderProfile = (profile: AiProviderProfileInput, apiKey?: string) =>
  invoke<AiProviderConfigView>('save_ai_provider_profile', { profile, apiKey });

export const removeAiProviderProfile = (profileId: string) =>
  invoke<AiProviderConfigView>('remove_ai_provider_profile', { profileId });

export const removeAiProviderApiKey = (profileId: string) =>
  invoke<AiProviderConfigView>('remove_ai_provider_api_key', { profileId });

export const setAiOperationProvider = (operation: AiOperation, profileId: string) =>
  invoke<AiProviderConfigView>('set_ai_operation_provider', { operation, profileId });

export const getAiProviderModels = (profileId: string) =>
  invoke<string[]>('get_ai_provider_models', { profileId });

export const testAiProvider = (profileId: string) =>
  invoke<string>('test_ai_provider', { profileId });

export async function generateConfiguredAi(
  operation: AiOperation,
  prompt: string,
  maxOutputTokens: number,
  analysisDepth?: 'standard' | 'deep',
  expectedProfileId?: string,
): Promise<{ text: string; providerId: string; providerName: string; modelId: string }> {
  return invoke('generate_ai_for_operation', {
    request: { operation, prompt, maxOutputTokens, analysisDepth, expectedProfileId },
  });
}
