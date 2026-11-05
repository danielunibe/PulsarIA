'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaShieldHalved } from '@/components/icon-library';
import { useI18n } from '@/lib/i18n';
import type {
  AiOperation,
  AiProviderConfigView,
  AiProviderKind,
  AiProviderProfileInput,
  AiProviderProfileView,
} from '@/lib/ai-providers';
import {
  getAiProviderConfig,
  getAiProviderModels,
  removeAiProviderApiKey,
  removeAiProviderProfile,
  saveAiProviderProfile,
  setAiOperationProvider,
  testAiProvider,
} from '@/lib/ai-providers';

interface AiProviderManagerProps {
  isTauri: boolean;
  localModelState: string;
}

interface ProfileDraft {
  profileId?: string;
  displayName: string;
  providerKind: AiProviderKind;
  baseUrl: string;
  modelId: string;
}

const EMPTY_DRAFT: ProfileDraft = {
  displayName: '',
  providerKind: 'open_ai_compatible',
  baseUrl: '',
  modelId: '',
};

const OPERATIONS: Array<{ id: AiOperation; assignment: keyof NonNullable<AiProviderConfigView['assignments']>; es: string; en: string; contentEs: string; contentEn: string }> = [
  { id: 'assistant_chat', assignment: 'assistantChat', es: 'Asistente y búsqueda', en: 'Assistant and search', contentEs: 'consulta y títulos/transcripciones de los videos incluidos en el contexto', contentEn: 'your query and the titles/transcripts of videos included in context' },
  { id: 'search_synthesis', assignment: 'searchSynthesis', es: 'Síntesis de búsqueda', en: 'Search synthesis', contentEs: 'consulta y resultados de búsqueda', contentEn: 'your query and search results' },
  { id: 'recipe_extraction', assignment: 'recipeExtraction', es: 'Extracción de recetas', en: 'Recipe extraction', contentEs: 'transcripción y marcas de tiempo del video', contentEn: 'the video transcript and timestamps' },
  { id: 'editorial_compilation', assignment: 'editorialCompilation', es: 'Compilación editorial', en: 'Editorial compilation', contentEs: 'evidencia, transcripción y metadatos que selecciones', contentEn: 'the evidence, transcript, and metadata you select' },
];

function providerLabel(kind: AiProviderKind, english: boolean) {
  switch (kind) {
    case 'open_ai': return 'OpenAI';
    case 'gemini': return 'Google Gemini';
    case 'open_router': return 'OpenRouter';
    case 'groq': return 'Groq';
    default: return english ? 'Custom compatible API' : 'API compatible personalizada';
  }
}

function newProfileId() {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `provider-${id}`;
}

