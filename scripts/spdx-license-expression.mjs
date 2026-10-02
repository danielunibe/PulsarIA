const simpleLicenseIdentifier = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/;

/**
 * Cargo's historical slash separator means a choice between licenses. Convert
 * only simple identifier lists; preserve other SPDX expressions verbatim and
 * fail on ambiguous slash syntax instead of guessing.
 */
export function normalizeCargoLicenseExpression(value) {
  const declaration = typeof value === 'string' ? value.trim() : '';
  if (!declaration) return 'NOASSERTION';

  if (!declaration.includes('/')) return declaration;

  const choices = declaration.split(/\s*\/\s*/u);
  if (choices.length < 2 || choices.some((choice) => !simpleLicenseIdentifier.test(choice))) {
    throw new Error(`Unsupported Cargo license separator syntax: ${declaration}`);
  }

  return choices.join(' OR ');
}
