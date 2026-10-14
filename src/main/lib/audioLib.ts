import * as fs from 'node:fs';
import * as path from 'node:path';
import { AUDIO_KINDS, compareAudio, describeAudio, isAudioFile, safeAudioPath } from '../../core/audio';
import type { AudioFile, AudioKind } from '../../core/audio';

export const MAX_AUDIO_FILES = 3000;
const MAX_DEPTH = 5;

export const audioRoot = (dataDir: string) => path.join(dataDir, 'audio');
export const kindDir = (dataDir: string, kind: AudioKind) => path.join(audioRoot(dataDir), kind);

/** Создаёт папки music/ и sounds/ (с короткой подсказкой внутри), если их ещё нет. */
export function ensureAudioDirs(dataDir: string, readme: Record<AudioKind, string>): void {
  for (const kind of AUDIO_KINDS) {
    const dir = kindDir(dataDir, kind);
    fs.mkdirSync(dir, { recursive: true });
    const note = path.join(dir, '_README.txt');
    if (!fs.existsSync(note)) { try { fs.writeFileSync(note, readme[kind]); } catch { /* только для подсказки */ } }
  }
}

/** Все звуковые файлы папок (подпапки до 5 уровней, без скрытых файлов и ссылок). Ошибки чтения не роняют список. */
export function listAudio(dataDir: string): AudioFile[] {
  const out: AudioFile[] = [];
  for (const kind of AUDIO_KINDS) {
    const root = kindDir(dataDir, kind);
    const visit = (dir: string, prefix: string, depth: number) => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= MAX_AUDIO_FILES) return;
        if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) { if (depth < MAX_DEPTH) visit(path.join(dir, e.name), rel, depth + 1); continue; }
        if (!e.isFile() || !isAudioFile(e.name) || !safeAudioPath(rel)) continue;
        try { out.push(describeAudio(kind, rel, fs.statSync(path.join(dir, e.name)).size)); } catch { /* файл исчез */ }
      }
    };
    visit(root, '', 0);
  }
  return out.sort((a, b) => (a.kind === b.kind ? compareAudio(a, b) : a.kind < b.kind ? -1 : 1));
}

/** Настоящий путь к файлу звука или null (путь недопустим, файла нет, ссылка ведёт за пределы папки). */
export function resolveAudio(dataDir: string, kind: string, rel: string): string | null {
  if (!(AUDIO_KINDS as readonly string[]).includes(kind) || !safeAudioPath(rel)) return null;
  const root = kindDir(dataDir, kind as AudioKind);
  try {
    const real = fs.realpathSync(path.resolve(root, ...rel.split('/')));
    if (!real.startsWith(fs.realpathSync(root) + path.sep) || !fs.statSync(real).isFile()) return null;
    return real;
  } catch { return null; }
}

/** Разбор заголовка Range ("bytes=0-99"). null — заголовка нет или он непонятен; 'invalid' — диапазон вне файла. */
export function parseRange(header: string | null | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number, end: number;
  if (m[1] === '') { const n = Number(m[2]); if (n === 0) return 'invalid'; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (size === 0 || start >= size || start > end) return 'invalid';
  return { start, end };
}
