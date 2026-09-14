'use client';

import { useCallback, useEffect, useState } from 'react';
import { isTauriRuntime } from '@/hooks/use-processing-settings';

export const CURRENT_LEGAL_VERSIONS = {
  eulaVersion: '0.1',
  termsVersion: '0.1',
  privacyVersion: '0.1',
  contentPolicyVersion: '0.1',
} as const;

export interface LegalConsent {
  eulaVersion: string;
  termsVersion: string;
  privacyVersion: string;
  contentPolicyVersion: string;
  acceptedAt: string | null;
  locale: 'es-MX' | 'en-US';
}

function currentConsent(value: LegalConsent | null) {
  return Boolean(
    value?.acceptedAt
      && value.eulaVersion === CURRENT_LEGAL_VERSIONS.eulaVersion
      && value.termsVersion === CURRENT_LEGAL_VERSIONS.termsVersion
      && value.privacyVersion === CURRENT_LEGAL_VERSIONS.privacyVersion
      && value.contentPolicyVersion === CURRENT_LEGAL_VERSIONS.contentPolicyVersion,
  );
}

export function useLegalConsent() {
  const [consent, setConsent] = useState<LegalConsent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setConsent({
        ...CURRENT_LEGAL_VERSIONS,
        acceptedAt: new Date(0).toISOString(),
        locale: 'es-MX',
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const value = await invoke<LegalConsent>('get_legal_consent');
      setConsent(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(async (locale: 'es-MX' | 'en-US') => {
    if (!isTauriRuntime()) return true;
    setSaving(true);
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const value = await invoke<LegalConsent>('save_legal_consent', {
        input: { ...CURRENT_LEGAL_VERSIONS, locale },
      });
      setConsent(value);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    consent,
    loading,
    saving,
    error,
    accepted: currentConsent(consent),
    needsConsent: isTauriRuntime() && !loading && !currentConsent(consent),
    refresh,
    accept,
  };
}
