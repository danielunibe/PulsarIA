// ============================================================
// PulsarSemanticLayer — UNIB Parser
// Parsea archivos .unib (formato UNIB Core v0.0 Draft) a AST.
// ============================================================

export interface UnibHeader {
  version: string;
  owner?: string;
  lang?: string;
  mode?: string;
  created?: string;
  [key: string]: string | undefined;
}

export interface UnibMemory {
  typeCode: string;      // P, F, E, O, T, R, V, M, A, I, C
  field: string;
  subjectId: string;
  subjectType: string;
  relation: string;
  objectId: string;
  objectType: string;
  confidence?: number;
  importance?: number;
  emotionalAffinity?: number;
  activeAttitude?: number;
  metadata: Record<string, string>;
  source: string;
  raw: string;
}

export interface UnibDocument {
  headers: UnibHeader;
  memories: UnibMemory[];
  errors: ParseError[];
}

export interface ParseError {
  line: number;
  raw: string;
  message: string;
}

const MEMORY_PATTERN = /^\[([A-Z])#([a-zA-Z0-9_]+)\]\s+@([^:]+):([a-zA-Z0-9_]+)\s+>\s+([a-zA-Z0-9_]+)\s+>\s+@([^:]+):([a-zA-Z0-9_]+)(?:\s+~e([-+]?\d*\.?\d+))?(?:\s+~a([-+]?\d*\.?\d+))?(?:\s+\?([\d]*\.?\d+))?(?:\s+!([\d]*\.?\d+))?(?:\s+\{([^}]*)\})?(?:\s+\^([a-zA-Z0-9_]+))?\.\s*$/;
const HEADER_PATTERN = /^@([a-zA-Z0-9_-]+)(?::([^\s]+))?$/;

export class UnibParser {
  parse(text: string): UnibDocument {
    const lines = text.split(/\r?\n/);
    const headers: UnibHeader = { version: '0.0' };
    const memories: UnibMemory[] = [];
    const errors: ParseError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('@')) {
        const match = line.match(HEADER_PATTERN);
        if (match) {
          const key = match[1];
          const value = match[2] || '';
          headers[key] = value;
        } else {
          errors.push({ line: i + 1, raw: line, message: 'Invalid header format' });
        }
        continue;
      }

      const memMatch = line.match(MEMORY_PATTERN);
      if (!memMatch) {
        errors.push({ line: i + 1, raw: line, message: 'Invalid memory syntax' });
        continue;
      }

      const [, typeCode, field, subId, subType, relation, objId, objType, eAff, aAtt, conf, imp, metaStr, source] = memMatch;

      const metadata: Record<string, string> = {};
      if (metaStr) {
        metaStr.split(';').forEach(pair => {
          const [k, v] = pair.split(':');
          if (k && v !== undefined) metadata[k.trim()] = v.trim();
        });
      }

      memories.push({
        typeCode,
        field,
        subjectId: subId,
        subjectType: subType,
        relation,
        objectId: objId,
        objectType: objType,
        confidence: conf !== undefined ? parseFloat(conf) : undefined,
        importance: imp !== undefined ? parseFloat(imp) : undefined,
        emotionalAffinity: eAff !== undefined ? parseFloat(eAff) : undefined,
        activeAttitude: aAtt !== undefined ? parseFloat(aAtt) : undefined,
        metadata,
        source: source || 'unknown',
        raw: line,
      });
    }

    return { headers, memories, errors };
  }
}
