import React, { useEffect, useState } from 'react';
import { LibItem } from './types';
import {
  INITIAL_LIB,
  RELEASE_CANONICA,
} from './data/pulsariaData';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ManifestoSection } from './components/ManifestoSection';
import { Scene1142Section } from './components/Scene1142Section';
import { LibrarySection } from './components/LibrarySection';
import { PipelineSection } from './components/PipelineSection';
import { ClustersSection } from './components/ClustersSection';
import { SearchSection } from './components/SearchSection';
import { PrivacySection } from './components/PrivacySection';
import { DownloadSection } from './components/DownloadSection';
import { SpecsSection } from './components/SpecsSection';
import { Footer } from './components/Footer';
import { CommandPalette } from './components/CommandPalette';
import { WhatsNewModal, LegalDocsModal, FichaModal } from './components/Modals';
import { Toast } from './components/Toast';

export default function App() {
  const [libItems, setLibItems] = useState<LibItem[]>(INITIAL_LIB);
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isLegalDocsOpen, setIsLegalDocsOpen] = useState(false);
  const [selectedFichaItem, setSelectedFichaItem] = useState<LibItem | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => {
      setToastMsg((cur) => (cur === message ? null : cur));
    }, 2600);
  };

  const handleRetryItem = (id: string) => {
    setLibItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, err: undefined, pr: 8 } : item
      )
    );

    let current = 8;
    const interval = setInterval(() => {
      current += Math.random() * 20;
      if (current >= 100) {
        clearInterval(interval);
        setLibItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, pr: undefined } : item
          )
        );
        showToast('Importación completada');
      } else {
        setLibItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, pr: current } : item
          )
        );
      }
    }, 220);
  };

  const handleUpdateImage = (sceneKey: string, url: string) => {
    setCustomImages((prev) => ({ ...prev, [sceneKey]: url }));
    showToast('Miniatura fijada en toda la página');
  };

  const handleCopyRepoUrl = async () => {
    try {
      await navigator.clipboard.writeText(RELEASE_CANONICA);
      showToast('URL de release copiada');
    } catch {
      showToast(RELEASE_CANONICA);
    }
  };

  // Keyboard shortcut listener for Ctrl+K, Cmd+K, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        setIsWhatsNewOpen(false);
        setIsLegalDocsOpen(false);
        setSelectedFichaItem(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when any modal is open
  const isAnyModalOpen =
    isPaletteOpen ||
    isWhatsNewOpen ||
    isLegalDocsOpen ||
    selectedFichaItem !== null;

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isAnyModalOpen]);

  return (
    <>
      <a className="skip" href="#biblioteca">
        Saltar al contenido
      </a>

      <Navbar />

      <main id="top">
        {/* 1) Hero */}
        <HeroSection />

        {/* 2) Manifiesto */}
        <ManifestoSection />

        {/* 3) Escena 11:42 */}
        <Scene1142Section />

        {/* 4) Biblioteca 9:16 */}
        <LibrarySection
          items={libItems}
          onOpenFicha={(item) => setSelectedFichaItem(item)}
          onRetryItem={handleRetryItem}
          onUpdateImage={handleUpdateImage}
          customImages={customImages}
        />

        {/* 5) Pipeline */}
        <PipelineSection />

        {/* 6) Colecciones semánticas */}
        <ClustersSection />

        {/* 7) Búsqueda (Literal y Semántica) */}
        <SearchSection onOpenPalette={() => setIsPaletteOpen(true)} />

        {/* 8) Privacidad */}
        <PrivacySection />

        {/* 9) Descarga / Cierre */}
        <DownloadSection onOpenWhatsNew={() => setIsWhatsNewOpen(true)} />

        {/* 10) Especificaciones */}
        <SpecsSection />
      </main>

      <Footer
        onOpenLegalDocs={() => setIsLegalDocsOpen(true)}
        onCopyRepoUrl={handleCopyRepoUrl}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        items={libItems}
        onSelectItem={(item) => setSelectedFichaItem(item)}
        customImages={customImages}
      />

      {/* Modals */}
      <WhatsNewModal
        isOpen={isWhatsNewOpen}
        onClose={() => setIsWhatsNewOpen(false)}
      />

      <LegalDocsModal
        isOpen={isLegalDocsOpen}
        onClose={() => setIsLegalDocsOpen(false)}
      />

      <FichaModal
        item={selectedFichaItem}
        onClose={() => setSelectedFichaItem(null)}
        customImages={customImages}
      />

      {/* Notification Toast */}
      <Toast message={toastMsg} />
    </>
  );
}
