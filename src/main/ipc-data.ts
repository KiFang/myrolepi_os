import { app, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AssetError, gcAssets, listAssets, putAsset, readAsset } from './lib/assets';
import { BackupReason, autoBackup, backupsDir, createBackup, deleteBackup, listBackups, restoreBackup } from './lib/backups';
import { dataDir } from './paths';

/** Имена каталогов и файлов не должны выходить за пределы папки данных. */
const safe = (name: string) => name.replace(/[^\p{L}\p{N}_.\- ]/gu, '_').replace(/^\.+/, '_');
const REASONS: BackupReason[] = ['manual', 'before-migration', 'before-import'];

export function registerDataHandlers() {
  // документы: JSON-файлы, запись атомарная
  ipcMain.handle('store:list', (_e, kind: string) => {
    const d = path.join(dataDir, safe(kind));
    return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  });
  ipcMain.handle('store:read', (_e, kind: string, id: string) => {
    const f = path.join(dataDir, safe(kind), `${safe(id)}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  });
  ipcMain.handle('store:remove', (_e, kind: string, id: string) => {
    fs.rmSync(path.join(dataDir, safe(kind), `${safe(id)}.json`), { force: true });
  });
  ipcMain.handle('store:write', (_e, kind: string, id: string, data: unknown) => {
    const d = path.join(dataDir, safe(kind));
    fs.mkdirSync(d, { recursive: true });
    const f = path.join(d, `${safe(id)}.json`);
    fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 2));
    fs.renameSync(f + '.tmp', f);
  });

  // файлы проекта (картинки)
  ipcMain.handle('assets:put', (_e, bytes: Uint8Array) => {
    try { return { ok: true, ...putAsset(dataDir, bytes) }; }
    catch (e) { if (e instanceof AssetError) return { ok: false, code: e.code, message: e.message }; throw e; }
  });
  ipcMain.handle('assets:read', (_e, id: string) => readAsset(dataDir, id));
  ipcMain.handle('assets:list', () => listAssets(dataDir));
  ipcMain.handle('assets:gc', (_e, extraRefs: string[]) => gcAssets(dataDir, Array.isArray(extraRefs) ? extraRefs : []));

  // резервные копии
  ipcMain.handle('backups:list', () => listBackups(dataDir));
  ipcMain.handle('backups:create', (_e, reason: BackupReason, note?: string) => createBackup(dataDir, REASONS.includes(reason) ? reason : 'manual', app.getVersion(), typeof note === 'string' ? note.slice(0, 200) : undefined));
  ipcMain.handle('backups:auto', () => autoBackup(dataDir, app.getVersion()));
  ipcMain.handle('backups:restore', (_e, id: string) => restoreBackup(dataDir, id, app.getVersion()));
  ipcMain.handle('backups:delete', (_e, id: string) => deleteBackup(dataDir, id));
  ipcMain.handle('backups:openFolder', () => { fs.mkdirSync(backupsDir(dataDir), { recursive: true }); return shell.openPath(backupsDir(dataDir)); });
}
