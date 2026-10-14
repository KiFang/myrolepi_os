import { protocol } from 'electron';
import { dataDir } from './paths';
import { mimeOf, readAsset } from './lib/assets';

/**
 * Собственные адреса:
 *   rolepi-asset://<файл>   — картинки проекта (только по имени-хешу, без путей)
 * Схемы нужно объявить до запуска приложения.
 */
export function declareSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'rolepi-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

export function registerProtocols() {
  protocol.handle('rolepi-asset', (req) => {
    const id = new URL(req.url).hostname;
    const bytes = readAsset(dataDir, id);
    if (!bytes) return new Response('not found', { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': mimeOf(id), 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  });
}
