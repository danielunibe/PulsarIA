import React from 'react';
import { PRIVACY_ROWS } from '../data/pulsariaData';

export const PrivacySection: React.FC = () => (
  <section className="relative py-28 sm:py-36 bg-[#040406] text-white border-b border-white/[0.08]" id="privacidad" data-nav="dark">
    <div className="max-w-7xl mx-auto px-4 sm:px-8">
      <div className="max-w-3xl mb-14 sm:mb-16">
        <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">Privacidad y conectividad</span>
        <h2 className="text-3xl sm:text-5xl lg:text-[48px] font-bold tracking-tight leading-[1.08] mb-6">Tus medios permanecen en la biblioteca local del escritorio.</h2>
        <p className="text-base sm:text-lg text-white/70 leading-relaxed">
          Pulsaria es local-first, pero no promete que cada tarea funcione sin internet.
          La importación de fuentes requiere conectividad, y Gemini es una función externa opcional.
          Este sitio público explica el producto; no se conecta a la biblioteca del usuario.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 border-t border-b border-white/10 py-12">
        <div>
          <div className="pb-4 mb-5 border-b border-white/10 text-xs font-mono font-bold tracking-wider uppercase">Qué hace este sitio</div>
          <p className="text-sm text-white/70 leading-relaxed mb-6">La web es informativa. No solicita una cuenta ni muestra o sincroniza la colección del programa de escritorio.</p>
          <a href="privacy.html" className="text-sm text-[#25F4EE] hover:underline">Leer la política de privacidad →</a>
        </div>
        <div>
          <div className="pb-4 mb-5 border-b border-white/10 text-xs font-mono font-bold tracking-wider uppercase">Información sobre el producto</div>
          <div className="divide-y divide-white/10">
            {PRIVACY_ROWS.map((row) => (
              <div key={row.label} className="py-4">
                <h3 className="text-sm font-semibold text-white mb-1">{row.label}</h3>
                <p className="text-sm text-white/65 leading-relaxed">{row.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-8 max-w-4xl text-xs text-white/45 leading-relaxed">
        Las descargas y funciones de red pueden enviar solicitudes a las plataformas de origen.
        Si eliges una función de Gemini, los fragmentos seleccionados se envían a Google. Consulta
        los documentos completos antes de usar el producto.
      </p>
    </div>
  </section>
);
