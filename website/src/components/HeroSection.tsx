import React from 'react';
import { motion } from 'motion/react';
import { PulsarCanvas } from './PulsarCanvas';
import { CURRENT_PUBLIC_RELEASE, RELEASE_CANONICA } from '../data/pulsariaData';

export const HeroSection: React.FC = () => {
  return (
    <section className="hero darkbg on" id="hero" data-nav="dark">
      <PulsarCanvas />
      <div className="wrap">
        <motion.div
          className="hero-copy"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.3 }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.12,
                delayChildren: 0.05,
              },
            },
          }}
        >
          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 28, filter: 'blur(4px)' },
              visible: {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
              },
            }}
          >
            <span className="ln">
              <i style={{ transform: 'none' }}>Recuerda</i>
            </span>
            <span className="ln">
              <i style={{ transform: 'none' }}>
                lo que viste<span className="dot">.</span>
              </i>
            </span>
          </motion.h1>

          <motion.p
            className="sub"
            style={{ opacity: 1, transform: 'none' }}
            variants={{
              hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
              visible: {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
              },
            }}
          >
            Organiza y vuelve a encontrar videos que tienes derecho a procesar.
            Pulsaria los conserva en una biblioteca local y permite buscar en sus
            títulos y transcripciones; también ofrece búsqueda semántica cuando el
            índice está preparado. Es una aplicación de escritorio para Windows,
            no una biblioteca web.
          </motion.p>

          {/* CTA Buttons: GitHub & Windows 11/10 alineados con el texto */}
          <motion.div
            className="mt-8 flex flex-col items-start gap-3.5"
            style={{ opacity: 1, transform: 'none' }}
            variants={{
              hidden: { opacity: 0, y: 22, scale: 0.98 },
              visible: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
              },
            }}
          >
            <div className="flex flex-wrap items-center justify-start gap-3.5 w-full sm:w-auto">
              {/* Botón Negro Disponible en Windows 11/10 */}
              <a
                href="#descargar"
                className="group inline-flex items-center gap-3.5 px-5 py-3.5 rounded-xl bg-[#09090c] text-white font-medium border border-neutral-800 hover:border-neutral-600 hover:bg-[#121217] active:scale-[0.98] transition-all duration-200 shadow-xl text-left min-w-[210px]"
              >
                {/* Icono SVG Oficial de Windows 11 (4 cuadros en cuadrícula) */}
                <svg
                  className="w-5 h-5 fill-current text-[#25F4EE] group-hover:scale-105 transition-transform duration-200 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M0 0h11.377v11.377H0V0zm12.623 0H24v11.377H12.623V0zM0 12.623h11.377V24H0V12.623zm12.623 0H24V24H12.623V12.623z" />
                </svg>
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.14em]">
                    Disponible en
                  </span>
                  <span className="text-[15px] font-bold text-white tracking-tight">
                    Windows x64
                  </span>
                </div>
              </a>

              {/* Botón Negro GitHub */}
              <a
                href="https://github.com/danielunibe/PulsarIA"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3.5 px-5 py-3.5 rounded-xl bg-[#09090c] text-white font-medium border border-neutral-800 hover:border-neutral-600 hover:bg-[#121217] active:scale-[0.98] transition-all duration-200 shadow-xl text-left min-w-[210px]"
              >
                {/* Icono SVG Oficial de GitHub */}
                <svg
                  className="w-6 h-6 fill-current text-neutral-300 group-hover:text-white group-hover:scale-105 transition-transform duration-200 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.14em]">
                    Ver código en
                  </span>
                  <span className="text-[15px] font-bold text-white tracking-tight">
                    GitHub
                  </span>
                </div>
              </a>
            </div>

            <p className="text-[11.5px] font-mono text-neutral-400 pt-1 tracking-wide">
              <span>Escritorio Windows · Descarga pública documentada: {CURRENT_PUBLIC_RELEASE}</span>
            </p>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="cue"
        aria-hidden="true"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span>scroll</span>
        <i />
      </motion.div>
    </section>
  );
};
