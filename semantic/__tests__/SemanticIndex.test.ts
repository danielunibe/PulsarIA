import { SemanticIndex } from '../index/SemanticIndex';
import { SemanticEntity } from '../domain/entities';
import { RelationTriple } from '../domain/relations';

describe('SemanticIndex', () => {
  let index: SemanticIndex;

  beforeEach(() => {
    index = new SemanticIndex();
  });

  test('indexes entities and triples', () => {
    const entities: SemanticEntity[] = [
      { id: 'video:1', type: 'video', label: 'V1', metadata: {}, createdAt: '2026-08-22', updatedAt: '2026-08-22' },
      { id: 'tag:rust', type: 'tag', label: 'Rust', metadata: {}, createdAt: '2026-08-22', updatedAt: '2026-08-22' },
    ];

    const triples: RelationTriple[] = [
      { subjectId: 'video:1', relation: 'tagged_with', objectId: 'tag:rust', weight: { confidence: 0.9, importance: 0.7 }, metadata: {}, source: 'system' },
    ];

    index.index(entities, triples);
    expect(index.size().entities).toBe(2);
    expect(index.size().triples).toBe(1);
    expect(index.getEntity('video:1')?.label).toBe('V1');
    expect(index.getTriplesByRelation('tagged_with').length).toBe(1);
  });

  test('clears index', () => {
    index.index([], []);
    expect(index.size().entities).toBe(0);
    expect(index.size().triples).toBe(0);
  });
});
