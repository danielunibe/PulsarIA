'use client';

import { useState } from 'react';
import { FaArrowUpRightFromSquare, FaShieldHalved } from 'react-icons/fa6';
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
}

export function LegalConsentModal({ loading, saving, error, onAccept }: LegalConsentModalProps) {
  const { locale } = useI18n();
  const [accepted, setAccepted] = useState(false);
  const english = locale === 'en-US';

  const text = english
    ? {
      title: 'Before using Pulsaria',
      description: 'Review and accept the legal documents before entering your local library.',
      eula: 'EULA', terms: 'Terms of use', privacy: 'Privacy policy', content: 'Content policy',
      acknowledgement: 'I have read and accept the EULA, terms of use, privacy policy and content policy.',
      continue: 'Accept and continue', blocked: 'You must accept all documents to continue.',
      error: 'The acceptance could not be saved. Try again.',
    }
    : {
      title: 'Antes de usar Pulsaria',
      description: 'Revisa y acepta los documentos legales antes de entrar a tu biblioteca local.',
      eula: 'EULA', terms: 'Términos de uso', privacy: 'Política de privacidad', content: 'Política de contenido',
      acknowledgement: 'He leído y acepto el EULA, los términos de uso, la política de privacidad y la política de contenido.',
      continue: 'Aceptar y continuar', blocked: 'Debes aceptar todos los documentos para continuar.',
      error: 'No se pudo guardar la aceptación. Inténtalo de nuevo.',
    };

  const links = [
    [text.eula, LEGAL_LINKS.eula],
    [text.terms, LEGAL_LINKS.terms],
    [text.privacy, LEGAL_LINKS.privacy],
    [text.content, LEGAL_LINKS.content],
  ] as const;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="pulsaria-legal-loading">
        <div className="rounded-[24px] border border-white/15 bg-[#10141e]/95 px-8 py-7 text-sm font-bold text-white/70 shadow-2xl shadow-black/60">
          <span id="pulsaria-legal-loading">{english ? 'Checking legal consent…' : 'Comprobando la aceptación legal…'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="pulsaria-legal-title">
      <div className="w-full max-w-xl rounded-[24px] border border-white/15 bg-[#10141e]/95 p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-[#25f4ee]/25 bg-[#25f4ee]/10 p-3 text-[#25f4ee]"><FaShieldHalved size={20} /></div>
          <div>
            <h1 id="pulsaria-legal-title" className="text-lg font-black tracking-tight text-white">{text.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{text.description}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {links.map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs font-bold text-white/75 transition hover:border-[#25f4ee]/40 hover:text-[#25f4ee]">
              <span>{label}</span><FaArrowUpRightFromSquare size={11} />
            </a>
          ))}
        </div>

        <label className="mt-6 flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-white/75">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#25f4ee]" />
          <span>{text.acknowledgement}</span>
        </label>

        {error && <p className="mt-3 text-xs text-[#fe2c55]">{error || text.error}</p>}
        {!accepted && <p className="mt-3 text-[11px] text-amber-300/75">{text.blocked}</p>}

        <button type="button" disabled={!accepted || saving} onClick={() => void onAccept(locale)} className="mt-6 w-full rounded-xl bg-[#25f4ee] px-4 py-3 text-xs font-black uppercase tracking-[.12em] text-[#071216] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35">
          {saving ? 'Guardando…' : text.continue}
        </button>
      </div>
    </div>
  );
}
