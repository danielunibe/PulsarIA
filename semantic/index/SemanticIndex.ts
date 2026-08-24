// ============================================================
// PulsarSemanticLayer — Semantic Index
// Índice en memoria para consultas rápidas.
// ============================================================

import { RelationTriple } from '../domain/relations';
import { SemanticEntity } from '../domain/entities';

export class SemanticIndex {
  private entities: Map<string, SemanticEntity> = new Map();
  private triples: RelationTriple[] = [];
  private byRelation: Map<string, RelationTriple[]> = new Map();
  private bySubject: Map<string, RelationTriple[]> = new Map();
  private byObject: Map<string, RelationTriple[]> = new Map();

  index(entities: SemanticEntity[], triples: RelationTriple[]): void {
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
    }

    for (const triple of triples) {
      this.triples.push(triple);

      const relKey = triple.relation;
      if (!this.byRelation.has(relKey)) this.byRelation.set(relKey, []);
      this.byRelation.get(relKey)!.push(triple);

      if (!this.bySubject.has(triple.subjectId)) this.bySubject.set(triple.subjectId, []);
      this.bySubject.get(triple.subjectId)!.push(triple);

      if (!this.byObject.has(triple.objectId)) this.byObject.set(triple.objectId, []);
      this.byObject.get(triple.objectId)!.push(triple);
    }
  }

  getEntity(id: string): SemanticEntity | undefined {
    return this.entities.get(id);
  }

  getTriplesByRelation(relation: string): RelationTriple[] {
    return this.byRelation.get(relation) || [];
  }

  getTriplesBySubject(subjectId: string): RelationTriple[] {
    return this.bySubject.get(subjectId) || [];
  }

  getTriplesByObject(objectId: string): RelationTriple[] {
    return this.byObject.get(objectId) || [];
  }

  clear(): void {
    this.entities.clear();
    this.triples = [];
    this.byRelation.clear();
    this.bySubject.clear();
    this.byObject.clear();
  }

  size(): { entities: number; triples: number } {
    return {
      entities: this.entities.size,
      triples: this.triples.length,
    };
  }
}
