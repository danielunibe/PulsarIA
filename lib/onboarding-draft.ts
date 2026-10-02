export const ONBOARDING_DRAFT_KEY = 'pulsaria-mvp-setup';

export type OnboardingStep = 'runtime' | 'welcome' | 'hardware' | 'language' | 'intent' | 'storage' | 'model' | 'success';

export interface OnboardingAnswersDraft {
  offlinePlayback?: 'yes' | 'not-needed';
  priority?: 'knowledge' | 'videos';
  volume?: 'occasional' | 'regular' | 'high';
  intent?: 'knowledge' | 'balanced' | 'archive';
  mediaRoot?: string;
  quotaGiB?: number;
  [key: string]: unknown;
}

export interface OnboardingDraft {
  schemaVersion: 1;
  answers: OnboardingAnswersDraft;
  step: OnboardingStep;
  intentQuestion: 0 | 1 | 2 | 3;
  postponed: boolean;
  preferencesSaved: boolean;
}

const STEPS = new Set<OnboardingStep>([
  'runtime', 'welcome', 'hardware', 'language', 'intent', 'storage', 'model', 'success',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readOnboardingDraft(): OnboardingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawValue = window.localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!rawValue) return null;
    const raw: unknown = JSON.parse(rawValue);
    if (!isRecord(raw)) return null;

    if (raw.schemaVersion === 1 && isRecord(raw.answers)) {
      const step = STEPS.has(raw.step as OnboardingStep) ? raw.step as OnboardingStep : 'welcome';
      const question = typeof raw.intentQuestion === 'number' && Number.isInteger(raw.intentQuestion)
        ? Math.min(3, Math.max(0, raw.intentQuestion)) as 0 | 1 | 2 | 3
        : 0;
      return {
        schemaVersion: 1,
        answers: raw.answers,
        step,
        intentQuestion: question,
        postponed: raw.postponed === true,
        preferencesSaved: raw.preferencesSaved === true,
      };
    }

    // Previous releases stored completed preferences as a flat answer object.
    // Read that format as completed preferences, never as runtime readiness.
    if ('offlinePlayback' in raw || 'priority' in raw || 'mediaRoot' in raw || 'intent' in raw) {
      return {
        schemaVersion: 1,
        answers: raw,
        step: 'welcome',
        intentQuestion: 0,
        postponed: false,
        preferencesSaved: true,
      };
    }
  } catch {
    // A corrupt or unavailable browser preference must not block the app.
  }
  return null;
}

export function writeOnboardingDraft(draft: OnboardingDraft): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
