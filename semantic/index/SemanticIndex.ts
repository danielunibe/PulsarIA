// ============================================================
// PulsarSemanticLayer — Semantic Index
// Índice en memoria para consultas rápidas.
// ============================================================

import { SemanticEntity } from '../domain/entities';
import { RelationTriple } from '../domain/relations';

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

    const existing = new Set(
      this.triples.map(
        (triple) => `${triple.subjectId}\u0000${triple.relation}\u0000${triple.objectId}\u0000${triple.source}`,
      ),
    );
    for (const triple of triples) {
      const key = `${triple.subjectId}\u0000${triple.relation}\u0000${triple.objectId}\u0000${triple.source}`;
      if (!existing.has(key)) {
        this.triples.push(triple);
        existing.add(key);
      }
    }

    this.rebuildLookupMaps();
  }

  getEntity(id: string): SemanticEntity | undefined {
    return this.entities.get(id);
  }

  getTriplesByRelation(relation: string): RelationTriple[] {
    return [...(this.byRelation.get(relation) ?? [])];
  }

  getTriplesBySubject(subjectId: string): RelationTriple[] {
    return [...(this.bySubject.get(subjectId) ?? [])];
  }

  getTriplesByObject(objectId: string): RelationTriple[] {
    return [...(this.byObject.get(objectId) ?? [])];
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

  private rebuildLookupMaps(): void {
    this.byRelation.clear();
    this.bySubject.clear();
    this.byObject.clear();

    for (const triple of this.triples) {
      this.addToMap(this.byRelation, triple.relation, triple);
      this.addToMap(this.bySubject, triple.subjectId, triple);
      this.addToMap(this.byObject, triple.objectId, triple);
    }
  }

  private addToMap(
    map: Map<string, RelationTriple[]>,
    key: string,
    triple: RelationTriple,
  ): void {
    const values = map.get(key);
    if (values) {
      values.push(triple);
    } else {
      map.set(key, [triple]);
    }
  }
}
