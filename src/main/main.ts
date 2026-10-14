import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateManifest } from '../core/plugin';
import { Platform, checkForUpdate, validateFeed } from '../core/updates';

/**
 * Запуск из лаунчера Asteia Alltools:
 *   myrolepi-os --launcher --data-dir <путь> --plugins-dir <путь> --lang ru
 * Все аргументы необязательны; без них приложение работает автономно.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dataDir = arg('data-dir') ?? path.join(app.getPath('userData'), 'data');
const pluginsDir = arg('plugins-dir') ?? (app.isPackaged ? path.join(app.getPath('userData'), 'plugins') : path.join(app.getAppPath(), 'plugins'));
const launcherMode = process.argv.includes('--launcher');
// URL фида обновлений (latest.json). В режиме лаунчера обновлениями управляет он — приложение само не проверяет.
const updateFeedUrl = arg('update-feed') ?? process.env.MYROLEPI_UPDATE_FEED;
const resDir = app.isPackaged ? process.resourcesPath : app.getAppPath();
const platform: Platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const archName = process.arch === 'arm64' ? 'arm64' : 'x64';
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(pluginsDir, { recursive: true });

interface LoadedPlugin {
  dir: string;
  manifest: unknown;
  errors: string[];
  code?: string;
}

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

/** Хранилище проектов: JSON-файлы в dataDir. Имена санитизируются от выхода из каталога. */
const safe = (name: string) => name.replace(/[^\p{L}\p{N}_.\- ]/gu, '_').replace(/^\.+/, '_');
ipcMain.handle('plugins:list', () => scanPlugins());
ipcMain.handle('env:info', () => ({ dataDir, pluginsDir, launcherMode, version: app.getVersion(), platform, updatesEnabled: !launcherMode && !!updateFeedUrl, lang: arg('lang') ?? app.getLocale() }));
ipcMain.handle('changelog:read', () => {
  const f = path.join(resDir, 'CHANGELOG.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
ipcMain.handle('updates:check', async () => {
  if (launcherMode || !updateFeedUrl) return null;
  const res = await fetch(updateFeedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const feed: unknown = await res.json();
  if (!validateFeed(feed)) throw new Error('Некорректный фид обновлений');
  return checkForUpdate(app.getVersion(), feed, platform, archName);
});
ipcMain.handle('updates:openRelease', (_e, url: string) => (/^https:/.test(url) ? shell.openExternal(url) : undefined));
ipcMain.handle('plugins:openFolder', () => shell.openPath(pluginsDir));
ipcMain.handle('store:list', (_e, kind: string) => {
  const d = path.join(dataDir, safe(kind));
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
});
ipcMain.handle('store:read', (_e, kind: string, id: string) => {
  const f = path.join(dataDir, safe(kind), `${safe(id)}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
});
ipcMain.handle('store:write', (_e, kind: string, id: string, data: unknown) => {
  const d = path.join(dataDir, safe(kind));
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, `${safe(id)}.json`);
  fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(f + '.tmp', f); // атомарная запись
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14151a',
    title: 'MyRolePi OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '../../dist/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
