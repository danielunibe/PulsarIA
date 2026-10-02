'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { validateTikTokUrl } from '@/lib/url-validation';
import type { SubmitLinksResult } from '@/hooks/use-jobs';
import { TikTokSourcesPanel } from '@/components/TikTokSourcesPanel';
import { FaInfo } from '@/components/icon-library';
import { useI18n } from '@/lib/i18n';

interface AddLinksProps {
  onSubmitLinks: (urls: string[]) => Promise<SubmitLinksResult>;
  homeResetSignal?: number;
  focusSignal?: number;
  runtimeReady?: boolean;
  runtimeIssue?: string | null;
  mode?: 'ingest' | 'profiles';
}

const STORAGE_KEY = 'pulsaria.consent';
const RIGHTS_KEY = 'pulsaria.content-rights.v1';

interface StoredFile {
  name: string;
  size: number;
  rawFile?: File;
}

interface QueueItemState {
  label: string;
  url: string;
  status: 'pending' | 'running' | 'accepted' | 'rejected';
  progress: number;
  error?: string;
}

const TAB_HELP: Record<'enlace' | 'cuenta' | 'archivo', string> = {
  enlace: 'Aplica para enlaces de TikTok. Pega uno o varios enlaces y Pulsaria los procesará en tu biblioteca.',
  cuenta: 'Aplica para perfiles de TikTok. Conecta una fuente local para seleccionar el contenido autorizado.',
  archivo: 'Aplica para archivos TXT o CSV. Usa un enlace por línea o separado por comas.',
};

function ContextInfo({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`input-info ${className}`}>
      <button type="button" className="input-info__button" aria-label="Información del modo actual">
        <FaInfo size={14} aria-hidden="true" />
      </button>
      <span className="input-info__tooltip" role="tooltip">{text}</span>
    </span>
  );
}

