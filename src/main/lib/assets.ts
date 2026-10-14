import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Хранилище файлов проекта (картинки; в 0.3 — звуки и карты). Файлы адресуются содержимым:
 * имя = sha256 + расширение. Одинаковые файлы хранятся один раз, а ссылки в документах
 * ("asset:<имя>") не ломаются при копировании, экспорте и восстановлении из резервной копии.
 */
import { ASSET_ID_RE, ASSET_REF_RE } from '../../core/assetRef';
export { ASSET_ID_RE, ASSET_REF_RE };
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export class AssetError extends Error {
  constructor(public code: 'too-big' | 'bad-type' | 'bad-id' | 'empty', message: string) { super(message); }
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export const mimeOf = (id: string): string => MIME[id.split('.').pop() ?? ''] ?? 'application/octet-stream';

/** Определяет тип картинки по первым байтам (расширению и заявленному типу не верим). */
export function sniffImage(b: Uint8Array): 'png' | 'jpg' | 'webp' | 'gif' | null {
  const eq = (off: number, ...bytes: number[]) => bytes.every((v, i) => b[off + i] === v);
  if (b.length >= 8 && eq(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (b.length >= 3 && eq(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (b.length >= 12 && eq(0, 0x52, 0x49, 0x46, 0x46) && eq(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  if (b.length >= 6 && (eq(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || eq(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return 'gif';
  return null;
}

export const assetsDir = (dataDir: string) => path.join(dataDir, 'assets');

export function putAsset(dataDir: string, bytes: Uint8Array): { id: string; size: number; existed: boolean } {
  if (!bytes.length) throw new AssetError('empty', 'Пустой файл');
  if (bytes.length > MAX_ASSET_BYTES) throw new AssetError('too-big', 'Файл слишком большой (максимум 10 МБ)');
  const ext = sniffImage(bytes);
  if (!ext) throw new AssetError('bad-type', 'Поддерживаются картинки PNG, JPEG, WebP и GIF');
  const id = `${crypto.createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  const dir = assetsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, id);
  const existed = fs.existsSync(file);
  if (!existed) {
    fs.writeFileSync(file + '.tmp', bytes);
    fs.renameSync(file + '.tmp', file);
  }
  return { id, size: bytes.length, existed };
}

export function readAsset(dataDir: string, id: string): Buffer | null {
  if (!ASSET_ID_RE.test(id)) return null;
  const file = path.join(assetsDir(dataDir), id);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

export function listAssets(dataDir: string): { id: string; size: number }[] {
  const dir = assetsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => ASSET_ID_RE.test(f)).map((id) => ({ id, size: fs.statSync(path.join(dir, id)).size }));
}

/** Все ссылки "asset:…" в тексте. */
export function collectRefs(text: string): Set<string> {
  return new Set([...text.matchAll(ASSET_REF_RE)].map((m) => m[1]));
}

function* walkJson(dir: string, skip: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (p === skip) continue;
    if (e.isDirectory()) yield* walkJson(p, skip);
    else if (e.name.endsWith('.json')) yield p;
  }
}

/** Ссылки на файлы из всех документов, резервных копий и данных плагинов. */
export function referencedAssets(dataDir: string): Set<string> {
  const refs = new Set<string>();
  for (const f of walkJson(dataDir, assetsDir(dataDir))) for (const r of collectRefs(fs.readFileSync(f, 'utf8'))) refs.add(r);
  return refs;
}

/**
 * Удаляет файлы, на которые никто не ссылается. `extraRefs` — ссылки из несохранённого состояния
 * приложения; резервные копии тоже считаются «ссылающимися», чтобы восстановление не теряло картинки.
 */
export function gcAssets(dataDir: string, extraRefs: Iterable<string> = []): { deleted: number; bytes: number; kept: number } {
  const keep = referencedAssets(dataDir);
  for (const r of extraRefs) keep.add(r);
  let deleted = 0, bytes = 0, kept = 0;
  for (const a of listAssets(dataDir)) {
    if (keep.has(a.id)) { kept++; continue; }
    fs.rmSync(path.join(assetsDir(dataDir), a.id), { force: true });
    deleted++; bytes += a.size;
  }
  return { deleted, bytes, kept };
}
