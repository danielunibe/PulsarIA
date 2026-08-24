// ============================================================
// PulsarSemanticLayer — UNIB Validator
// Valida sintaxis, entidades, relaciones y metadata.
// ============================================================

import { UnibDocument, UnibMemory } from '../parser/UnibParser';
import { isValidWeight, Relation } from '../../domain/relations';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_ENTITY_TYPES = new Set(['h', 'a', 'p', 'o', 'g', 'l', 'c', 'e', 'm', 's', 'v', 'i', 't', 'r', 'n']);
const VALID_SOURCES = new Set(['user', 'chat', 'inferred', 'system', 'doc', 'imported']);
const VALID_STATUS = new Set(['confirmed', 'candidate', 'observed', 'conflict', 'temp', 'active', 'deprecated', 'blocked']);

export class UnibValidator {
  validate(doc: UnibDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!doc.headers.version) {
      warnings.push('Missing @unib version header, assuming 0.0');
    }

    for (const mem of doc.memories) {
      this.validateMemory(mem, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateMemory(mem: UnibMemory, errors: string[], warnings: string[]): void {
    if (!VALID_ENTITY_TYPES.has(mem.subjectType)) {
      errors.push(`Invalid subject entity type: ${mem.subjectType} in ${mem.raw}`);
    }
    if (!VALID_ENTITY_TYPES.has(mem.objectType)) {
      errors.push(`Invalid object entity type: ${mem.objectType} in ${mem.raw}`);
    }
    if (!VALID_SOURCES.has(mem.source)) {
      warnings.push(`Unknown source: ${mem.source} in ${mem.raw}`);
    }

    if (mem.confidence !== undefined && (mem.confidence < 0 || mem.confidence > 1)) {
      errors.push(`Confidence out of range [0,1]: ${mem.confidence} in ${mem.raw}`);
    }
    if (mem.importance !== undefined && (mem.importance < 0 || mem.importance > 1)) {
      errors.push(`Importance out of range [0,1]: ${mem.importance} in ${mem.raw}`);
    }

    if (mem.metadata.st && !VALID_STATUS.has(mem.metadata.st)) {
      warnings.push(`Unknown status: ${mem.metadata.st} in ${mem.raw}`);
    }
  }
}