export function AiProviderManager({ isTauri, localModelState }: AiProviderManagerProps) {
  const { locale } = useI18n();
  const english = locale === 'en-US';
  const [config, setConfig] = useState<AiProviderConfigView | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [apiKey, setApiKey] = useState('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);

  const savedProfile = useMemo(
    () => draft.profileId ? config?.profiles.find((profile) => profile.profileId === draft.profileId) : undefined,
    [config?.profiles, draft.profileId],
  );
  const savedEndpointMatches = Boolean(
    savedProfile
    && savedProfile.providerKind === draft.providerKind
    && savedProfile.baseUrl === draft.baseUrl
    && !apiKey.trim(),
  );
  const savedProfileMatches = Boolean(
    savedEndpointMatches
    && savedProfile?.displayName === draft.displayName
    && savedProfile?.modelId === draft.modelId,
  );

  const refresh = useCallback(async () => {
    if (!isTauri) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setConfig(await getAiProviderConfig());
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [isTauri]);

  useEffect(() => { void refresh(); }, [refresh]);

  const editProfile = (profile: AiProviderProfileView) => {
    setDraft({
      profileId: profile.profileId,
      displayName: profile.displayName,
      providerKind: profile.providerKind,
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
    });
    setModelOptions([]);
    setApiKey('');
    setMessage(null);
  };

  const startNewProfile = (kind: AiProviderKind = 'open_ai_compatible') => {
    const preset = config?.presets.find((item) => item.providerKind === kind);
    setDraft({
      ...EMPTY_DRAFT,
      displayName: preset?.displayName ?? '',
      providerKind: kind,
      baseUrl: preset?.baseUrl ?? '',
      modelId: preset?.defaultModelId ?? '',
    });
    setModelOptions([]);
    setApiKey('');
    setMessage(null);
  };

  const updateKind = (kind: AiProviderKind) => {
    const preset = config?.presets.find((item) => item.providerKind === kind);
    setDraft((current) => ({
      ...current,
      providerKind: kind,
      displayName: preset?.displayName ?? current.displayName,
      baseUrl: preset?.baseUrl ?? '',
      modelId: preset?.defaultModelId ?? '',
    }));
    setModelOptions([]);
  };

  const handleSave = async () => {
    if (!isTauri || !draft.displayName.trim() || !draft.baseUrl.trim()) {
      setMessage({ kind: 'error', text: english ? 'Enter a profile name and endpoint URL.' : 'Escribe el nombre del perfil y la URL del endpoint.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const profile: AiProviderProfileInput = {
      ...draft,
      profileId: draft.profileId ?? newProfileId(),
      displayName: draft.displayName.trim(),
      baseUrl: draft.baseUrl.trim(),
      modelId: draft.modelId.trim(),
    };
    try {
      const next = await saveAiProviderProfile(profile, apiKey.trim() || undefined);
      setConfig(next);
      setDraft({ ...profile });
      setApiKey('');
      setModelOptions([]);
      window.dispatchEvent(new Event('pulsaria-ai-provider-changed'));
      setMessage({ kind: 'success', text: english ? 'Provider profile saved.' : 'Perfil de proveedor guardado.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleAssignment = async (operation: AiOperation, profileId: string) => {
    if (!config) return;
    const previous = config;
    setConfig({ ...config, assignments: { ...config.assignments, [OPERATIONS.find((item) => item.id === operation)!.assignment]: profileId } });
    setMessage(null);
    try {
      const updated = await setAiOperationProvider(operation, profileId);
      setConfig(updated);
      window.dispatchEvent(new Event('pulsaria-ai-provider-changed'));
    } catch (error) {
      setConfig(previous);
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleModels = async () => {
    if (!draft.profileId) return;
    setBusy(true);
    setMessage({ kind: 'info', text: english ? 'Reading the model list from the saved endpoint…' : 'Consultando los modelos del endpoint guardado…' });
    try {
      const models = await getAiProviderModels(draft.profileId);
      setModelOptions(models);
      setMessage({ kind: 'success', text: english ? `${models.length} models available.` : `${models.length} modelos disponibles.` });
    } catch (error) {
      setModelOptions([]);
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (!draft.profileId) return;
    setBusy(true);
    setMessage({ kind: 'info', text: english ? 'Sending a short connection check. The provider may count it toward your quota.' : 'Enviando una prueba breve. El proveedor podría contarla para tu cuota.' });
    try {
      const result = await testAiProvider(draft.profileId);
      setMessage({ kind: 'success', text: result });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const assignedOperations = (profileId: string) => OPERATIONS
    .filter((operation) => config?.assignments[operation.assignment] === profileId)
    .map((operation) => english ? operation.en : operation.es);

  const handleRemoveProfile = async (profile: AiProviderProfileView) => {
    if (assignedOperations(profile.profileId).length > 0) {
      setMessage({ kind: 'error', text: english ? 'Reassign this profile’s operations before removing it.' : 'Reasigna las funciones de este perfil antes de eliminarlo.' });
      return;
    }
    setBusy(true);
    try {
      setConfig(await removeAiProviderProfile(profile.profileId));
      if (draft.profileId === profile.profileId) startNewProfile();
      setMessage({ kind: 'success', text: english ? 'Profile removed.' : 'Perfil eliminado.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveKey = async (profileId: string) => {
    setBusy(true);
    try {
      setConfig(await removeAiProviderApiKey(profileId));
      setMessage({ kind: 'success', text: english ? 'Saved API key removed.' : 'Clave de API guardada eliminada.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = 'w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-[#25f4ee]/35';
  const labelClass = 'flex flex-col gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white/45';

  return (
    <section className="rounded-[20px] border border-white/[0.08] bg-[#0d1018]/85 p-4 shadow-inner sm:p-5" aria-labelledby="ai-provider-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="ai-provider-heading" className="text-sm font-semibold text-white">{english ? 'AI connections and routing' : 'Conexiones y funciones de IA'}</h3>
          <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-white/45">
            {english
              ? 'Connect local and cloud models, then choose a provider for each task. Pulsaria never switches providers automatically.'
              : 'Conecta modelos locales y de nube, y elige un proveedor para cada tarea. Pulsaria nunca cambia de proveedor automáticamente.'}
          </p>
        </div>
        <button type="button" disabled={!isTauri || loading} onClick={() => startNewProfile()} className="rounded-xl border border-[#25f4ee]/20 bg-[#25f4ee]/10 px-3 py-2 text-[9px] font-bold text-[#a5f9f5] transition-colors hover:bg-[#25f4ee]/15 disabled:opacity-40">
          {english ? 'Add connection' : 'Añadir conexión'}
        </button>
      </div>

      {!isTauri && <p className="mt-4 rounded-xl border border-amber-200/10 bg-amber-200/[0.04] p-3 text-[10px] text-amber-100/70">{english ? 'Provider connections are managed in the desktop app.' : 'Las conexiones de proveedores se administran en la aplicación de escritorio.'}</p>}
      {loading && <p role="status" className="mt-4 text-[10px] text-white/45">{english ? 'Loading provider settings…' : 'Cargando ajustes de proveedores…'}</p>}

      {config && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <article className="rounded-2xl border border-[#8a5cff]/20 bg-[#8a5cff]/[0.06] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-white">{english ? 'Local model · Llama.cpp' : 'Modelo local · Llama.cpp'}</span>
                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[8px] font-mono text-white/55">{localModelState}</span>
              </div>
              <p className="mt-1 text-[9px] leading-relaxed text-white/40">{english ? 'Runs on this device. No API key is needed.' : 'Se ejecuta en este dispositivo. No necesita clave de API.'}</p>
            </article>
            {config.profiles.map((profile) => {
              const assignments = assignedOperations(profile.profileId);
              return (
                <article key={profile.profileId} className={`rounded-2xl border p-3 ${draft.profileId === profile.profileId ? 'border-[#25f4ee]/25 bg-[#25f4ee]/[0.045]' : 'border-white/[0.08] bg-black/20'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => editProfile(profile)} className="min-w-0 text-left">
                      <span className="block truncate text-[11px] font-semibold text-white">{profile.displayName}</span>
                      <span className="mt-1 block truncate font-mono text-[9px] text-white/40">{profile.modelId || (english ? 'Model not set' : 'Modelo sin definir')} · {providerLabel(profile.providerKind, english)}</span>
                    </button>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] ${profile.hasApiKey ? 'bg-emerald-300/10 text-emerald-200/75' : 'bg-white/[0.06] text-white/40'}`}>
                      {profile.keySource === 'environment'
                        ? (english ? 'Environment key' : 'Clave de entorno')
                        : profile.hasApiKey
                          ? (english ? 'Key saved' : 'Clave guardada')
                          : (english ? 'No key' : 'Sin clave')}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-white/35">
                    <span>{assignments.length ? `${english ? 'Used for' : 'Asignado a'}: ${assignments.join(', ')}` : (english ? 'Not assigned' : 'Sin asignar')}</span>
                    {profile.keySource === 'credential_manager' && <button type="button" disabled={busy} onClick={() => void handleRemoveKey(profile.profileId)} className="text-rose-200/65 hover:text-rose-100 disabled:opacity-40">{english ? 'Remove key' : 'Eliminar clave'}</button>}
                    {profile.keySource === 'environment' && <span>{english ? 'Remove the native environment variable to disable it.' : 'Elimina la variable de entorno nativa para desactivarla.'}</span>}
                    <button type="button" disabled={busy || assignments.length > 0} onClick={() => void handleRemoveProfile(profile)} title={assignments.length ? (english ? 'Reassign its operations first' : 'Primero reasigna sus funciones') : undefined} className="text-rose-200/65 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-30">{english ? 'Remove profile' : 'Eliminar perfil'}</button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/65">{english ? 'Provider for each task' : 'Proveedor para cada función'}</h4>
              <span className="text-[8px] text-white/35">{english ? 'Change takes effect on the next request.' : 'El cambio se aplica en la siguiente solicitud.'}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPERATIONS.map((operation) => (
                <label key={operation.id} className={labelClass}>
                  <span>{english ? operation.en : operation.es}</span>
                  <select
                    value={config.assignments[operation.assignment]}
                    onChange={(event) => void handleAssignment(operation.id, event.target.value)}
                    disabled={busy || !isTauri}
                    className={fieldClass}
                  >
                    <option value={config.localProfileId}>{english ? 'Local · Llama.cpp' : 'Local · Llama.cpp'}</option>
                    {config.profiles.map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.displayName} · {profile.modelId || (english ? 'model needed' : 'falta modelo')}</option>)}
                  </select>
                  <span className="font-normal normal-case tracking-normal text-white/30">{english ? `On request: ${operation.contentEn}.` : `Al iniciar: ${operation.contentEs}.`}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/65">{draft.profileId ? (english ? 'Edit connection' : 'Editar conexión') : (english ? 'New connection' : 'Nueva conexión')}</h4>
              {draft.profileId && <button type="button" onClick={() => startNewProfile()} className="text-[9px] text-white/45 hover:text-white">{english ? 'Clear form' : 'Limpiar formulario'}</button>}
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <label className={labelClass}>
                <span>{english ? 'Connection type' : 'Tipo de conexión'}</span>
                <select value={draft.providerKind} onChange={(event) => updateKind(event.target.value as AiProviderKind)} className={fieldClass} disabled={busy}>
                  {config.presets.map((preset) => <option key={preset.providerKind} value={preset.providerKind}>{preset.displayName}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                <span>{english ? 'Profile name' : 'Nombre del perfil'}</span>
                <input value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} maxLength={80} className={fieldClass} placeholder={english ? 'e.g. My research model' : 'p. ej. Modelo de investigación'} />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                <span>{english ? 'API-compatible base URL' : 'URL base compatible con API'}</span>
                <input value={draft.baseUrl} onChange={(event) => { setDraft((current) => ({ ...current, baseUrl: event.target.value })); setModelOptions([]); }} className={`${fieldClass} font-mono normal-case tracking-normal`} placeholder="https://api.example.com/v1" autoCapitalize="none" spellCheck={false} />
              </label>
              <label className={labelClass}>
                <span>{english ? 'Model ID' : 'Identificador del modelo'}</span>
                <input value={draft.modelId} onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))} className={`${fieldClass} font-mono normal-case tracking-normal`} placeholder={english ? 'e.g. gpt-4.1-mini' : 'p. ej. gpt-4.1-mini'} autoCapitalize="none" spellCheck={false} />
                {modelOptions.length > 0 && (
                  <select value="" onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))} className={`${fieldClass} font-mono normal-case tracking-normal`} aria-label={english ? 'Choose a model from the endpoint' : 'Elegir un modelo del endpoint'}>
                    <option value="" disabled>{english ? 'Choose from endpoint models…' : 'Elegir entre los modelos del endpoint…'}</option>
                    {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                )}
              </label>
              <label className={labelClass}>
                <span>{english ? 'API key' : 'Clave de API'}</span>
                <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className={`${fieldClass} font-mono normal-case tracking-normal`} placeholder={savedProfile?.hasApiKey ? (english ? 'Saved securely · enter only to replace' : 'Guardada de forma segura · escribe solo para reemplazar') : (english ? 'Paste your key' : 'Pega tu clave')} autoComplete="new-password" autoCapitalize="none" spellCheck={false} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !isTauri} onClick={() => void handleSave()} className="rounded-xl bg-[#8a5cff]/20 px-3 py-2 text-[9px] font-bold text-[#d1c4ff] hover:bg-[#8a5cff]/30 disabled:opacity-40">{busy ? (english ? 'Working…' : 'Guardando…') : (english ? 'Save profile' : 'Guardar perfil')}</button>
              <button type="button" disabled={busy || !draft.profileId || !savedEndpointMatches || !isTauri} onClick={() => void handleModels()} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-semibold text-white/75 hover:bg-white/[0.08] disabled:opacity-35">{english ? 'Load models' : 'Cargar modelos'}</button>
              <button type="button" disabled={busy || !draft.profileId || !draft.modelId.trim() || !savedProfileMatches || !isTauri} onClick={() => void handleTest()} className="rounded-xl border border-[#25f4ee]/15 bg-[#25f4ee]/[0.06] px-3 py-2 text-[9px] font-semibold text-[#a5f9f5] hover:bg-[#25f4ee]/10 disabled:opacity-35">{english ? 'Test connection' : 'Probar conexión'}</button>
            </div>
            <p className="mt-2 text-[8px] leading-relaxed text-white/35">{english ? 'Save before loading models or testing. After choosing a listed model, save again before testing. You can save without a model ID, then pick one from the endpoint. Empty API key fields preserve the saved key.' : 'Guarda antes de cargar modelos o probar. Después de elegir un modelo de la lista, vuelve a guardar antes de probar. Puedes guardar sin modelo y elegirlo del endpoint. Si dejas la clave vacía, se conserva la clave guardada.'}</p>
            {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-xl border px-3 py-2 text-[9px] leading-relaxed ${message.kind === 'error' ? 'border-rose-300/15 bg-rose-300/[0.06] text-rose-100/80' : message.kind === 'success' ? 'border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100/75' : 'border-white/10 bg-white/[0.04] text-white/55'}`}>{message.text}</p>}
          </div>

          <div className="mt-4 flex gap-2 rounded-2xl border border-[#25f4ee]/10 bg-[#25f4ee]/[0.035] p-3 text-[9px] leading-relaxed text-white/45">
            <FaShieldHalved size={13} className="mt-0.5 shrink-0 text-[#25f4ee]/75" />
            <p>{english
              ? 'Privacy: local tasks stay on this device. A cloud profile receives only the content listed beside its task when you start that task. No background requests or automatic provider fallback occur. A connection test sends a short test prompt.'
              : 'Privacidad: las tareas locales permanecen en este dispositivo. Un perfil de nube recibe solo el contenido indicado junto a su función cuando tú la inicias. No hay solicitudes en segundo plano ni cambio automático de proveedor. La prueba de conexión envía un prompt breve.'}</p>
          </div>

          <div className="mt-3 grid gap-1 text-[8px] leading-relaxed text-white/30 sm:grid-cols-2">
            <span>{english ? 'OpenRouter free models depend on current availability and limits.' : 'Los modelos gratuitos de OpenRouter dependen de su disponibilidad y límites vigentes.'}</span>
            <span>{english ? 'OpenAI API billing is separate from a ChatGPT subscription.' : 'La API de OpenAI se factura por separado de la suscripción de ChatGPT.'}</span>
          </div>
        </>
      )}
    </section>
  );
}
