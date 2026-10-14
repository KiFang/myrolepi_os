import { ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateManifest } from '../core/plugin';
import { pluginsDir, resDir } from './paths';

interface LoadedPlugin { dir: string; manifest: unknown; errors: string[]; code?: string }

function scanPlugins(): LoadedPlugin[] {
  const out: LoadedPlugin[] = [];
  for (const e of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(pluginsDir, e.name);
    const mf = path.join(dir, 'plugin.json');
    if (!fs.existsSync(mf)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const errors = validateManifest(manifest);
      let code: string | undefined;
      if (!errors.length) {
        const mainPath = path.resolve(dir, manifest.main);
        if (!mainPath.startsWith(dir + path.sep)) errors.push('main выходит за пределы папки плагина');
        else if (!fs.existsSync(mainPath)) errors.push(`Не найден файл ${manifest.main}`);
        else code = fs.readFileSync(mainPath, 'utf8');
      }
      out.push({ dir: e.name, manifest, errors, code });
    } catch (err) {
      out.push({ dir: e.name, manifest: null, errors: [`plugin.json: ${(err as Error).message}`] });
    }
  }
  return out;
}

export function registerPluginHandlers() {
  ipcMain.handle('plugins:list', () => scanPlugins());
  ipcMain.handle('plugins:openFolder', () => shell.openPath(pluginsDir));

  /** Шаблон нового плагина: папка с рабочими plugin.json и index.js, которые можно сразу править. */
  ipcMain.handle('plugins:scaffold', (_e, rawId: string, files: Record<string, string>) => {
    const id = String(rawId).toLowerCase().replace(/[^a-z0-9.\-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '') || 'my-plugin';
    let dir = path.join(pluginsDir, id);
    for (let n = 2; fs.existsSync(dir); n++) dir = path.join(pluginsDir, `${id}-${n}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      if (name.includes('/') || name.includes('\\') || name.includes('..')) continue;
      fs.writeFileSync(path.join(dir, name), text);
    }
    void shell.openPath(dir);
    return path.basename(dir);
  });

  /** Копирует примеры плагинов из поставки в папку плагинов (ничего не перезаписывает). Сами они остаются выключенными до согласия. */
  ipcMain.handle('plugins:installExamples', () => {
    const from = path.join(resDir, 'plugins');
    if (path.resolve(from) === path.resolve(pluginsDir) || !fs.existsSync(from)) return 0;
    let copied = 0;
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (!e.isDirectory() || fs.existsSync(path.join(pluginsDir, e.name))) continue;
      fs.cpSync(path.join(from, e.name), path.join(pluginsDir, e.name), { recursive: true });
      copied++;
    }
    return copied;
  });
}
