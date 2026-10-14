import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Файлы плагина, которые приложение отдаёт панелям. Всё остальное (в том числе скрытые файлы) недоступно. */
export const SERVED_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

export const MAX_FILES = 300;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export interface PluginTree { files: { rel: string; size: number; mtimeMs: number }[]; signature: string }

/** Список файлов папки плагина (рекурсивно, без символических ссылок). null — папка слишком большая. */
export function walk(root: string): PluginTree | null {
  const files: PluginTree['files'] = [];
  let total = 0;
  const visit = (dir: string, prefix: string): boolean => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!visit(abs, rel)) return false; continue; }
      if (!e.isFile()) continue;
      const st = fs.statSync(abs);
      total += st.size;
      files.push({ rel, size: st.size, mtimeMs: st.mtimeMs });
      if (files.length > MAX_FILES || total > MAX_TOTAL_BYTES) return false;
    }
    return true;
  };
  if (!visit(root, '')) return null;
  return { files, signature: files.map((f) => `${f.rel}:${f.size}:${f.mtimeMs}`).join('|') };
}

const cache = new Map<string, { signature: string; hash: string }>();

/** Отпечаток всех файлов плагина (имена и содержимое). Пустая строка — папка слишком большая. */
export function hashPluginDir(root: string): string {
  const tree = walk(root);
  if (!tree) return '';
  const hit = cache.get(root);
  if (hit && hit.signature === tree.signature) return hit.hash;
  const h = crypto.createHash('sha256');
  for (const f of tree.files) { h.update(f.rel + '\0'); h.update(fs.readFileSync(path.join(root, f.rel))); h.update('\0'); }
  const hash = h.digest('hex');
  cache.set(root, { signature: tree.signature, hash });
  return hash;
}

/** Безопасный путь внутри папки плагина для отдачи панели; null, если путь недопустим. */
export function servedPath(root: string, requested: string): string | null {
  let rel: string;
  try { rel = decodeURIComponent(requested); } catch { return null; }
  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.includes('\0') || rel.includes('\\')) return null;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '.' || p === '' || p.startsWith('.'))) return null;
  if (!(path.extname(rel).toLowerCase() in SERVED_TYPES)) return null;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return null;
  try {
    const real = fs.realpathSync(abs);
    if (!real.startsWith(fs.realpathSync(root) + path.sep) || !fs.statSync(real).isFile()) return null;
    return real;
  } catch { return null; }
}

/** Заголовок политики безопасности для страниц панелей: ни сети, ни внешних ресурсов, только файлы самого плагина. */
export const PANEL_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
