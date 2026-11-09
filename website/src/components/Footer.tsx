import React from 'react';
import { ISSUES_URL, PROJECT_URL, RELEASES_URL } from '../data/pulsariaData';

interface FooterProps {
  onOpenLegalDocs: () => void;
  onCopyRepoUrl: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegalDocs, onCopyRepoUrl }) => (
  <footer data-nav="dark">
    <div className="wrap">
      <div className="legal">
        <h3>Uso responsable</h3>
        <p>
          Procesa únicamente contenido sobre el que tengas derechos, autorización o base legal suficiente.
          El usuario debe respetar la privacidad, los derechos de terceros y las condiciones de las plataformas de origen.
          Pulsaria no garantiza que una fuente pueda importarse.
        </p>
        <p>
          Pulsaria es independiente y no está afiliada ni respaldada por TikTok o ByteDance. No está diseñada para eludir
          controles de acceso o restricciones de una plataforma. <a href="terms.html">Lee los términos</a> y la{' '}
          <a href="privacy.html">política de privacidad</a>.
        </p>
        <button type="button" className="linkish" id="docsOpen" onClick={onOpenLegalDocs}>Ver documentos del proyecto</button>
      </div>
      <div className="f-row">
        <span>© 2026 · Pulsaria</span>
        <span style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">Releases</a>
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Soporte</a>
          <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <button type="button" id="copyLink" onClick={onCopyRepoUrl}>Copiar URL del proyecto</button>
        </span>
      </div>
    </div>
  </footer>
);
