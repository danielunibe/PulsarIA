// ============================================================
// PulsarSemanticLayer — Semantic Weights
// Sistema de pesos compatible con UNIB Core v0.0.
// ============================================================

export interface SemanticWeight {
  confidence: number;      // 0.0 - 1.0
  importance: number;      // 0.0 - 1.0
  emotionalAffinity?: number; // -1.0 - 1.0
  activeAttitude?: number;    // -1.0 - 1.0
}

export const DEFAULT_WEIGHT: SemanticWeight = {
  confidence: 0.9,
  importance: 0.7,
  emotionalAffinity: 0,
  activeAttitude: 0,
};

export function clampWeight(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeWeight(w: Partial<SemanticWeight>): SemanticWeight {
  return {
    confidence: clampWeight(w.confidence ?? DEFAULT_WEIGHT.confidence, 0, 1),
    importance: clampWeight(w.importance ?? DEFAULT_WEIGHT.importance, 0, 1),
    emotionalAffinity: w.emotionalAffinity !== undefined ? clampWeight(w.emotionalAffinity, -1, 1) : DEFAULT_WEIGHT.emotionalAffinity,
    activeAttitude: w.activeAttitude !== undefined ? clampWeight(w.activeAttitude, -1, 1) : DEFAULT_WEIGHT.activeAttitude,
  };
}

// Pesos contextuales por tipo de relación
export const RELATION_WEIGHT_PRESETS: Record<string, Partial<SemanticWeight>> = {
  uploaded_by: { confidence: 1.0, importance: 0.9 },
  downloaded_from: { confidence: 1.0, importance: 0.8 },
  tagged_with: { confidence: 0.85, importance: 0.6 },
  part_of_playlist: { confidence: 1.0, importance: 0.8 },
  references_asset: { confidence: 1.0, importance: 0.9 },
  has_thumbnail: { confidence: 1.0, importance: 0.5 },
  has_transcript: { confidence: 1.0, importance: 0.7 },
  related_to: { confidence: 0.5, importance: 0.3 },
  similar_to: { confidence: 0.7, importance: 0.4 },
};
