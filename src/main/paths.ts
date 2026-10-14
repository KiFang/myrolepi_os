import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Запуск из лаунчера Asteia Alltools:
 *   myrolepi-os --launcher --data-dir <путь> --plugins-dir <путь> --lang ru
 * Все аргументы необязательны; без них приложение работает автономно.
 */
export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export const dataDir = arg('data-dir') ?? path.join(app.getPath('userData'), 'data');
export const pluginsDir = arg('plugins-dir') ?? (app.isPackaged ? path.join(app.getPath('userData'), 'plugins') : path.join(app.getAppPath(), 'plugins'));
export const launcherMode = process.argv.includes('--launcher');
export const resDir = app.isPackaged ? process.resourcesPath : app.getAppPath();

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(pluginsDir, { recursive: true });
