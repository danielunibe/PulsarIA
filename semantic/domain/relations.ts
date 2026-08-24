// ============================================================
// PulsarSemanticLayer — Relationship Taxonomy
// Relaciones soportadas entre entidades semánticas.
// ============================================================

export type Relation =
  // Identidad y pertenencia
  | 'uploaded_by'           // video ? creator
  | 'created_by'            // playlist ? creator
  | 'owned_by'              // asset ? creator
  | 'managed_by'            // collection ? creator
  
  // Contenido y estructura
  | 'tagged_with'           // video/media ? tag
  | 'part_of_playlist'      // video ? playlist
  | 'part_of_collection'    // video/playlist ? collection
  | 'contains_media'        // playlist/collection ? video
  | 'contains'              // genérico
  
  // Assets y referencias
  | 'references_asset'      // video/media ? asset
  | 'has_thumbnail'         // video ? thumbnail
  | 'derived_from'          // transcript ? audio/video
  | 'has_transcript'        // video ? transcript
  
  // Origen y temporalidad
  | 'downloaded_from'       // video/source ? source
  | 'published_at'          // video ? event/timestamp
  | 'created_at'            // entidad ? event/timestamp
  | 'related_to'            // cualquier ? cualquier (débil)
  | 'similar_to'            // video ? video (similitud semántica)
  
  // Metadatos técnicos
  | 'has_duration'          // video ? duración
  | 'has_resolution'        // video ? resolución
  | 'has_codec'             // video/audio ? codec
  | 'has_language'          // transcript ? idioma
  | 'has_tag'               // alias de tagged_with
  | 'has_source';           // alias de downloaded_from

export interface RelationTriple {
  subjectId: string;
  relation: Relation;
  objectId: string;
  weight: RelationWeight;
  metadata: Record<string, string>;
  source: RelationSource;
}

export interface RelationWeight {
  confidence: number;   // 0.0 - 1.0  (¿qué tan seguro estamos?)
  importance: number;   // 0.0 - 1.0  (¿qué tan importante es?)
  emotionalAffinity?: number; // -1.0 - 1.0 (no usado en dominio multimedia aún)
  activeAttitude?: number;    // -1.0 - 1.0 (no usado en dominio multimedia aún)
}

export type RelationSource = 'user' | 'system' | 'inferred' | 'imported';

// Validación de rangos
export function isValidWeight(w: RelationWeight): boolean {
  return (
    typeof w.confidence === 'number' &&
    typeof w.importance === 'number' &&
    w.confidence >= 0 && w.confidence <= 1 &&
    w.importance >= 0 && w.importance <= 1 &&
    (w.emotionalAffinity === undefined || (w.emotionalAffinity >= -1 && w.emotionalAffinity <= 1)) &&
    (w.activeAttitude === undefined || (w.activeAttitude >= -1 && w.activeAttitude <= 1))
  );
}

export interface SemanticWeight {
  confidence: number;
  importance: number;
  emotionalAffinity?: number;
  activeAttitude?: number;
}

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
