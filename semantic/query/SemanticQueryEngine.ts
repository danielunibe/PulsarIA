// ============================================================
// PulsarSemanticLayer — Semantic Query Engine (Frontend)
// Motor de consultas sobre el índice de triples UNIB.
// ============================================================

import { SemanticIndex } from '../index/SemanticIndex';
import { SemanticEntity, RelationTriple } from '../domain/entities';

export interface QueryResult {
  entities: SemanticEntity[];
  triples: RelationTriple[];
}

export class SemanticQueryEngine {
  private index: SemanticIndex;

  constructor(index: SemanticIndex) {
    this.index = index;
  }

  findVideosByTag(tag: string): QueryResult {
    const normalized = tag.toLowerCase().replace(/[^a-z0-9-_]+/g, '_');
    const tagId = `tag:${normalized}`;
    const triples = this.index.getTriplesByObject(tagId).filter(t => t.relation === 'tagged_with');
    const entities = triples.map(t => this.index.getEntity(t.subjectId)).filter(Boolean) as SemanticEntity[];
    return { entities, triples };
  }

  findVideosByPlaylist(playlistId: string): QueryResult {
    const triples = this.index.getTriplesByRelation('part_of_playlist').filter(t => t.objectId === playlistId);
    const entities = triples.map(t => this.index.getEntity(t.subjectId)).filter(Boolean) as SemanticEntity[];
    return { entities, triples };
  }

  findVideosByCreator(creatorId: string): QueryResult {
    const triples = this.index.getTriplesByRelation('uploaded_by').filter(t => t.objectId === creatorId);
    const entities = triples.map(t => this.index.getEntity(t.subjectId)).filter(Boolean) as SemanticEntity[];
    return { entities, triples };
  }

  findAssetsForVideo(videoId: string): QueryResult {
    const triples = this.index.getTriplesByRelation('references_asset').filter(t => t.subjectId === videoId);
    const entities = triples.map(t => this.index.getEntity(t.objectId)).filter(Boolean) as SemanticEntity[];
    return { entities, triples };
  }

  findRelatedVideos(videoId: string): QueryResult {
    const triples = this.index.getTriplesBySubject(videoId).filter(t => t.relation === 'related_to' || t.relation === 'similar_to');
    const entities = triples.map(t => this.index.getEntity(t.objectId)).filter(Boolean) as SemanticEntity[];
    return { entities, triples };
  }

  queryByRelation(relation: string): QueryResult {
    const triples = this.index.getTriplesByRelation(relation);
    const subjectIds = new Set(triples.map(t => t.subjectId));
    const entities = Array.from(subjectIds).map(id => this.index.getEntity(id)).filter(Boolean) as SemanticEntity[];
    return { entities, triples };
  }

  queryByEntityId(entityId: string): QueryResult {
    const entity = this.index.getEntity(entityId);
    if (!entity) return { entities: [], triples: [] };
    const triples = this.index.getTriplesBySubject(entityId);
    return { entities: [entity], triples };
  }

  searchByMetadata(key: string, value: string): QueryResult {
    const entities = Array.from(this.index['entities'].values()).filter(e => {
      const meta = e.metadata[key];
      return meta !== undefined && String(meta) === value;
    });
    const triples = entities.flatMap(e => this.index.getTriplesBySubject(e.id));
    return { entities, triples };
  }
}
