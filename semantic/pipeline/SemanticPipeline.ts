import {
  EntityType,
  SemanticEntity,
  makeStableId,
} from '../domain/entities';
import {
  Relation,
  RelationSource,
  RelationTriple,
} from '../domain/relations';
import { SemanticIndex } from '../index/SemanticIndex';
import { SemanticQueryEngine } from '../query/SemanticQueryEngine';
import {
  PulsarJobRecord,
  PulsarPlaylistRecord,
  UnibAdapter,
} from '../adapter/UnibAdapter';
import { SemanticStorage } from '../storage/SemanticStorage';
import { UnibDocument, UnibMemory } from '../unib/parser/UnibParser';
import { UnibValidator } from '../unib/validator/UnibValidator';

export interface SemanticGraph {
  entities: SemanticEntity[];
  triples: RelationTriple[];
}

export interface SemanticPipelineResult extends SemanticGraph {
  document: UnibDocument;
}

const ENTITY_TYPES = new Set<EntityType>([
  'asset', 'media', 'video', 'audio', 'image', 'source', 'creator', 'tag',
  'playlist', 'collection', 'thumbnail', 'transcript', 'project',
]);

const RELATIONS = new Set<Relation>([
  'uploaded_by', 'created_by', 'owned_by', 'managed_by', 'tagged_with',
  'part_of_playlist', 'part_of_collection', 'contains_media', 'contains',
  'references_asset', 'has_thumbnail', 'derived_from', 'has_transcript',
  'downloaded_from', 'published_at', 'created_at', 'related_to', 'similar_to',
  'has_duration', 'has_resolution', 'has_codec', 'has_language', 'has_tag',
  'has_source',
]);

const TYPE_ALIASES: Record<string, EntityType> = {
  a: 'asset',
  c: 'collection',
  e: 'creator',
  g: 'tag',
  i: 'image',
  l: 'playlist',
  m: 'media',
  n: 'project',
  o: 'audio',
  p: 'project',
  r: 'transcript',
  s: 'source',
  t: 'thumbnail',
  v: 'video',
};

const TYPE_CODES: Record<EntityType, string> = {
  asset: 'A',
  media: 'M',
  video: 'V',
  audio: 'O',
  image: 'I',
  source: 'S',
  creator: 'C',
  tag: 'G',
  playlist: 'P',
  collection: 'L',
  thumbnail: 'T',
  transcript: 'R',
  project: 'N',
};

export class SemanticPipeline {
  private readonly validator = new UnibValidator();
  private readonly index: SemanticIndex;
  private readonly queryEngine: SemanticQueryEngine;

  constructor(
    private readonly adapter = new UnibAdapter(),
    private readonly storage = new SemanticStorage(),
    index?: SemanticIndex,
  ) {
    this.index = index ?? new SemanticIndex();
    this.queryEngine = new SemanticQueryEngine(this.index);
  }

  processJob(job: PulsarJobRecord, platform?: string): SemanticPipelineResult {
    const graph = this.adapter.exportJobToSemantic(job, platform);
    return this.finalize(graph, 'media');
  }

  processPlaylist(
    playlist: PulsarPlaylistRecord,
    videoIds: string[],
  ): SemanticPipelineResult {
    const graph = this.adapter.exportPlaylistToSemantic(playlist, videoIds);
    return this.finalize(graph, 'playlist');
  }

  async persistJob(
    job: PulsarJobRecord,
    key = `jobs/${job.id}.unib`,
    platform?: string,
  ): Promise<SemanticPipelineResult> {
    const result = this.processJob(job, platform);
    await this.storage.save(key, result.document);
    return result;
  }

  async importText(key: string, text: string): Promise<SemanticPipelineResult> {
    const document = await this.storage.saveText(key, text);
    return this.importDocument(document);
  }

  async importStored(key: string): Promise<SemanticPipelineResult | null> {
    const document = await this.storage.load(key);
    return document ? this.importDocument(document) : null;
  }

  getIndex(): SemanticIndex {
    return this.index;
  }

  getQueryEngine(): SemanticQueryEngine {
    return this.queryEngine;
  }

