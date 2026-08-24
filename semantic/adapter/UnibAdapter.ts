// ============================================================
// PulsarSemanticLayer — UNIB Adapter
// Traduce entidades de Pulsar a entidades semánticas UNIB.
// ============================================================

import {
  SemanticEntity,
  AssetEntity,
  MediaEntity,
  VideoEntity,
  AudioEntity,
  ImageEntity,
  SourceEntity,
  CreatorEntity,
  TagEntity,
  PlaylistEntity,
  CollectionEntity,
  ThumbnailEntity,
  TranscriptEntity,
  ProjectEntity,
  RelationTriple,
  RelationWeight,
  RelationSource,
  makeStableId,
  simpleChecksum,
} from '../domain/entities';
import { Relation, isValidWeight, RELATION_WEIGHT_PRESETS } from '../domain/relations';
import { SemanticWeight, normalizeWeight } from '../domain/weights';

// Entradas de dominio Pulsar (tipos simplificados para el adapter)
export interface PulsarVideo {
  id: number;
  title: string;
  author: string;
  duration: string;
  tags: string[];
  thumb: string;
  videoSrc: string;
  url: string;
  platform?: string;
}

export interface PulsarJobRecord {
  id: number;
  url: string;
  status: string;
  progress: number;
  created_at: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  video_path?: string;
  audio_path?: string;
  transcript_path?: string;
  keep_status?: string;
}

export interface PulsarPlaylistRecord {
  id: number;
  name: string;
  description?: string;
  color: string;
  auto_generated: boolean;
  topic_keywords: string; // JSON string
}

export interface PulsarSource {
  url: string;
  provider: string;
  platform: string;
  externalId?: string;
}

// ============================================================
// UNIB Adapter
// ============================================================

export class UnibAdapter {
  private projectId: string;

  constructor(projectId: string = 'pulsar-eventide') {
    this.projectId = projectId;
  }

  // --- Helpers ---

  private now(): string {
    return new Date().toISOString();
  }

  private weightFor(relation: Relation, overrides?: Partial<SemanticWeight>): RelationWeight {
    const preset = RELATION_WEIGHT_PRESETS[relation] || {};
    const normalized = normalizeWeight({ ...preset, ...overrides });
    return {
      confidence: normalized.confidence!,
      importance: normalized.importance!,
      emotionalAffinity: normalized.emotionalAffinity,
      activeAttitude: normalized.activeAttitude,
    };
  }

  private triple(
    subjectId: string,
    relation: Relation,
    objectId: string,
    source: RelationSource = 'system',
    weightOverrides?: Partial<SemanticWeight>
  ): RelationTriple {
    return {
      subjectId,
      relation,
      objectId,
      weight: this.weightFor(relation, weightOverrides),
      metadata: {},
      source,
    };
  }

  // --- Entity Builders ---

  videoEntity(job: PulsarJobRecord, platform?: string): VideoEntity {
    const id = makeStableId('video', String(job.id));
    return {
      id,
      type: 'video',
      label: job.title || `Video #${job.id}`,
      metadata: {
        assetId: makeStableId('asset', String(job.id)),
        mediaType: 'video',
        duration: job.duration ? `${job.duration}s` : undefined,
        platform: platform || 'generic',
        externalId: String(job.id),
      },
      createdAt: job.created_at,
      updatedAt: this.now(),
    };
  }

  assetEntity(job: PulsarJobRecord): AssetEntity {
    const id = makeStableId('asset', String(job.id));
    const path = job.video_path || `data/processing/${job.id}/video.mp4`;
    const checksum = simpleChecksum(path + job.url);
    return {
      id,
      type: 'asset',
      label: `Asset #${job.id}`,
      metadata: {
        path,
        mimeType: 'video/mp4',
        size: '0', // Se actualiza externamente si está disponible
        checksum,
        storageProvider: 'local',
      },
      createdAt: job.created_at,
      updatedAt: this.now(),
    };
  }

