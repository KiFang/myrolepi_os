import { protocol } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dataDir, pluginsDir, resDir } from './paths';
import { mimeOf, readAsset } from './lib/assets';
import { PANEL_CSP, SERVED_TYPES, hashPluginDir, servedPath } from './lib/pluginFiles';
import { approvedHashes, pluginDirOf } from './plugins';

/**
 * Собственные адреса:
 *   rolepi-asset://<файл>            — картинки проекта (только по имени-хешу, без путей)
 *   rolepi-plugin://<id>/<путь>      — файлы панелей плагина; страницы открываются в изолированной рамке
 * Схемы нужно объявить до запуска приложения.
 */
export function declareSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'rolepi-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: 'rolepi-plugin', privileges: { standard: true, secure: true } },
  ]);
}

const plain = (status: number, text: string) => new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export function registerProtocols() {
  protocol.handle('rolepi-asset', (req) => {
    const id = new URL(req.url).hostname;
    const bytes = readAsset(dataDir, id);
    if (!bytes) return new Response('not found', { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': mimeOf(id), 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  });

  protocol.handle('rolepi-plugin', (req) => {
    const url = new URL(req.url);
    const id = url.hostname;
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    // встроенные файлы для панелей: помощник общения с приложением и оформление
    // (адрес @sdk.js работает из любой вложенной папки плагина)
    const sdkName = path.posix.basename(rel);
    if (sdkName === '@sdk.js' || sdkName === '@sdk.css') {
      const f = path.join(resDir, 'panel-sdk', sdkName === '@sdk.js' ? 'sdk.js' : 'sdk.css');
      if (!fs.existsSync(f)) return plain(404, 'sdk missing');
      return new Response(fs.readFileSync(f), { headers: { 'content-type': SERVED_TYPES[path.extname(f)], 'cache-control': 'no-store' } });
    }
    const dir = pluginDirOf(id);
    const approved = approvedHashes.get(id);
    if (!dir || !approved) return plain(404, 'plugin not found');
    const root = path.join(pluginsDir, dir);
    // файлы изменились после того, как приложение показало согласие, — не отдаём ничего, пока плагин не перечитан
    if (hashPluginDir(root) !== approved) return plain(409, 'plugin files changed');
    const file = servedPath(root, rel);
    if (!file) return plain(404, 'not found');
    const type = SERVED_TYPES[path.extname(file).toLowerCase()];
    const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (type.startsWith('text/html')) headers['content-security-policy'] = PANEL_CSP;
    return new Response(fs.readFileSync(file), { headers });
  });
}
