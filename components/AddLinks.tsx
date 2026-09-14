'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FaFileLines, FaLink, FaPlus, FaRocket, FaXmark } from 'react-icons/fa6';
import { useI18n } from '@/lib/i18n';
import { validateTikTokUrl, type TikTokUrlIssue } from '@/lib/url-validation';

interface AddLinksProps {
  onSubmitLinks: (urls: string[]) => Promise<void>;
}

const CONTENT_RIGHTS_ACCEPTANCE_KEY = 'pulsaria.content-rights.v1';

function parseLinks(raw: string): { valid: string[]; invalid: number; issues: Partial<Record<TikTokUrlIssue, number>> } {
  const unique = [...new Set(raw.split(/\r?\n|,|;/).map((value) => value.trim()).filter(Boolean))];
  const issues: Partial<Record<TikTokUrlIssue, number>> = {};
  const valid = unique.filter((value) => {
    const result = validateTikTokUrl(value);
    if (result.ok) return true;
    issues[result.issue] = (issues[result.issue] ?? 0) + 1;
    return false;
  });
  return { valid, invalid: unique.length - valid.length, issues };
}

export function AddLinks({ onSubmitLinks }: AddLinksProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');
  const [localLinks, setLocalLinks] = useState<string[]>(['']);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState<ReturnType<typeof parseLinks> | null>(null);
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CONTENT_RIGHTS_ACCEPTANCE_KEY) || 'null') as { version?: string } | null;
      setRightsAccepted(stored?.version === '1.0');
    } catch {
      setRightsAccepted(false);
    }
  }, []);

  const linkCount = useMemo(() => localLinks.filter((link) => link.trim()).length, [localLinks]);
  const parsedLinkInput = useMemo(() => parseLinks(localLinks.join('\n')), [localLinks]);
  const hasData = activeTab === 'link'
    ? parsedLinkInput.valid.length > 0
    : Boolean(file);
  const visibleValidation = activeTab === 'link' && linkCount > 0
    ? parsedLinkInput
    : validation;

  const updateLink = (index: number, value: string) => {
    setLocalLinks((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
    setValidation(null);
  };

  const addRow = () => setLocalLinks((current) => [...current, '']);

  const removeRow = (index: number) => {
    setLocalLinks((current) => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index));
    setValidation(null);
  };

  const handleSubmit = async () => {
    if (submitting || !hasData || !rightsAccepted) return;
    let raw = localLinks.join('\n');
    if (activeTab === 'file' && file) raw = await file.text();

    const parsed = parseLinks(raw);
      setValidation(parsed);
    if (parsed.valid.length === 0) return;

    setSubmitting(true);
    try {
      await onSubmitLinks(parsed.valid);
      setLocalLinks(['']);
      setFile(null);
      setValidation(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRightsAcceptance = (accepted: boolean) => {
    setRightsAccepted(accepted);
    if (!accepted) {
      localStorage.removeItem(CONTENT_RIGHTS_ACCEPTANCE_KEY);
      return;
    }
    localStorage.setItem(CONTENT_RIGHTS_ACCEPTANCE_KEY, JSON.stringify({ version: '1.0', acceptedAt: new Date().toISOString() }));
  };

  return (
    <motion.section
      className="relative w-full flex flex-col gap-3 flex-shrink-0 overflow-hidden rounded-[20px] border p-4 font-sans"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: 'linear-gradient(150deg, rgba(37, 17, 34, .92), rgba(10, 36, 42, .92) 72%, rgba(12, 15, 22, .96))',
        borderColor: 'rgba(255,255,255,.12)',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 14px 30px rgba(0,0,0,.28)',
      }}
    >
      <div role="tablist" aria-label={t('contentSource')} className="relative z-10 grid grid-cols-2 gap-1 rounded-[12px] border border-white/10 bg-black/25 p-1">
        <button type="button" role="tab" aria-selected={activeTab === 'link'} disabled={submitting} onClick={() => setActiveTab('link')} className={`flex items-center justify-center gap-2 rounded-[10px] py-2 text-[10px] font-black uppercase tracking-wider transition ${activeTab === 'link' ? 'border border-[#fe2c55]/50 bg-[#fe2c55]/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
          <FaLink size={12} /> {t('link')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'file'} disabled={submitting} onClick={() => setActiveTab('file')} className={`flex items-center justify-center gap-2 rounded-[10px] py-2 text-[10px] font-black uppercase tracking-wider transition ${activeTab === 'file' ? 'border border-[#25f4ee]/45 bg-[#25f4ee]/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
          <FaFileLines size={12} /> {t('file')}
        </button>
      </div>

      {activeTab === 'link' ? (
        <div className="relative z-10 flex flex-col gap-2">
          <p className="px-1 text-[10px] leading-relaxed text-white/45">{t('pasteLinks')}</p>
          <p className="px-1 text-[9px] uppercase tracking-wider text-[#25f4ee]/65">{t('supportedSources')}</p>
          <div className="flex max-h-[132px] flex-col gap-2 overflow-y-auto pr-1">
            {localLinks.map((link, index) => (
              <div key={`${index}-${localLinks.length}`} className="flex items-center gap-2">
                <input type="url" aria-label={`Enlace ${index + 1}`} value={link} onChange={(event) => updateLink(index, event.target.value)} placeholder="Pegar video, perfil, favoritos o colección de TikTok" disabled={submitting} className="min-w-0 flex-1 rounded-[12px] border border-white/10 bg-white/[.04] px-3 py-2.5 text-[11px] font-medium text-white outline-none transition focus:border-[#fe2c55]/55 disabled:opacity-50" />
                {localLinks.length > 1 && <button type="button" aria-label={`Quitar enlace ${index + 1}`} onClick={() => removeRow(index)} disabled={submitting} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 text-white/35 transition hover:border-[#fe2c55]/40 hover:text-white disabled:opacity-40"><FaXmark size={12} /></button>}
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} disabled={submitting} className="flex h-8 items-center justify-center gap-2 rounded-[12px] border border-dashed border-white/15 bg-white/[.025] text-[9px] font-black uppercase tracking-[.14em] text-white/45 transition hover:border-[#25f4ee]/45 hover:text-white disabled:opacity-40"><FaPlus size={9} /> {t('addLink')}</button>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col gap-2">
          <button type="button" onClick={() => !submitting && fileInputRef.current?.click()} className="flex h-[74px] items-center justify-center gap-3 rounded-[14px] border border-[#25f4ee]/20 bg-black/25 text-left transition hover:border-[#25f4ee]/50">
            <FaFileLines className="text-[#25f4ee]" size={18} />
            <span className="flex min-w-0 flex-col"><span className="truncate text-[11px] font-black uppercase tracking-wider text-white">{file?.name || 'Subir lista de enlaces'}</span><span className="mt-1 text-[9px] uppercase tracking-wider text-white/40">TXT o CSV · un enlace por línea</span></span>
          </button>
          <input ref={fileInputRef} type="file" accept=".txt,.csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </div>
      )}

      {visibleValidation && <div role="status" className="relative z-10 rounded-[12px] border border-white/10 bg-white/[.03] px-3 py-2 text-[10px] text-white/60"><span className="font-bold text-[#25f4ee]">{visibleValidation.valid.length} enlace{visibleValidation.valid.length === 1 ? '' : 's'} listo{visibleValidation.valid.length === 1 ? '' : 's'} para enviar.</span>{visibleValidation.issues.too_long && <span className="ml-1 text-amber-200">{t('urlTooLong', { count: visibleValidation.issues.too_long })}</span>}{visibleValidation.issues.non_https && <span className="ml-1 text-white/45">{t('nonHttpsLinks', { count: visibleValidation.issues.non_https })}</span>}{visibleValidation.issues.unsupported_platform && <span className="ml-1 text-white/45">{t('unsupportedPlatformLinks', { count: visibleValidation.issues.unsupported_platform })}</span>}{visibleValidation.issues.malformed && <span className="ml-1 text-white/45">{t('malformedLinks', { count: visibleValidation.issues.malformed })}</span>}{visibleValidation.issues.empty && <span className="ml-1 text-white/45">{t('invalidLinks', { count: visibleValidation.issues.empty })}</span>}</div>}

      <div className="relative z-10 rounded-[12px] border border-amber-300/20 bg-amber-300/[.05] px-3 py-2.5 text-[9px] leading-relaxed text-white/60">
        <p className="font-black uppercase tracking-wider text-amber-200">{t('contentRightsTitle')}</p>
        <p className="mt-1">{t('contentRightsDescription')}</p>
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-white/75">
          <input type="checkbox" checked={rightsAccepted} onChange={(event) => handleRightsAcceptance(event.target.checked)} disabled={submitting} className="mt-0.5 accent-amber-300" />
          <span>{t('contentRightsAck')}</span>
        </label>
        <a className="mt-1 inline-block text-amber-200 underline decoration-amber-200/40 underline-offset-2" href="https://github.com/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.es.md" target="_blank" rel="noreferrer">{t('readContentPolicy')}</a>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 text-[9px] uppercase tracking-wider text-white/35"><span>{activeTab === 'link' ? `${linkCount} enlace${linkCount === 1 ? '' : 's'} en el formulario` : file ? 'Archivo listo' : 'Sin archivo seleccionado'}</span><span className="text-[#25f4ee]/70">La cola se inicia con el botón</span></div>

      <motion.button type="button" onClick={() => void handleSubmit()} disabled={!hasData || !rightsAccepted || submitting} whileHover={hasData && rightsAccepted && !submitting ? { y: -1 } : undefined} whileTap={hasData && rightsAccepted && !submitting ? { scale: .985 } : undefined} className="relative z-10 flex w-full items-center justify-center gap-2 rounded-[14px] border border-white/15 py-3 text-[11px] font-black uppercase tracking-[.14em] text-white transition disabled:cursor-not-allowed disabled:opacity-35" style={{ background: hasData && rightsAccepted && !submitting ? 'linear-gradient(135deg,#fe2c55,#8a5cff)' : 'rgba(255,255,255,.06)', boxShadow: hasData && rightsAccepted && !submitting ? '0 8px 24px rgba(254,44,85,.22)' : 'none' }}>
        <FaRocket size={13} />
        {submitting ? t('sendingToQueue') : t('processContent')}
      </motion.button>
    </motion.section>
  );
}