function fileExtension(name: string): string {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1048576) {
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export function AddLinks({
  onSubmitLinks,
  homeResetSignal = 0,
  focusSignal = 0,
  runtimeReady = true,
  runtimeIssue,
  mode = 'ingest',
}: AddLinksProps) {
  const profileMode = mode === 'profiles';
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [consented, setConsented] = useState<boolean>(false);
  const [gateChecked, setGateChecked] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'enlace' | 'cuenta' | 'archivo'>(profileMode ? 'cuenta' : 'enlace');
  const [rows, setRows] = useState<string[]>(['']);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Policy Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [canRevokeInModal, setCanRevokeInModal] = useState(false);

  // Live queue feedback
  const [showQueue, setShowQueue] = useState(false);
  const [queueFinished, setQueueFinished] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItemState[]>([]);

  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstUrlInputRef = useRef<HTMLInputElement>(null);

  // Check stored consent on mount
  useEffect(() => {
    setMounted(true);
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY) === '1' || localStorage.getItem(RIGHTS_KEY) !== null;
      if (stored) {
        setConsented(true);
        setGateChecked(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setActiveTab(profileMode ? 'cuenta' : 'enlace');
  }, [homeResetSignal, profileMode]);

  useEffect(() => {
    if (focusSignal === 0 || profileMode || !consented) return;
    if (activeTab !== 'enlace') {
      setActiveTab('enlace');
      return;
    }
    firstUrlInputRef.current?.focus({ preventScroll: true });
  }, [activeTab, consented, focusSignal, profileMode]);

  const storeConsent = (val: boolean) => {
    try {
      if (val) {
        sessionStorage.setItem(STORAGE_KEY, '1');
        localStorage.setItem(RIGHTS_KEY, JSON.stringify({ version: '1.0', acceptedAt: new Date().toISOString() }));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(RIGHTS_KEY);
      }
    } catch {
      // ignore
    }
  };

  // Keyboard navigation for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  // Handle gate acceptance
  const handleAcceptConsent = () => {
    setConsented(true);
    storeConsent(true);
  };

  // Revoke consent
  const handleRevokeConsent = () => {
    setConsented(false);
    storeConsent(false);
    setGateChecked(false);
    setShowQueue(false);
    setQueueFinished(false);
    setModalOpen(false);
  };

  // URL inputs operations
  const updateRow = (index: number, val: string) => {
    // Si se pega texto multilínea con múltiples enlaces, dividirlos en filas
    if (val.includes('\n')) {
      const splitUrls = val.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (splitUrls.length > 1) {
        setRows((prev) => {
          const copy = [...prev];
          copy.splice(index, 1, ...splitUrls);
          return copy.slice(0, 8);
        });
        return;
      }
    }
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const addRow = () => {
    if (busy || rows.length >= 8) return;
    setRows((prev) => [...prev, '']);
  };

  const removeRow = (index: number) => {
    if (busy || rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // File operations
  const handleFilesAdded = (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming: StoredFile[] = [];
    const rejected: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      if (files.length + incoming.length < 8) {
        const f = fileList[i];
        if (!['.txt', '.csv'].includes(fileExtension(f.name))) {
          rejected.push(f.name);
          continue;
        }
        incoming.push({ name: f.name, size: f.size, rawFile: f });
      }
    }
    setFileError(rejected.length > 0
      ? `Solo se aceptan archivos TXT o CSV con URLs de TikTok: ${rejected.join(', ')}`
      : null);
    setFiles((prev) => [...prev, ...incoming].slice(0, 8));
  };

  const removeFile = (index: number) => {
    if (busy) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Computed valid items
  const validLinkItems = useMemo(() => {
    return rows.map((r) => r.trim()).filter(Boolean);
  }, [rows]);

  const validFileItems = useMemo(() => {
    return files.filter((file) => ['.txt', '.csv'].includes(fileExtension(file.name))).map((f) => f.name);
  }, [files]);

  const currentItems =
    activeTab === 'enlace'
      ? validLinkItems
      : validFileItems;
  const itemCount = currentItems.length;
  const validItemCount = activeTab === 'enlace'
    ? validLinkItems.filter((url) => validateTikTokUrl(url).ok).length
    : validFileItems.length;
  const rejectedInputCount = Math.max(0, itemCount - validItemCount);

  const canProcess =
    activeTab === 'enlace'
      ? validLinkItems.some((url) => validateTikTokUrl(url).ok)
      : validFileItems.length > 0;

  // Process handler
  const handleProcess = async () => {
    if (busy || !canProcess) return;
    setBusy(true);
    setShowQueue(true);
    setQueueFinished(false);

    let initialQueue: QueueItemState[] = [];
    let urlsToSubmit: string[] = [];

    if (activeTab === 'enlace') {
      initialQueue = validLinkItems.map((value) => {
        const check = validateTikTokUrl(value);
        return {
          label: value,
          url: check.ok ? check.normalized : value,
          status: check.ok ? 'pending' : 'rejected',
          progress: check.ok ? 0 : 100,
          error: check.ok ? undefined : `Enlace rechazado: ${check.issue}`,
        } satisfies QueueItemState;
      });
      urlsToSubmit = initialQueue.filter((item) => item.status === 'pending').map((item) => item.url);
   } else if (activeTab === 'cuenta') {
    } else {
      // Archivo: solo se admiten listas de URLs. Los medios binarios no forman
      // parte del contrato de ingestión de Beta 2.
      const textFiles = files.filter((f) => f.rawFile && ['.txt', '.csv'].includes(fileExtension(f.name)));
      const extractedUrls: string[] = [];
      for (const tf of textFiles) {
        if (tf.rawFile) {
          try {
            const content = await tf.rawFile.text();
            const lines = content.split(/\r?\n|,|;/).map((s) => s.trim()).filter(Boolean);
            if (lines.length === 0) {
              initialQueue.push({
                label: tf.name,
                url: tf.name,
                status: 'rejected',
                progress: 100,
                error: 'El archivo no contiene URLs para procesar.',
              });
            } else {
              extractedUrls.push(...lines);
            }
          } catch {
            initialQueue.push({
              label: tf.name,
              url: tf.name,
              status: 'rejected',
              progress: 100,
              error: 'No se pudo leer el archivo. Vuelve a seleccionarlo.',
            });
          }
        }
      }
      initialQueue = [
        ...initialQueue,
        ...extractedUrls.map((value) => {
        const check = validateTikTokUrl(value);
        return {
          label: value,
          url: check.ok ? check.normalized : value,
          status: check.ok ? 'pending' : 'rejected',
          progress: check.ok ? 0 : 100,
          error: check.ok ? undefined : `Enlace rechazado: ${check.issue}`,
        } satisfies QueueItemState;
        }),
      ];
      urlsToSubmit = initialQueue.filter((item) => item.status === 'pending').map((item) => item.url);
    }

    setQueueItems(initialQueue);

    // The backend is the only authority for completion. No row is marked
    // ready before add_job has returned.
    let submissionAccepted = false;
    try {
      if (urlsToSubmit.length > 0) {
        setQueueItems((prev) => prev.map((item) => item.status === 'pending'
          ? { ...item, status: 'running', progress: 20 }
          : item));
        const result: SubmitLinksResult = await onSubmitLinks(urlsToSubmit);
        submissionAccepted = result.accepted.length > 0;
        const accepted = new Set(result.accepted.map((item) => item.url));
        const rejected = new Map(result.rejected.map((item) => [item.url, item.reason]));
        setQueueItems((prev) => prev.map((item) => {
          if (accepted.has(item.url)) return { ...item, status: 'accepted', progress: 0 };
          if (rejected.has(item.url)) return {
            ...item,
            status: 'rejected',
            progress: 100,
            error: rejected.get(item.url),
          };
          return item;
        }));
      } else {
        setQueueItems((prev) => prev.map((item) => item.status === 'pending'
          ? { ...item, status: 'rejected', progress: 100, error: 'No hay enlaces válidos para enviar.' }
          : item));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'No se pudo enviar el contenido.';
      setQueueItems((prev) => prev.map((item) => item.status === 'running'
        ? { ...item, status: 'rejected', progress: 100, error: reason }
        : item));
    } finally {
      setBusy(false);
      if (submissionAccepted) {
        // La cola en directo representa únicamente trabajo pendiente. Una
        // vez aceptado el contenido, el estado durable vive en QueueSection y
        // la tarjeta temporal desaparece del formulario.
        setShowQueue(false);
        setQueueItems([]);
        setQueueFinished(false);
      } else {
        setQueueFinished(true);
      }
    }
  };

  return (
    <div className="pulsaria-ingest">
      <section className="ingest-card" id="card" ref={cardRef}>
        {/* Puerta: consentimiento */}
        {!consented ? (
          <section className="view enter" id="gView">
            <div className="brand">
              <span className="mk" />
              <span>Pulsaría</span>
            </div>
            <h1 className="title">Confirma tus derechos sobre el contenido</h1>
            <p className="sub">
              Pulsaría procesa material de TikTok. Antes de continuar, confirma tu relación con el contenido que vas a utilizar.
            </p>
            <ul className="points">
              <li>
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 12 2.5 2.5 4.5-5" />
                </svg>
                Tienes derechos, autorización o base legal suficiente sobre el material.
              </li>
              <li>
                <svg viewBox="0 0 24 24">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                </svg>
                Cumplirás los términos de servicio de TikTok y la legislación aplicable.
              </li>
              <li>
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
                El contenido procesado sin base legal podrá ser retirado y la cuenta suspendida.
              </li>
            </ul>
            <label className="ck">
              <input
                type="checkbox"
                id="gateCheck"
                checked={gateChecked}
                onChange={(e) => setGateChecked(e.target.checked)}
              />
              <span className="bx">
                <svg viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className="tx">He leído y acepto las condiciones sobre derechos de contenido.</span>
            </label>
            <button
              className="cta"
              id="gateCta"
              disabled={!gateChecked}
              onClick={handleAcceptConsent}
            >
              <svg viewBox="0 0 24 24">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
              Aceptar y continuar
            </button>
            <button
              type="button"
              className="plink"
              id="gatePolicy"
              onClick={() => {
                setCanRevokeInModal(false);
                setModalOpen(true);
              }}
            >
              Leer la política completa
            </button>
          </section>
        ) : (
          /* Espacio de trabajo */
          <section className="view enter" id="wView">
            {!profileMode && (
              <div className="seg seg--binary" id="seg" data-active={activeTab}>
                <span className="seg-ind" />
                <button
                  type="button"
                  className={activeTab === 'enlace' ? 'on' : ''}
                  data-tab="enlace"
                  disabled={busy}
                  onClick={() => setActiveTab('enlace')}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Enlace
                </button>
                <button
                  type="button"
                  className={activeTab === 'archivo' ? 'on' : ''}
                  data-tab="archivo"
                  disabled={busy}
                  onClick={() => setActiveTab('archivo')}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Archivo
                </button>
              </div>
            )}

            {/* Panel Enlace */}
            <div className={`panel ${activeTab === 'enlace' ? 'on' : ''}`} id="p-enlace">
              <div id="rows">
                {rows.map((rowVal, idx) => {
                  const isTikTok = /tiktok\.com/i.test(rowVal.trim());
                  return (
                    <div
                      key={idx}
                      className={`row ${rows.length === 1 ? 'one' : ''} ${isTikTok ? 'okv' : ''}`}
                    >
                      <svg className="ic" viewBox="0 0 24 24">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <input
                        ref={idx === 0 ? firstUrlInputRef : undefined}
                        type="url"
                        aria-label={`URL de TikTok ${idx + 1}`}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="url"
                        value={rowVal}
                        disabled={busy}
                        onChange={(e) => updateRow(idx, e.target.value)}
                      />
                      <ContextInfo text={TAB_HELP.enlace} />
                      <button
                        type="button"
                        className="x"
                        aria-label="Quitar enlace"
                        disabled={busy || rows.length <= 1}
                        onClick={() => removeRow(idx)}
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
              {rows.some((r) => r.trim().length > 0) && rows.length < 8 && (
                <button
                  type="button"
                  className="add"
                  id="addBtn"
                  disabled={busy}
                  onClick={addRow}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  Añadir otro enlace
                </button>
              )}
            </div>

            {/* Panel Perfiles: la clave interna cuenta conserva compatibilidad. */}
            <div className={`${activeTab === 'cuenta' ? 'panel on' : 'panel'} panel-with-info`} id="p-cuenta">
              <ContextInfo text={TAB_HELP.cuenta} className="panel-info" />
              <TikTokSourcesPanel />
            </div>
            <div className={`panel ${activeTab === 'archivo' ? 'on' : ''} panel-with-info`} id="p-archivo">
              <ContextInfo text={TAB_HELP.archivo} className="panel-info" />
              <div
                className={`dz ${isDragOver ? 'over' : ''}`}
                id="dz"
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-label="Seleccionar archivo TXT o CSV con URLs de TikTok"
                aria-describedby="file-help"
                onClick={() => !busy && fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (!busy && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  handleFilesAdded(e.dataTransfer.files);
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                  <path d="M12 12v9" />
                  <path d="m16 16-4-4-4 4" />
                </svg>
                <div className="t">Arrastra archivos aquí</div>
                <div className="h" id="file-help">o haz clic para seleccionarlos · solo TXT o CSV con URLs</div>
              </div>
              {fileError && <div role="alert" className="mt-2 text-[10px] text-[#fe2c55]/90">{fileError}</div>}
              <input
                ref={fileInputRef}
                type="file"
                id="fin"
                multiple
                accept=".txt,.csv,text/plain,text/csv"
                hidden
                onChange={(e) => {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }}
              />
              <div id="flist">
                {files.map((fileItem, fIdx) => (
                  <div key={`${fileItem.name}-${fIdx}`} className="fchip">
                    <svg viewBox="0 0 24 24">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="n">{fileItem.name}</span>
                    <span className="s">{formatBytes(fileItem.size)}</span>
                    <button
                      type="button"
                      className="x"
                      aria-label="Quitar archivo"
                      disabled={busy}
                      onClick={() => removeFile(fIdx)}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {activeTab !== 'cuenta' && (
              <div className="actions">
                {!runtimeReady && !profileMode && runtimeIssue && (
                  <p role="status" className="rounded-xl bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-white/70">{runtimeIssue}</p>
                )}
                {activeTab === 'enlace' && rejectedInputCount > 0 && (
                  <p role="status" aria-live="polite" className="mb-2 rounded-xl bg-[#fe2c55]/10 px-3 py-2 text-[10px] leading-relaxed text-white/80">
                    Hay {rejectedInputCount} {rejectedInputCount === 1 ? 'entrada no válida' : 'entradas no válidas'}. Usa URLs HTTPS de TikTok; las entradas inválidas se omiten.
                  </p>
                )}
                <button
                  type="button"
                  className={busy ? 'cta busy' : 'cta'}
                  id="cta"
                  disabled={busy || !canProcess || (!runtimeReady && !profileMode)}
                  onClick={handleProcess}
                >
                  <svg className="rk" viewBox="0 0 24 24">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                  </svg>
                  <svg className="sp" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeDasharray="40" strokeDashoffset="13" strokeLinecap="round" />
                  </svg>
                  <span className="cta-copy">
                    {itemCount > 0 && (
                      <span className="cta-count" id="statline">
                        <b id="num">{validItemCount}</b>
                        <span id="lbl">
                          {activeTab === 'enlace'
                            ? validItemCount === 1
                              ? 'enlace válido para procesar'
                              : 'enlaces válidos para procesar'
                            : itemCount === 1
                              ? 'archivo seleccionado'
                              : 'archivos seleccionados'}
                        </span>
                      </span>
                    )}
                    <span id="ctaTx">{busy ? 'Procesando…' : 'Procesar'}</span>
                  </span>
                </button>
              </div>
            )}
            <p className="text-[10px] text-white/30 text-center mt-2.5 px-2 leading-normal">
              {activeTab === 'cuenta' ? 'Las fuentes conectadas usan tu sesión local de cookies y no inician sesión dentro de Pulsaria · ' : 'Al procesar confirmas tener los derechos correspondientes · '}{' '}
              <button
                type="button"
                onClick={() => {
                  setCanRevokeInModal(true);
                  setModalOpen(true);
                }}
                className="text-white/50 hover:text-white underline transition-colors cursor-pointer"
              >
                Política
              </button>
            </p>

            {/* Cola en directo */}
            {showQueue && (
              <div className="q" id="qbox">
                <div className="hd">
                  <span className="t">
                    <span className={`d ${busy ? 'run' : ''}`} id="qdot" /> Cola en directo
                  </span>
                  <span className="n" id="qn">
                    {queueItems.length} {queueItems.length === 1 ? 'elemento' : 'elementos'}
                  </span>
                </div>
                <div id="qlist">
                  {queueItems.map((item, qIdx) => (
                    <div key={qIdx} className="qi">
                      <div className="tp">
                        <span className="i">{String(qIdx + 1).padStart(2, '0')}</span>
                        <span className="u">{item.label}</span>
                        <span
                          className={`s ${item.status === 'running' ? 'run' : item.status === 'accepted' ? 'done' : item.status === 'rejected' ? 'error' : ''}`}
                        >
                          {item.status === 'running'
                            ? 'Extrayendo…'
                            : item.status === 'accepted'
                            ? t('linkAccepted')
                            : item.status === 'rejected'
                            ? 'Rechazado'
                            : 'En cola'}
                        </span>
                      </div>
                      <div className="tr">
                        <div
                          className={`fl ${item.status === 'accepted' ? 'done' : ''}`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      {item.error && <p className="text-[10px] text-[#fe2c55]/80 mt-1">{item.error}</p>}
                    </div>
                  ))}
                </div>
                {queueFinished && (
                  <div className="fin" id="qfin">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span id="qfinTx">
                      Proceso finalizado · {queueItems.filter((item) => item.status === 'accepted').length} aceptados,{' '}
                      {queueItems.filter((item) => item.status === 'rejected').length} rechazados
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </section>

      {/* Modal de política de contenido */}
      {mounted && modalOpen &&
        createPortal(
          <div
            className="pulsaria-ingest-modal-ov open"
            id="ov"
            aria-hidden="false"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div className="mo" role="dialog" aria-modal="true" aria-labelledby="content-policy-title">
              <h4 id="content-policy-title">Política de contenido</h4>
              <p>
                Sólo se procesa contenido del que posees los derechos, autorización expresa o base legal suficiente. No utilices material de terceros sin permiso.
              </p>
              <p>
                Debes cumplir los Términos de Servicio de TikTok, las condiciones de la plataforma y la legislación aplicable en materia de propiedad intelectual y protección de datos.
              </p>
              <p>
                El contenido procesado sin base legal podrá ser retirado y la cuenta suspendida sin previo aviso.
              </p>
              <div className="mrow">
                {canRevokeInModal && (
                  <button
                    type="button"
                    className="mbtn danger"
                    id="revokeBtn"
                    onClick={handleRevokeConsent}
                  >
                    Revocar consentimiento
                  </button>
                )}
                <button
                  type="button"
                  className="mbtn"
                  id="closeBtn"
                  onClick={() => setModalOpen(false)}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
