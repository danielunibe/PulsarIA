import type { VideoData } from '@/types';

// ============================================================
// Mock Data — Videos Activos del Dashboard
// Mover aquí para separar datos de presentación en page.tsx
// ============================================================

export const MOCK_ACTIVE_VIDEOS: VideoData[] = [];

// Número de slots inactivos vacíos a mostrar en el Dashboard
// M04 (UX Audit): Ajustado a 12 para completar 3 hileras de 5 tarjetas (Total 15)
export const INACTIVE_SLOTS_COUNT = 12;