  private importDocument(document: UnibDocument): SemanticPipelineResult {
    const validation = this.validator.validate(document);
    if (!validation.valid) {
      throw new Error(`Invalid UNIB document: ${validation.errors.join('; ')}`);
    }

    const graph = this.graphFromDocument(document);
    this.index.index(graph.entities, graph.triples);
    return { ...graph, document };
  }

  private finalize(graph: SemanticGraph, mode: string): SemanticPipelineResult {
    this.index.index(graph.entities, graph.triples);
    const document = this.documentFromGraph(graph, mode);
    return { ...graph, document };
  }

  private documentFromGraph(graph: SemanticGraph, mode: string): UnibDocument {
    const created = new Date().toISOString();
    const memories: UnibMemory[] = graph.triples.map((triple) => {
      const subject = this.splitEntityId(triple.subjectId);
      const object = this.splitEntityId(triple.objectId);
      const subjectType = this.normalizeEntityType(subject.type);
      const objectType = this.normalizeEntityType(object.type);
      return {
        typeCode: TYPE_CODES[subjectType],
        field: subjectType === 'video' ? 'media' : subjectType,
        subjectId: subject.id,
        subjectType,
        relation: triple.relation,
        objectId: object.id,
        objectType,
        confidence: triple.weight.confidence,
        importance: triple.weight.importance,
        emotionalAffinity: triple.weight.emotionalAffinity,
        activeAttitude: triple.weight.activeAttitude,
        metadata: { ...triple.metadata },
        source: triple.source,
        raw: '',
      };
    });

    const document: UnibDocument = {
      headers: {
        version: '0.0',
        owner: 'pulsar-eventide',
        mode,
        created,
      },
      memories,
      errors: [],
    };
    const validation = this.validator.validate(document);
    if (!validation.valid) {
      throw new Error(`Generated invalid UNIB document: ${validation.errors.join('; ')}`);
    }
    return document;
  }

  private graphFromDocument(document: UnibDocument): SemanticGraph {
    const entities = new Map<string, SemanticEntity>();
    const triples: RelationTriple[] = [];
    const createdAt = document.headers.created ?? new Date().toISOString();

    for (const memory of document.memories) {
      const subjectType = this.normalizeEntityType(memory.subjectType);
      const objectType = this.normalizeEntityType(memory.objectType);
      const subjectId = makeStableId(subjectType, memory.subjectId);
      const objectId = makeStableId(objectType, memory.objectId);
      entities.set(subjectId, this.placeholderEntity(subjectId, subjectType, memory.subjectId, createdAt));
      entities.set(objectId, this.placeholderEntity(objectId, objectType, memory.objectId, createdAt));

      if (!RELATIONS.has(memory.relation as Relation)) {
        throw new Error(`Unsupported UNIB relation: ${memory.relation}`);
      }
      triples.push({
        subjectId,
        relation: memory.relation as Relation,
        objectId,
        weight: {
          confidence: memory.confidence ?? 1,
          importance: memory.importance ?? 1,
          emotionalAffinity: memory.emotionalAffinity,
          activeAttitude: memory.activeAttitude,
        },
        metadata: { ...memory.metadata },
        source: this.normalizeSource(memory.source),
      });
    }

    return { entities: [...entities.values()], triples };
  }

  private placeholderEntity(
    id: string,
    type: EntityType,
    label: string,
    createdAt: string,
  ): SemanticEntity {
    return {
      id,
      type,
      label,
      metadata: {},
      createdAt,
      updatedAt: createdAt,
    };
  }

  private normalizeEntityType(type: string): EntityType {
    if (ENTITY_TYPES.has(type as EntityType)) return type as EntityType;
    const alias = TYPE_ALIASES[type.toLowerCase()];
    if (alias) return alias;
    throw new Error(`Unsupported UNIB entity type: ${type}`);
  }

  private normalizeSource(source: string): RelationSource {
    if (source === 'user' || source === 'system' || source === 'inferred' || source === 'imported') {
      return source;
    }
    return 'imported';
  }

  private splitEntityId(value: string): { type: string; id: string } {
    const separator = value.indexOf(':');
    if (separator <= 0) return { type: 'project', id: value };
    return { type: value.slice(0, separator), id: value.slice(separator + 1) };
  }
}
