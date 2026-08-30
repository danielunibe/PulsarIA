import { UnibDocument, UnibParser } from '../unib/parser/UnibParser';
import { UnibSerializer } from '../unib/serializer/UnibSerializer';

export interface SemanticStorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, content: string): Promise<void>;
  remove?(key: string): Promise<void>;
  keys?(): Promise<string[]>;
}

/**
 * Persistencia de documentos UNIB independiente del entorno de ejecución.
 * En Tauri puede conectarse a fs/plugin-store mediante el adaptador; en tests
 * y uso de navegador conserva una copia en memoria sin romper el bundle.
 */
export class SemanticStorage {
  private readonly memory = new Map<string, string>();
  private readonly parser = new UnibParser();
  private readonly serializer = new UnibSerializer();

  constructor(private readonly adapter?: SemanticStorageAdapter) {}

  async save(key: string, document: UnibDocument): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    const content = this.serializer.serialize(document);
    this.memory.set(normalizedKey, content);
    if (this.adapter) await this.adapter.write(normalizedKey, content);
  }

  async saveText(key: string, content: string): Promise<UnibDocument> {
    const document = this.parser.parse(content);
    await this.save(key, document);
    return document;
  }

  async load(key: string): Promise<UnibDocument | null> {
    const normalizedKey = this.normalizeKey(key);
    let content = this.memory.get(normalizedKey) ?? null;
    if (this.adapter) {
      content = await this.adapter.read(normalizedKey);
      if (content !== null) this.memory.set(normalizedKey, content);
    }
    return content === null ? null : this.parser.parse(content);
  }

  async loadText(key: string): Promise<string | null> {
    const normalizedKey = this.normalizeKey(key);
    if (this.adapter) {
      const content = await this.adapter.read(normalizedKey);
      if (content !== null) this.memory.set(normalizedKey, content);
      return content;
    }
    return this.memory.get(normalizedKey) ?? null;
  }

  async remove(key: string): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    this.memory.delete(normalizedKey);
    if (this.adapter?.remove) await this.adapter.remove(normalizedKey);
  }

  async keys(): Promise<string[]> {
    if (this.adapter?.keys) return this.adapter.keys();
    return [...this.memory.keys()].sort();
  }

  clearMemory(): void {
    this.memory.clear();
  }

  private normalizeKey(key: string): string {
    const normalized = key.trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
    if (!normalized) throw new Error('Semantic storage key cannot be empty');
    return normalized;
  }
}
