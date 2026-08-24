import { UnibValidator } from '../unib/validator/UnibValidator';
import { UnibParser } from '../unib/parser/UnibParser';

describe('UnibValidator', () => {
  const parser = new UnibParser();
  const validator = new UnibValidator();

  test('validates correct document', () => {
    const doc = parser.parse(`[V#media] @v1:video > downloaded_from > @s1:source ?0.9 !0.8 ^user.
`);
    const result = validator.validate(doc);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('detects invalid confidence', () => {
    const doc = parser.parse(`[V#media] @v1:video > tagged_with > @t1:tag ?1.5 !0.8 ^user.
`);
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Confidence out of range'))).toBe(true);
  });

  test('detects invalid entity type', () => {
    const doc = parser.parse(`[V#media] @v1:invalid_type > downloaded_from > @s1:source ^user.
`);
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid subject entity type'))).toBe(true);
  });
});
