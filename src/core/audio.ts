/**
 * Звуки и музыка лежат в папках приложения (music/ и sounds/); документы хранят только ссылки вида
 * "music/боевая/битва.mp3". Общий код для приложения и главного процесса.
 */
export const AUDIO_KINDS = ['music', 'sounds'] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];

/** Форматы, которые умеет воспроизводить встроенный плеер (Chromium). */
export const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm'] as const;

export const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm',
};

export const extensionOf = (name: string): string => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); };
export const isAudioFile = (name: string): boolean => (AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(name));

export interface AudioFile {
  /** ссылка для документов: "music/<путь>" */
  ref: string;
  kind: AudioKind;
  /** путь внутри папки, всегда с "/" */
  path: string;
  /** имя без расширения — для показа */
  title: string;
  /** подпапка (для группировки), пусто для файлов в корне */
  folder: string;
  size: number;
}

/** Путь внутри папки звука допустим: без "..", без начального "/" и "\", без скрытых частей. */
export function safeAudioPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path || path.length > 400 || path.includes('\0') || path.includes('\\') || path.startsWith('/')) return false;
  const parts = path.split('/');
  return parts.every((p) => p !== '' && p !== '.' && p !== '..' && !p.startsWith('.')) && isAudioFile(parts[parts.length - 1]);
}

export function audioRef(kind: AudioKind, path: string): string { return `${kind}/${path}`; }

/** Разбирает ссылку "music/<путь>"; null, если ссылка неверна. */
export function parseAudioRef(ref: unknown): { kind: AudioKind; path: string } | null {
  if (typeof ref !== 'string') return null;
  const i = ref.indexOf('/');
  if (i < 0) return null;
  const kind = ref.slice(0, i);
  const path = ref.slice(i + 1);
  return (AUDIO_KINDS as readonly string[]).includes(kind) && safeAudioPath(path) ? { kind: kind as AudioKind, path } : null;
}

export function describeAudio(kind: AudioKind, path: string, size: number): AudioFile {
  const slash = path.lastIndexOf('/');
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return { ref: audioRef(kind, path), kind, path, title: dot > 0 ? file.slice(0, dot) : file, folder: slash < 0 ? '' : path.slice(0, slash), size };
}

/** Порядок в списке: по папке, затем по названию (с учётом чисел: «2» раньше «10»). */
export const compareAudio = (a: AudioFile, b: AudioFile): number =>
  a.folder.localeCompare(b.folder, undefined, { numeric: true, sensitivity: 'base' }) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

export type LoopMode = 'off' | 'all' | 'one';

/** Какой трек следующим. null — очередь закончилась. */
export function nextTrack(index: number, length: number, loop: LoopMode, shuffle: boolean, rnd: () => number = Math.random): number | null {
  if (length <= 0) return null;
  if (loop === 'one') return index;
  if (shuffle) {
    if (length === 1) return loop === 'all' ? 0 : null;
    let n = Math.floor(rnd() * (length - 1));
    if (n >= index) n++; // любой, кроме текущего
    return n;
  }
  if (index + 1 < length) return index + 1;
  return loop === 'all' ? 0 : null;
}
export const prevTrack = (index: number, length: number): number | null => (length <= 0 ? null : index > 0 ? index - 1 : length - 1);
