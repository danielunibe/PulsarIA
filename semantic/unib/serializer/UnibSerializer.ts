// ============================================================
// PulsarSemanticLayer — UNIB Serializer
// Serializa SemanticDocument a texto .unib (formato UNIB Core v0.0 Draft).
// ============================================================

import { UnibDocument, UnibMemory } from '../parser/UnibParser';

export class UnibSerializer {
  serialize(doc: UnibDocument): string {
    const lines: string[] = [];

    // Headers
    lines.push(`@unib:${doc.headers.version || '0.0'}`);
    if (doc.headers.owner) lines.push(`@owner:${doc.headers.owner}`);
    if (doc.headers.lang) lines.push(`@lang:${doc.headers.lang}`);
    if (doc.headers.mode) lines.push(`@mode:${doc.headers.mode}`);
    if (doc.headers.created) lines.push(`@created:${doc.headers.created}`);
    lines.push('');

    // Memories
    for (const mem of doc.memories) {
      lines.push(this.serializeMemory(mem));
    }

    return lines.join('\n');
  }

  private serializeMemory(mem: UnibMemory): string {
    const parts: string[] = [`[${mem.typeCode}#${mem.field}]`];

    parts.push(`@${mem.subjectId}:${mem.subjectType}`);
    parts.push('>');
    parts.push(mem.relation);
    parts.push('>');
    parts.push(`@${mem.objectId}:${mem.objectType}`);

    if (mem.emotionalAffinity !== undefined && !isNaN(mem.emotionalAffinity)) {
      parts.push(`~e${mem.emotionalAffinity}`);
    }
    if (mem.activeAttitude !== undefined && !isNaN(mem.activeAttitude)) {
      parts.push(`~a${mem.activeAttitude}`);
    }
    if (mem.confidence !== undefined && !isNaN(mem.confidence)) {
      parts.push(`?${mem.confidence}`);
    }
    if (mem.importance !== undefined && !isNaN(mem.importance)) {
      parts.push(`!${mem.importance}`);
    }

    const metaEntries = Object.entries(mem.metadata);
    if (metaEntries.length > 0) {
      const metaStr = metaEntries.map(([k, v]) => `${k}:${v}`).join(';');
      parts.push(`{${metaStr}}`);
    }

    parts.push(`^${mem.source}`);
    parts.push('.');

    return parts.join(' ');
  }
}
