'use client';

import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { FaPhotoFilm, FaXmark } from '@/components/icon-library';
import { useI18n } from '@/lib/i18n';
import type { VideoData } from '@/types';

interface DemoVideoDetailModalProps {
    video: VideoData;
    onClose: () => void;
    returnFocusRef: RefObject<HTMLElement | null>;
}

export function DemoVideoDetailModal({ video, onClose, returnFocusRef }: DemoVideoDetailModalProps) {
    const [mounted, setMounted] = useState(false);
    const { locale } = useI18n();
    const isSpanish = locale === 'es-MX';

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => () => {
        const trigger = returnFocusRef.current;
        if (trigger?.isConnected) trigger.focus();
    }, [returnFocusRef]);

    if (!mounted) return null;

    const title = video.title || (isSpanish ? 'Vista de demostración' : 'Demo preview');
    const dialogTitle = isSpanish ? 'Ficha de muestra' : 'Preview details';

    return createPortal(
        <div
            className="demo-video-detail-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <FocusTrap focusTrapOptions={{ initialFocus: false, escapeDeactivates: false }}>
                <motion.section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="demo-video-detail-title"
                    className="demo-video-detail"
                    initial={{ opacity: 0, scale: 0.97, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 8 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                    <header className="demo-video-detail__header">
                        <div>
                            <span className="demo-video-detail__eyebrow">
                                <FaPhotoFilm size={14} />
                                {isSpanish ? 'MUESTRA · IMAGEN ESTÁTICA' : 'PREVIEW · STATIC IMAGE'}
                            </span>
                            <h2 id="demo-video-detail-title">{dialogTitle}</h2>
                        </div>
                        <button type="button" className="demo-video-detail__close" onClick={onClose} aria-label={isSpanish ? 'Cerrar ficha' : 'Close details'}>
                            <FaXmark size={18} />
                        </button>
                    </header>

                    <div className="demo-video-detail__body">
                        <div className="demo-video-detail__media">
                            {video.thumb ? <Image src={video.thumb} alt={title} width={1200} height={1600} sizes="(max-width: 720px) 90vw, 50vw" /> : <FaPhotoFilm size={36} aria-hidden="true" />}
                        </div>
                        <div className="demo-video-detail__info">
                            <span className="demo-video-detail__kind">{video.demoLabel || (isSpanish ? 'Contenido de muestra' : 'Preview item')}</span>
                            <h3>{title}</h3>
                            <p className="demo-video-detail__description">
                                {isSpanish
                                    ? 'Esta tarjeta contiene una imagen temporal de demostración, no un video reproducible. Este clic abre solo su ficha: no inicia Cinema ni crea un trabajo.'
                                    : 'This card contains a temporary demo image, not a playable video. This click opens only its details; it does not start Cinema or create a job.'}
                            </p>

                            <dl className="demo-video-detail__facts">
                                <div><dt>{isSpanish ? 'Tipo' : 'Type'}</dt><dd>{isSpanish ? 'Imagen temporal' : 'Temporary image'}</dd></div>
                                <div><dt>{isSpanish ? 'Duración' : 'Duration'}</dt><dd>{isSpanish ? 'No aplica · imagen fija' : 'Not applicable · still image'}</dd></div>
                                <div><dt>{isSpanish ? 'Origen' : 'Source'}</dt><dd>{isSpanish ? 'Muestra local' : 'Local preview'}</dd></div>
                            </dl>

                            <p className="demo-video-detail__note">
                                {isSpanish
                                    ? 'La muestra no incluye URL original, autor confirmado, duración, transcripción ni análisis. Esos datos aparecerán en la ficha cuando abras un video real de tu biblioteca.'
                                    : 'This preview has no source URL, verified author, duration, transcript, or analysis. Those details are available in the profile for a real library video.'}
                            </p>
                        </div>
                    </div>

                    <footer className="demo-video-detail__footer">
                        <span>{isSpanish ? 'Elemento de demostración · fuera de la biblioteca persistente' : 'Demo item · not part of the persistent library'}</span>
                        <button type="button" onClick={onClose}>{isSpanish ? 'Cerrar ficha' : 'Close details'}</button>
                    </footer>
                </motion.section>
            </FocusTrap>
        </div>,
        document.body,
    );
}
