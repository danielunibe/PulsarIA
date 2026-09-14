'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  title: string;
  description: string;
  retryLabel: string;
  reloadLabel: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pulsaria UI boundary caught an error', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  private reload = () => {
    window.location.reload();
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section role="alert" className="flex min-h-[180px] items-center justify-center rounded-[20px] border border-amber-300/20 bg-black/30 p-6 text-center text-white/80">
        <div className="max-w-md">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-amber-200">{this.props.title}</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/60">{this.props.description}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={this.retry} className="rounded-xl border border-[#25f4ee]/40 bg-[#25f4ee]/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#25f4ee]">
              {this.props.retryLabel}
            </button>
            <button type="button" onClick={this.reload} className="rounded-xl border border-white/15 bg-white/[.06] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/70">
              {this.props.reloadLabel}
            </button>
          </div>
        </div>
      </section>
    );
  }
}

export function LocalizedErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <ErrorBoundary
      title={t('uiErrorTitle')}
      description={t('uiErrorDescription')}
      retryLabel={t('retry')}
      reloadLabel={t('reloadApp')}
    >
      {children}
    </ErrorBoundary>
  );
}