  sourceEntity(url: string, platform: string = 'generic'): SourceEntity {
    const id = makeStableId('source', simpleChecksum(url));
    return {
      id,
      type: 'source',
      label: url,
      metadata: {
        url,
        provider: platform,
        platform,
        externalId: id,
      },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }

  creatorEntity(author: string, platform?: string): CreatorEntity {
    const id = makeStableId('creator', simpleChecksum(author));
    return {
      id,
      type: 'creator',
      label: author,
      metadata: {
        name: author,
        platform,
        externalId: id,
      },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }

  tagEntity(tag: string): TagEntity {
    const normalized = tag.toLowerCase().replace(/[^a-z0-9-_]+/g, '_');
    const id = makeStableId('tag', normalized);
    return {
      id,
      type: 'tag',
      label: tag,
      metadata: {
        normalized,
        category: 'custom',
      },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }

  playlistEntity(playlist: PulsarPlaylistRecord): PlaylistEntity {
    const id = makeStableId('playlist', String(playlist.id));
    return {
      id,
      type: 'playlist',
      label: playlist.name,
      metadata: {
        pulsarPlaylistId: String(playlist.id),
        color: playlist.color,
        autoGenerated: String(playlist.auto_generated),
        topicKeywords: playlist.topic_keywords,
      },
      createdAt: new Date().toISOString(),
      updatedAt: this.now(),
    };
  }

  thumbnailEntity(jobId: number, path: string): ThumbnailEntity {
    const id = makeStableId('thumbnail', String(jobId));
    return {
      id,
      type: 'thumbnail',
      label: `Thumbnail #${jobId}`,
      metadata: {
        assetId: makeStableId('asset', String(jobId)),
        width: 0, // Se actualiza externamente
        height: 0,
      },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }

  transcriptEntity(jobId: number, language: string = 'unknown', duration: string = '0'): TranscriptEntity {
    const id = makeStableId('transcript', String(jobId));
    return {
      id,
      type: 'transcript',
      label: `Transcript #${jobId}`,
      metadata: {
        language,
        duration,
        chunkCount: '0',
        assetId: makeStableId('asset', String(jobId)),
      },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }

  // --- Triple Builders ---

  triplesForJob(job: PulsarJobRecord, platform?: string): RelationTriple[] {
    const videoId = makeStableId('video', String(job.id));
    const assetId = makeStableId('asset', String(job.id));
    const sourceId = makeStableId('source', simpleChecksum(job.url));
    const creatorId = makeStableId('creator', simpleChecksum(job.author || 'unknown'));
    const thumbnailId = makeStableId('thumbnail', String(job.id));
    const transcriptId = makeStableId('transcript', String(job.id));

    const triples: RelationTriple[] = [
      // Video ? Asset
      this.triple(videoId, 'references_asset', assetId),
      // Video ? Source
      this.triple(videoId, 'downloaded_from', sourceId, 'system', { confidence: 1.0, importance: 0.8 }),
      // Video ? Creator
      ...(job.author ? [this.triple(videoId, 'uploaded_by', creatorId, 'inferred', { confidence: 0.85, importance: 0.6 })] : []),
      // Video ? Thumbnail
      this.triple(videoId, 'has_thumbnail', thumbnailId, 'system', { confidence: 1.0, importance: 0.5 }),
      // Video ? Transcript
      ...(job.transcript_path ? [this.triple(videoId, 'has_transcript', transcriptId, 'system', { confidence: 1.0, importance: 0.7 })] : []),
      // Video ? Duration
      ...(job.duration ? [this.triple(videoId, 'has_duration', `${job.duration}s`, 'system', { confidence: 1.0, importance: 0.4 })] : []),
    ];

    // Tags
    if (job.title) {
      const words = job.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      words.slice(0, 5).forEach(word => {
        const tagId = makeStableId('tag', word);
        triples.push(this.triple(videoId, 'tagged_with', tagId, 'inferred', { confidence: 0.6, importance: 0.3 }));
      });
    }

    return triples;
  }

  triplesForPlaylist(playlist: PulsarPlaylistRecord, videoIds: string[]): RelationTriple[] {
    const playlistId = makeStableId('playlist', String(playlist.id));
    const triples: RelationTriple[] = [];

    videoIds.forEach(videoId => {
      triples.push(this.triple(playlistId, 'contains_media', videoId, 'user', { confidence: 1.0, importance: 0.8 }));
      triples.push(this.triple(videoId, 'part_of_playlist', playlistId, 'user', { confidence: 1.0, importance: 0.8 }));
    });

    // Topic keywords como tags
    try {
      const keywords: string[] = JSON.parse(playlist.topic_keywords);
      keywords.forEach(keyword => {
        const tagId = makeStableId('tag', keyword.toLowerCase());
        triples.push(this.triple(playlistId, 'tagged_with', tagId, 'user', { confidence: 0.9, importance: 0.5 }));
      });
    } catch {
      // ignore invalid JSON
    }

    return triples;
  }

  // --- Full Export ---

  exportJobToSemantic(job: PulsarJobRecord, platform?: string): {
    entities: SemanticEntity[];
    triples: RelationTriple[];
  } {
    const video = this.videoEntity(job, platform);
    const asset = this.assetEntity(job);
    const source = this.sourceEntity(job.url, platform || 'generic');
    const creator = job.author ? this.creatorEntity(job.author, platform) : null;
    const thumbnail = this.thumbnailEntity(job.id, job.thumbnail || `data/thumbnails/${job.id}.jpg`);
    const transcript = job.transcript_path ? this.transcriptEntity(job.id) : null;

    const entities: SemanticEntity[] = [video, asset, source, thumbnail];
    if (creator) entities.push(creator);
    if (transcript) entities.push(transcript);

    const triples = this.triplesForJob(job, platform);

    return { entities, triples };
  }

  exportPlaylistToSemantic(playlist: PulsarPlaylistRecord, videoIds: string[]): {
    entities: SemanticEntity[];
    triples: RelationTriple[];
  } {
    const playlistEntity = this.playlistEntity(playlist);
    const triples = this.triplesForPlaylist(playlist, videoIds);
    return { entities: [playlistEntity], triples };
  }
}
