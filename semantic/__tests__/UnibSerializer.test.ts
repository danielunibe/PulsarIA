import { UnibSerializer } from '../unib/serializer/UnibSerializer';
import { UnibParser } from '../unib/parser/UnibParser';

describe('UnibSerializer', () => {
  const serializer = new UnibSerializer();
  const parser = new UnibParser();

  test('round-trip: serialize then parse preserves data', () => {
    const doc = {
      headers: { version: '0.0', owner: '@test:h', lang: 'es', mode: 'media', created: '2026-08-22' },
      memories: [
        {
          typeCode: 'V' as const,
          field: 'media',
          subjectId: 'video_1',
          subjectType: 'video',
          relation: 'downloaded_from' as const,
          objectId: 'source_1',
          objectType: 'source',
          confidence: 0.99,
          importance: 0.8,
          metadata: { st: 'confirmed' },
          source: 'user',
          raw: '',
        },
      ],
      errors: [],
    };

    const serialized = serializer.serialize(doc);
    const reparsed = parser.parse(serialized);

    expect(reparsed.headers.version).toBe('0.0');
    expect(reparsed.memories.length).toBe(1);
    expect(reparsed.memories[0].subjectId).toBe('video_1');
    expect(reparsed.memories[0].confidence).toBeCloseTo(0.99);
    expect(reparsed.memories[0].metadata.st).toBe('confirmed');
  });

  test('deterministic output', () => {
    const doc = {
      headers: { version: '0.0', owner: '@test:h' },
      memories: [] as any[],
      errors: [],
    };

    const first = serializer.serialize(doc);
    const second = serializer.serialize(doc);
    expect(first).toBe(second);
  });
});
