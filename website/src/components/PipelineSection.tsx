import React, { useState } from 'react';

const stages = [
  {
    number: '01', tag: 'INGESTA', title: 'Añade una fuente compatible',
    body: 'La aplicación valida la entrada, crea un trabajo y, cuando se trata de una colección compatible, puede expandirla en elementos de trabajo. La disponibilidad depende de la fuente y sus condiciones de acceso.',
    detail: 'Aplicación de escritorio · consentimiento de derechos · cola persistente',
  },
  {
    number: '02', tag: 'PROCESAMIENTO', title: 'Procesa el medio en el equipo',
    body: 'Los workers coordinan la descarga autorizada, la extracción de audio y la transcripción cuando el runtime y los recursos requeridos están disponibles.',
    detail: 'Workers Python · audio · transcripción local',
  },
  {
    number: '03', tag: 'ANÁLISIS VISUAL', title: 'Crea referencias visuales',
    body: 'El flujo puede generar fotogramas seleccionados y artefactos que la biblioteca asocia al trabajo para apoyar la inspección del contenido.',
    detail: 'Fotogramas · artefactos locales · referencias validadas',
  },
  {
    number: '04', tag: 'ÍNDICE Y BÚSQUEDA', title: 'Encuentra por texto o significado',
    body: 'Pulsaria ofrece búsqueda textual y semántica sobre los datos disponibles. La experiencia depende de las transcripciones, los embeddings y los índices preparados.',
    detail: 'Texto · embeddings · índice vectorial',
  },
  {
    number: '05', tag: 'BIBLIOTECA', title: 'Consulta el trabajo guardado',
    body: 'El estado del trabajo y los registros de la biblioteca se guardan localmente. La reproducción requiere una referencia de medio válida y disponible.',
    detail: 'Tauri 2 · Rust · SQLite · WebView2 en Windows',
  },
];

export const PipelineSection: React.FC = () => {
  const [active, setActive] = useState(0);
  const stage = stages[active];

  return (
    <section className="relative py-28 sm:py-36 bg-[#070709] text-white border-y border-white/[0.08]" id="pipeline" data-nav="dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="max-w-3xl mb-12">
          <span className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#25F4EE] block mb-4">Cómo trabaja Pulsaria</span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.08] mb-5">De una fuente autorizada a una biblioteca que puedes consultar.</h2>
          <p className="text-base sm:text-lg text-white/70 leading-relaxed">El procesamiento ocurre en el flujo local de la aplicación de escritorio. Esta explicación muestra las etapas; no es una telemetría ni un registro de ejecución en vivo.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-b border-white/10 py-4 mb-10 font-mono text-xs">
          {stages.map((item, index) => (
            <button key={item.number} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className={`p-3 text-left transition-all border rounded-xl ${active === index ? 'bg-white text-black font-bold border-white' : 'bg-transparent text-white/60 hover:text-white border-transparent hover:border-white/15'}`}>
              <span className="block text-[10px] opacity-60 mb-0.5">ETAPA {item.number}</span>{item.tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-b border-white/10 pb-12">
          <div className="lg:col-span-7">
            <div className="text-[11px] font-mono text-[#25F4EE] uppercase tracking-widest mb-2">ETAPA {stage.number} · {stage.tag}</div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-3">{stage.title}</h3>
            <p className="text-sm sm:text-base text-white/70 leading-relaxed">{stage.body}</p>
          </div>
          <div className="lg:col-span-5 border-l border-white/10 pl-5 flex items-center">
            <div>
              <div className="text-white/40 uppercase tracking-wider text-[10px] mb-3">Contexto técnico</div>
              <p className="text-sm font-mono text-white/80">{stage.detail}</p>
              <p className="text-xs text-white/45 mt-4">Los recursos y resultados varían según instalación, configuración, equipo y fuente.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
