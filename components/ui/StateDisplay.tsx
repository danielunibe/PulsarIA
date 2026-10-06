'use client';

import { useI18n } from '@/lib/i18n';
import { motion } from 'motion/react';

interface StateDisplayProps {
  variant: 'loading' | 'empty' | 'error';
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

const defaultTitles = {
  loading: { 'es-MX': 'Cargando...', 'en-US': 'Loading...' },
  empty: { 'es-MX': 'Sin contenido', 'en-US': 'No content' },
  error: { 'es-MX': 'Error', 'en-US': 'Error' },
};

const defaultDescriptions = {
  loading: { 'es-MX': 'Espera un momento mientras preparamos todo.', 'en-US': 'Please wait while we prepare everything.' },
  empty: { 'es-MX': 'No hay elementos para mostrar.', 'en-US': 'There are no items to display.' },
  error: { 'es-MX': 'Ocurrió un problema inesperado.', 'en-US': 'An unexpected problem occurred.' },
};

const defaultIcons = {
  loading: (
    <svg
      className='w-8 h-8 text-[#25f4ee]/45 animate-spin'
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      viewBox='0 0 24 24'
      strokeWidth={2}
      stroke='currentColor'
      aria-hidden='true'
    >
      <circle cx='12' cy='12' r='10' strokeOpacity='0.15' />
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M12 2a10 10 0 0 1 10 10'
        strokeOpacity='1'
      />
    </svg>
  ),
  empty: (
    <svg
      className='w-8 h-8 text-[#25f4ee]/45'
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      viewBox='0 0 24 24'
      strokeWidth={1.5}
      stroke='currentColor'
      aria-hidden='true'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
      />
    </svg>
  ),
  error: (
    <svg
      className='w-8 h-8 text-[#fe2c55]/70'
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      viewBox='0 0 24 24'
      strokeWidth={1.5}
      stroke='currentColor'
      aria-hidden='true'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'
      />
    </svg>
  ),
};

export function StateDisplay({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className = '',
}: StateDisplayProps) {
  const { locale } = useI18n();

  const resolvedTitle = title || defaultTitles[variant][locale as keyof typeof defaultTitles.loading] || defaultTitles[variant]['es-MX'];
  const resolvedDescription = description || defaultDescriptions[variant][locale as keyof typeof defaultDescriptions.loading] || defaultDescriptions[variant]['es-MX'];
  const resolvedIcon = icon || defaultIcons[variant];

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '40px 24px',
    borderRadius: '20px',
    background: 'rgba(10, 13, 19, 0.7)',
    backdropFilter: 'blur(18px) saturate(145%)',
    WebkitBackdropFilter: 'blur(18px) saturate(145%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.04)',
    textAlign: 'center',
    maxWidth: '420px',
    width: '100%',
  };

  return (
    <motion.section
      className={className}
      style={containerStyle}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className='flex items-center justify-center'
        style={{ width: '48px', height: '48px' }}
        aria-hidden='true'
      >
        {resolvedIcon}
      </div>

      <div className='flex flex-col gap-1'>
        <h2
          className='text-xs font-bold uppercase tracking-[0.12em] text-white/90'
          style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
          }}
        >
          {resolvedTitle}
        </h2>
        <p
          className='text-xs font-medium leading-relaxed text-white/40 max-w-[340px]'
          style={{
            fontSize: '11px',
            lineHeight: '1.5',
          }}
        >
          {resolvedDescription}
        </p>
      </div>

      {actionLabel && onAction && (
        <button
          type='button'
          onClick={onAction}
          className='mt-2 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-all duration-200'
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: 'rgba(255, 255, 255, 0.9)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 12px rgba(37, 244, 238, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
          }}
        >
          {actionLabel}
        </button>
      )}
    </motion.section>
  );
}
