'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  FaArrowUpRightFromSquare,
  FaShieldHalved,
  FaFileContract,
  FaScaleBalanced,
  FaUserShield,
  FaPhotoFilm,
  FaCheck
} from '@/components/icon-library';
import { useI18n } from '@/lib/i18n';

const LEGAL_LINKS = {
  eula: 'https://github.com/danielunibe/PulsarIA/blob/main/EULA.es.md',
  terms: 'https://github.com/danielunibe/PulsarIA/blob/main/TERMS_OF_USE.es.md',
  privacy: 'https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md',
  content: 'https://github.com/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.es.md',
} as const;

export interface LegalConsentModalProps {
  loading: boolean;
  saving: boolean;
  error: string | null;
  onAccept: (locale: 'es-MX' | 'en-US') => Promise<boolean>;
  allowClose?: boolean;
  onClose?: () => void;
}

export function LegalConsentModal({ loading, saving, error, onAccept, allowClose = false, onClose }: LegalConsentModalProps) {
  const { locale } = useI18n();
  const [accepted, setAccepted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const english = locale === 'en-US';

  useEffect(() => {
    if (!loading) titleRef.current?.focus();
  }, [loading]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (allowClose) onClose?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], input:not(:disabled), button:not(:disabled)')
    );
    if (focusable.length === 0) {
      event.preventDefault();
      titleRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);

    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && currentIndex === -1) {
      event.preventDefault();
      first.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
    }
  };

  const text = english
    ? {
      title: 'Before using Pulsaria',
      description: 'Review and accept the legal documents before entering your local video library.',
      eula: 'EULA Agreement', terms: 'Terms of Use', privacy: 'Privacy Policy', content: 'Content Rights',
      acknowledgement: 'I have read, understood, and accept the EULA, Terms of Use, Privacy Policy, and Content Policy.',
      continue: 'Accept and Continue', blocked: 'You must confirm the legal agreement to proceed.',
      error: 'The acceptance could not be saved. Try again.',
    }
    : {
      title: 'Antes de usar Pulsaria',
      description: 'Revisa y confirma los acuerdos legales antes de acceder a tu biblioteca local de videos.',
      eula: 'Acuerdo EULA', terms: 'Términos de Uso', privacy: 'Política de Privacidad', content: 'Derechos de Contenido',
      acknowledgement: 'He leído y acepto el EULA, los términos de uso, la política de privacidad y la política de contenido.',
      continue: 'Aceptar y Continuar', blocked: 'Debes confirmar todos los documentos para continuar.',
      error: 'No se pudo guardar la aceptación. Inténtalo de nuevo.',
    };

  const links = [
    { label: text.eula, href: LEGAL_LINKS.eula, icon: FaFileContract },
    { label: text.terms, href: LEGAL_LINKS.terms, icon: FaScaleBalanced },
    { label: text.privacy, href: LEGAL_LINKS.privacy, icon: FaUserShield },
    { label: text.content, href: LEGAL_LINKS.content, icon: FaPhotoFilm },
  ];

  if (loading) {
    return (
      <div
        className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/90 p-5 backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulsaria-legal-loading"
      >
        <div className="rounded-[24px] bg-[#0c0f17] px-8 py-7 text-sm font-bold text-white/70 shadow-[0_25px_70px_rgba(0,0,0,0.9)] flex items-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-[#25f4ee] border-t-transparent animate-spin" />
          <span id="pulsaria-legal-loading">{english ? 'Checking legal consent…' : 'Comprobando la aceptación legal…'}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/90 p-5 backdrop-blur-2xl transition-opacity duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pulsaria-legal-title"
      aria-describedby="pulsaria-legal-description"
    >
      <div className="w-full max-w-lg rounded-[28px] bg-[#0c0f17] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.95)] overflow-hidden relative font-sans animate-in fade-in zoom-in-95 duration-200">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#25f4ee]/10 via-[#8a5cff]/05 to-transparent rounded-full blur-3xl pointer-events-none" />

        {allowClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar revisión de consentimiento"
            className="absolute right-5 top-5 z-20 rounded-xl bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/50 transition-colors hover:bg-white/[0.10] hover:text-white focus-visible:shadow-[0_0_0_2px_rgba(37,244,238,0.45)]"
          >
            Cerrar
          </button>
        )}

        <div className="flex items-start gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#25f4ee]/20 to-[#8a5cff]/20 flex items-center justify-center text-[#25f4ee] shrink-0 shadow-[0_0_20px_rgba(37,244,238,0.2)]">
            <FaShieldHalved size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 id="pulsaria-legal-title" ref={titleRef} tabIndex={-1} className="text-xl font-black tracking-tight text-white">
              {text.title}
            </h1>
            <p id="pulsaria-legal-description" className="mt-1.5 text-xs leading-relaxed text-white/60">
              {text.description}
            </p>
          </div>
        </div>

        {/* 2-column legal link cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative z-10">
          {links.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] p-3.5 text-xs font-semibold text-white/80 transition-all duration-200 group cursor-pointer focus-visible:bg-white/[0.08] focus-visible:shadow-[0_0_0_2px_rgba(37,244,238,0.4)]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-white/40 group-hover:text-[#25f4ee] transition-colors">
                  <Icon size={14} />
                </span>
                <span className="truncate">{label}</span>
              </div>
              <FaArrowUpRightFromSquare size={10} className="text-white/30 group-hover:text-[#25f4ee] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 ml-1.5" />
            </a>
          ))}
        </div>

        {/* Checkbox agreement */}
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] p-4 text-xs leading-relaxed text-white/80 transition-colors relative z-10 select-none focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_2px_rgba(37,244,238,0.35)]">
          <div
            className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all shrink-0 mt-0.5 ${
              accepted
                ? 'bg-[#25f4ee] text-black shadow-[0_0_12px_rgba(37,244,238,0.4)]'
                : 'bg-white/10 hover:bg-white/20 text-transparent'
            }`}
          >
            <FaCheck size={11} className={accepted ? 'opacity-100' : 'opacity-0'} />
          </div>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="sr-only"
          />
          <span className="text-[11px] leading-normal text-white/70">
            {text.acknowledgement}
          </span>
        </label>

        {error && (
          <p className="mt-3 text-xs font-medium text-[#fe2c55] bg-[#fe2c55]/10 p-2.5 rounded-xl">
            {error || text.error}
          </p>
        )}
        {!accepted && (
          <p className="mt-2.5 text-[10px] text-white/35 font-medium px-1">
            {text.blocked}
          </p>
        )}

        <button
          type="button"
          disabled={!accepted || saving}
          onClick={() => void onAccept(locale)}
          className={`mt-5 w-full rounded-2xl px-5 py-3.5 text-xs font-black uppercase tracking-[0.14em] transition-all duration-300 focus-visible:shadow-[0_0_0_2px_rgba(37,244,238,0.45)] ${
            !accepted || saving
              ? 'cursor-not-allowed bg-white/[0.06] text-white/40 shadow-none'
              : 'bg-gradient-to-r from-[#25f4ee] to-[#20dcd6] text-[#071216] shadow-[0_4px_25px_rgba(37,244,238,0.25)] hover:from-white hover:to-white hover:shadow-[0_6px_30px_rgba(255,255,255,0.3)] hover:scale-[1.01] active:scale-[0.99]'
          }`}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Guardando…
            </span>
          ) : (
            text.continue
          )}
        </button>
      </div>
    </div>
  );
}
