import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LibItem } from '../types';
import { GithubIcon } from './SvgIcons';
import { CURRENT_CANDIDATE, CURRENT_PUBLIC_RELEASE, PROJECT_URL, RELEASE_CANONICA } from '../data/pulsariaData';
import { getProceduralImage } from '../utils/proceduralCanvas';

export const WhatsNewModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal on" id="modal" role="dialog" aria-modal="true">
          <motion.div
            className="modal-bg"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="modal-x"
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
            <h3>Estado de las versiones</h3>
            <p>Descarga pública documentada: {CURRENT_PUBLIC_RELEASE}. Candidata en preparación: {CURRENT_CANDIDATE}.</p>
            <ul>
              <li>Eval.3 es una prerelease sin firma Authenticode ni updater público.</li>
              <li>Beta 4 sigue en preparación; no se anuncia como descarga publicada.</li>
              <li>Consulta el estado técnico del proyecto antes de usar una versión candidata.</li>
            </ul>
            <a
              className="btn sm gh-dl"
              href={RELEASE_CANONICA}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubIcon className="w-3.5 h-3.5" />
              <span>Ver Eval.3</span>
            </a>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const LegalDocsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="modal on"
          id="docsModal"
          role="dialog"
          aria-modal="true"
          aria-label="Documentos legales"
        >
          <motion.div
            className="modal-bg"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="modal-x"
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
            <h3>Documentación oficial</h3>
            <p>Consulta los documentos completos del repositorio. Esta página no sustituye a los textos legales del producto.</p>
            <p><a href={`${PROJECT_URL}/blob/main/EULA.es.md`} target="_blank" rel="noopener noreferrer">EULA</a></p>
            <p><a href={`${PROJECT_URL}/blob/main/TERMS_OF_USE.es.md`} target="_blank" rel="noopener noreferrer">Términos de uso</a></p>
            <p><a href={`${PROJECT_URL}/blob/main/PRIVACY.es.md`} target="_blank" rel="noopener noreferrer">Política de privacidad</a></p>
            <p><a href={`${PROJECT_URL}/blob/main/CONTENT_POLICY.es.md`} target="_blank" rel="noopener noreferrer">Política de contenido</a></p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const FichaModal: React.FC<{
  item: LibItem | null;
  onClose: () => void;
  customImages: Record<string, string>;
}> = ({ item, onClose, customImages }) => {
  return (
    <AnimatePresence>
      {item && (
        <div
          className="modal on"
          id="fichaModal"
          role="dialog"
          aria-modal="true"
          aria-label="Ficha del elemento"
        >
          <motion.div
            className="modal-bg"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="modal-box"
            id="fichaBox"
            initial={{ opacity: 0, scale: 0.93, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="modal-x"
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
            <div className="ficha-top">
              <u>
                <img
                  src={customImages[item.sc] || getProceduralImage(item.sc)}
                  alt=""
                />
              </u>
              <div>
                <span className="hd">
                  {item.h} · {item.d} · {item.when}
                </span>
                <h3>
                  {item.c}{' '}
                  <span style={{ color: 'var(--tt-soft)' }}>{item.tg}</span>
                </h3>
                <p
                  style={{
                    marginTop: '8px',
                    fontSize: '12.5px',
                    color: 'var(--gray)',
                  }}
                >
                  Colección: {item.list} · Medio: MP4{' '}
                  {item.size !== '—' ? item.size : ''}
                </p>
              </div>
            </div>
            <div className="ficha-trx">
              <b>transcripción · local</b>
              {item.tx}
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--gray)' }}>
              Formatos disponibles: MP4 · MP3 · TXT · SRT. Embeddings MiniLM
              indexados en HNSW.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
