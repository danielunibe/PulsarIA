import { UnibParser } from '../unib/parser/UnibParser';

describe('UnibParser', () => {
  const parser = new UnibParser();

  test('parses valid .unib file with headers and memories', () => {
    const input = `@unib:0.0
@owner:@daniel:h
@lang:es
@mode:media
@created:2026-08-22

[V#media] @video_1:video > downloaded_from > @source_tiktok:source ?0.99 !0.8 {st:confirmed} ^user.
`;

    const doc = parser.parse(input);
    expect(doc.headers.version).toBe('0.0');
    expect(doc.headers.owner).toBe('@daniel:h');
    expect(doc.memories.length).toBe(1);
    expect(doc.memories[0].subjectId).toBe('video_1');
    expect(doc.memories[0].relation).toBe('downloaded_from');
    expect(doc.memories[0].objectId).toBe('source_tiktok');
    expect(doc.memories[0].confidence).toBeCloseTo(0.99);
    expect(doc.memories[0].importance).toBeCloseTo(0.8);
    expect(doc.memories[0].source).toBe('user');
    expect(doc.errors.length).toBe(0);
  });

  test('handles empty file', () => {
    const doc = parser.parse('');
    expect(doc.headers.version).toBe('0.0');
    expect(doc.memories.length).toBe(0);
    expect(doc.errors.length).toBe(0);
  });

  test('detects syntax errors', () => {
    const input = `invalid line without proper syntax
another bad line
`;
    const doc = parser.parse(input);
    expect(doc.memories.length).toBe(0);
    expect(doc.errors.length).toBe(2);
  });

  test('parses metadata correctly', () => {
    const input = `[T#event] @2026-08-22:e > published_at > @video_1:video ?0.95 !0.6 {st:temp;ttl:30d} ^system.
`;
    const doc = parser.parse(input);
    expect(doc.memories[0].metadata.st).toBe('temp');
    expect(doc.memories[0].metadata.ttl).toBe('30d');
  });
});
