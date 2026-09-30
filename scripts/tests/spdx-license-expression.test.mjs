import assert from 'node:assert/strict';
import { test } from 'node:test';
import parseSpdxExpression from 'spdx-expression-parse';
import { normalizeCargoLicenseExpression } from '../spdx-license-expression.mjs';

test('Cargo legacy slash-separated license choices become valid SPDX OR expressions', () => {
  const expressions = [
    [ 'MIT/Apache-2.0', 'MIT OR Apache-2.0' ],
    [ 'BSD-3-Clause / MIT', 'BSD-3-Clause OR MIT' ],
    [ 'Unlicense/MIT', 'Unlicense OR MIT' ],
  ];

  for (const [declared, expected] of expressions) {
    const normalized = normalizeCargoLicenseExpression(declared);
    assert.equal(normalized, expected);
    assert.doesNotThrow(() => parseSpdxExpression(normalized));
  }
});

test('Cargo SPDX expressions without legacy slash syntax are preserved', () => {
  assert.equal(normalizeCargoLicenseExpression('MIT OR Apache-2.0'), 'MIT OR Apache-2.0');
  assert.equal(normalizeCargoLicenseExpression('MPL-2.0 AND MIT'), 'MPL-2.0 AND MIT');
  assert.equal(normalizeCargoLicenseExpression(''), 'NOASSERTION');
  assert.equal(normalizeCargoLicenseExpression(undefined), 'NOASSERTION');
});

test('ambiguous Cargo slash syntax fails instead of producing malformed SPDX', () => {
  assert.throws(() => normalizeCargoLicenseExpression('MIT//Apache-2.0'), /Unsupported Cargo license/);
  assert.throws(() => normalizeCargoLicenseExpression('MIT/Apache-2.0 AND BSD-3-Clause'), /Unsupported Cargo license/);
});
