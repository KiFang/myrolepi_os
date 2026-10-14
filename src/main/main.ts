import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerAudioHandlers } from './ipc-audio';
import { registerDataHandlers } from './ipc-data';
import { arg, dataDir, launcherMode, pluginsDir, resDir } from './paths';
import { registerPluginHandlers } from './plugins';
import { declareSchemes, registerProtocols } from './protocols';

declareSchemes();

ipcMain.handle('env:info', () => ({ dataDir, pluginsDir, launcherMode, version: app.getVersion(), lang: arg('lang') ?? app.getLocale() }));
ipcMain.handle('changelog:read', () => {
  const f = path.join(resDir, 'CHANGELOG.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
});
registerDataHandlers();
registerAudioHandlers();
registerPluginHandlers();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14161c',
    show: false, // окно появляется, когда интерфейс готов: без белой вспышки и полупустого окна
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    title: 'Rolepi',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // музыку сцены запускает приложение, а не нажатие на странице
    },
  });
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', title: 'Несохранённые изменения',
      message: 'Закрыть документ без сохранения?',
      buttons: ['Продолжить редактирование', 'Закрыть без сохранения'],
      defaultId: 0, cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); }, 4000); // на случай, если событие не придёт
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
  app.whenReady().then(() => { registerProtocols(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
