/** Resolve local media only after the native backend authorizes that exact,
 * persisted file for the Tauri asset protocol.
 */
export async function resolveAuthorizedAssetUrl(
  localPath: string | null | undefined,
): Promise<string | undefined> {
  if (!localPath) return undefined;
  if (/^(https:\/\/|data:)/i.test(localPath)) return localPath;

  try {
    const { convertFileSrc, invoke } = await import('@tauri-apps/api/core');
    const authorizedPath = await invoke<string>('authorize_renderable_asset', {
      path: localPath,
    });
    return convertFileSrc(authorizedPath);
  } catch {
    return undefined;
  }
}
