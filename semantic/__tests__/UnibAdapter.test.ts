import { UnibAdapter } from '../adapter/UnibAdapter';

describe('UnibAdapter', () => {
  const adapter = new UnibAdapter('test-project');

  test('creates video entity from job record', () => {
    const job = {
      id: 1,
      url: 'https://tiktok.com/@user/video/123',
      status: 'complete',
      progress: 100,
      created_at: '2026-08-22T00:00:00Z',
      title: 'Test Video',
      author: 'Test Author',
      duration: 120,
      video_path: 'data/processing/1/video.mp4',
      audio_path: 'data/processing/1/audio.mp3',
      transcript_path: 'data/processing/1/transcript.txt',
    };

    const { entities, triples } = adapter.exportJobToSemantic(job, 'tiktok');

    expect(entities.length).toBeGreaterThanOrEqual(4);
    expect(entities[0].id).toBe('video:1');
    expect(entities[0].type).toBe('video');
    expect(triples.length).toBeGreaterThanOrEqual(4);
    expect(triples.some(t => t.relation === 'references_asset')).toBe(true);
    expect(triples.some(t => t.relation === 'downloaded_from')).toBe(true);
    expect(triples.some(t => t.relation === 'uploaded_by')).toBe(true);
  });

  test('creates playlist entity and triples', () => {
    const playlist = {
      id: 10,
      name: 'Test Playlist',
      description: 'A test playlist',
      color: '#8a5cff',
      auto_generated: false,
      topic_keywords: '["rust","programming"]',
    };

    const { entities, triples } = adapter.exportPlaylistToSemantic(playlist, ['video:1', 'video:2']);

    expect(entities.length).toBe(1);
    expect(entities[0].id).toBe('playlist:10');
    expect(entities[0].type).toBe('playlist');
    expect(triples.length).toBe(4);
  });
});
