import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Резервные копии: снимок документов (системы, кампании, состояние приложения, данные плагинов).
 * Файлы-картинки не копируются: они неизменяемы и общие, а их очистка учитывает копии.
 */
export type BackupReason = 'auto' | 'manual' | 'before-migration' | 'before-restore' | 'before-import';

export interface BackupManifest {
  id: string;
  createdAt: string;
  reason: BackupReason;
  note?: string;
  app: string;
  systems: number;
  campaigns: number;
  bytes: number;
}

export const BACKUP_DIRS = ['systems', 'campaigns', 'app', 'plugin-data'] as const;
export const BACKUP_ID_RE = /^\d{8}-\d{6}-\d{3}-[a-z-]+$/;
export const KEEP_AUTOMATIC = 30;
export const KEEP_MANUAL = 100;
export const AUTO_INTERVAL_MS = 10 * 60 * 1000;

export const backupsDir = (dataDir: string) => path.join(dataDir, 'backups');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}
const countJson = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length : 0);

export function createBackup(dataDir: string, reason: BackupReason, app: string, note?: string, now = new Date()): BackupManifest {
  let id = `${stamp(now)}-${reason}`;
  const root = backupsDir(dataDir);
  fs.mkdirSync(root, { recursive: true });
  for (let n = 1; fs.existsSync(path.join(root, id)); n++) id = `${stamp(new Date(now.getTime() + n))}-${reason}`; // два снимка в одну миллисекунду
  const dest = path.join(root, id);
  fs.mkdirSync(dest, { recursive: true });
  for (const d of BACKUP_DIRS) {
    const from = path.join(dataDir, d);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dest, d), { recursive: true });
  }
  const manifest: BackupManifest = { id, createdAt: now.toISOString(), reason, note, app, systems: countJson(path.join(dest, 'systems')), campaigns: countJson(path.join(dest, 'campaigns')), bytes: dirSize(dest) };
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
  pruneBackups(dataDir);
  return manifest;
}

export function listBackups(dataDir: string): BackupManifest[] {
  const root = backupsDir(dataDir);
  if (!fs.existsSync(root)) return [];
  const out: BackupManifest[] = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || !BACKUP_ID_RE.test(e.name)) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(root, e.name, 'manifest.json'), 'utf8'))); } catch { /* повреждённый снимок пропускаем */ }
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

export function deleteBackup(dataDir: string, id: string): boolean {
  if (!BACKUP_ID_RE.test(id)) return false;
  const dir = path.join(backupsDir(dataDir), id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Автоматические снимки (и служебные) хранятся ограниченно, ручные — дольше. */
export function pruneBackups(dataDir: string, keepAuto = KEEP_AUTOMATIC, keepManual = KEEP_MANUAL): number {
  const all = listBackups(dataDir);
  let removed = 0;
  for (const [pool, limit] of [[all.filter((b) => b.reason !== 'manual'), keepAuto], [all.filter((b) => b.reason === 'manual'), keepManual]] as const) {
    for (const b of pool.slice(limit)) if (deleteBackup(dataDir, b.id)) removed++;
  }
  return removed;
}

/** Делает автоматический снимок, если с прошлого прошло достаточно времени. */
export function autoBackup(dataDir: string, app: string, now = new Date(), minIntervalMs = AUTO_INTERVAL_MS): BackupManifest | null {
  const last = listBackups(dataDir).find((b) => b.reason === 'auto');
  if (last && now.getTime() - new Date(last.createdAt).getTime() < minIntervalMs) return null;
  return createBackup(dataDir, 'auto', app, undefined, now);
}

/** Восстанавливает снимок. Перед этим текущее состояние сохраняется отдельным снимком — восстановление можно отменить. */
export function restoreBackup(dataDir: string, id: string, app: string): { restored: BackupManifest; safety: BackupManifest } | null {
  if (!BACKUP_ID_RE.test(id)) return null;
  const src = path.join(backupsDir(dataDir), id);
  if (!fs.existsSync(path.join(src, 'manifest.json'))) return null;
  const restored: BackupManifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
  const safety = createBackup(dataDir, 'before-restore', app, `перед восстановлением ${id}`);
  for (const d of BACKUP_DIRS) {
    const target = path.join(dataDir, d);
    fs.rmSync(target, { recursive: true, force: true });
    if (fs.existsSync(path.join(src, d))) fs.cpSync(path.join(src, d), target, { recursive: true });
  }
  return { restored, safety };
}
