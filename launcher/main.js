const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { normalizeReleases, safeName, isAllowedDownload } = require('./lib');

const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const root = path.join(app.getPath('userData'), 'asteia');
const statePath = path.join(root, 'state.json');
const modules = JSON.parse(fs.readFileSync(path.join(__dirname, 'modules.json'), 'utf8'));
fs.mkdirSync(root, { recursive: true });

const readState = () => { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return { installed: {} }; } };
const writeState = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
const findModule = (id) => { const m = modules.find((x) => x.id === id); if (!m) throw new Error('Неизвестный модуль'); return m; };
const lang = () => (app.getLocale().startsWith('ru') ? 'ru' : 'en');

ipcMain.handle('modules:list', () => ({ modules, installed: readState().installed, platform, arch, root }));

ipcMain.handle('releases:get', async (_e, id) => {
  const m = findModule(id);
  if (!m.repo) return [];
  const res = await fetch(`https://api.github.com/repos/${m.repo}/releases`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'asteia-launcher' } });
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  return normalizeReleases(await res.json(), platform, arch);
});

ipcMain.handle('module:install', async (e, id, release) => {
  const m = findModule(id);
  const asset = release.asset;
  if (!asset || !isAllowedDownload(asset.browser_download_url)) throw new Error('Для этой версии нет сборки под вашу систему');
  const dir = path.join(root, 'modules', safeName(id), safeName(release.version));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, safeName(asset.name));
  const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'asteia-launcher' } });
  if (!res.ok || !res.body) throw new Error(`Загрузка: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  let got = 0;
  const src = Readable.fromWeb(res.body);
  src.on('data', (c) => { got += c.length; e.sender.send('install:progress', { id, got, total }); });
  await pipeline(src, fs.createWriteStream(file + '.part'));
  fs.renameSync(file + '.part', file);
  let entry = file;
  if (platform === 'linux') fs.chmodSync(file, 0o755);
  if (platform === 'mac' && file.endsWith('.zip')) {
    execFileSync('ditto', ['-xk', file, dir]);
    const appDir = fs.readdirSync(dir).find((f) => f.endsWith('.app'));
    if (!appDir) throw new Error('В архиве нет .app');
    entry = path.join(dir, appDir);
  }
  const s = readState();
  const rec = s.installed[id] || { versions: {}, current: null };
  rec.versions[release.version] = { entry };
  rec.current = release.version;
  s.installed[id] = rec;
  writeState(s);
  return s.installed;
});

ipcMain.handle('module:select', (_e, id, version) => {
  const s = readState();
  if (!s.installed[id]?.versions[version]) throw new Error('Версия не установлена');
  s.installed[id].current = version;
  writeState(s);
  return s.installed;
});

ipcMain.handle('module:uninstall', (_e, id, version) => {
  const s = readState();
  const rec = s.installed[id];
  if (!rec?.versions[version]) return s.installed;
  fs.rmSync(path.join(root, 'modules', safeName(id), safeName(version)), { recursive: true, force: true });
  delete rec.versions[version];
  const left = Object.keys(rec.versions);
  if (!left.length) delete s.installed[id]; else if (rec.current === version) rec.current = left[left.length - 1];
  writeState(s);
  return s.installed;
});

ipcMain.handle('module:launch', (_e, id) => {
  findModule(id);
  const rec = readState().installed[id];
  const v = rec && rec.versions[rec.current];
  if (!v) throw new Error('Модуль не установлен');
  const dataDir = path.join(root, 'data', safeName(id));
  const pluginsDir = path.join(root, 'plugins', safeName(id));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(pluginsDir, { recursive: true });
  const args = ['--launcher', '--data-dir', dataDir, '--plugins-dir', pluginsDir, '--lang', lang()];
  const child = platform === 'mac'
    ? spawn('open', ['-n', v.entry, '--args', ...args], { detached: true, stdio: 'ignore' })
    : spawn(v.entry, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
});

ipcMain.handle('open:folder', () => shell.openPath(root));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1000, height: 680, minWidth: 760, minHeight: 500, backgroundColor: '#14151a', title: 'Asteia Alltools',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
