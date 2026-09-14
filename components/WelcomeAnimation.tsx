'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import styles from './WelcomeAnimation.module.css';

interface WelcomeAnimationProps {
  onFinish: () => void;
}

const PARTICLES = Array.from({ length: 18 }, (_, index) => index);

export function WelcomeAnimation({ onFinish }: WelcomeAnimationProps) {
  const reducedMotion = useReducedMotion();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlayRef.current?.focus({ preventScroll: true });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onFinish();
      }
    };
    window.addEventListener('keydown', handleEscape);
    if (reducedMotion) {
      const timer = window.setTimeout(onFinish, 700);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('keydown', handleEscape);
      };
    }
    const timer = window.setTimeout(onFinish, 6500);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onFinish, reducedMotion]);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a Pulsaria"
      onClick={onFinish}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          return;
        }
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onFinish();
        }
      }}
      tabIndex={0}
    >
      <div className={styles.aurora} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.particles} aria-hidden="true">
        {PARTICLES.map((particle) => (
          <span key={particle} style={{ '--particle-index': particle } as CSSProperties} />
        ))}
      </div>
      <motion.div
        className={styles.content}
        initial={reducedMotion ? false : { opacity: 0, scale: .84, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 1.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className={styles.eyebrow}><span />Pulsaria · Espacio local</p>
        <h1><span>Tu conocimiento.</span><strong>Tu ritmo.</strong></h1>
        <p className={styles.message}>Preparando una biblioteca que permanece contigo.</p>
        <p className={styles.skip}>Haz clic o pulsa Escape para continuar</p>
      </motion.div>
    </div>
  );
}
