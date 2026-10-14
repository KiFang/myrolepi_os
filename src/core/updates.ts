import type { LocalizedString } from './i18n';

/**
 * Формат фида обновлений (latest.json) для лаунчера Asteia Alltools.
 * Само приложение обновления НЕ проверяет и НЕ скачивает — это делает только лаунчер.
 * Без лаунчера пользователь вручную берёт нужную версию из GitHub Releases.
 */
export type Platform = 'win' | 'mac' | 'linux';

export interface ReleaseAsset {
  platform: Platform;
  arch: 'x64' | 'arm64';
  url: string;                        // установщик/архив для этой платформы
  sha256?: string;
}

export interface ReleaseInfo {
  version: string;
  date: string;                       // ISO, 2026-10-14
  notes: LocalizedString;             // changelog в Markdown
  assets: ReleaseAsset[];
  minLauncherVersion?: string;
}

export interface UpdateFeed {
  id: string;                         // id модуля, "myrolepi-os"
  latest: string;
  releases: ReleaseInfo[];
}

/** Сравнение версий вида 1.2.3 / 1.2.3-beta.1. Возвращает -1, 0, 1. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => { const [core, pre] = v.replace(/^v/, '').split('-'); return { n: core.split('.').map((x) => parseInt(x, 10) || 0), pre }; };
  const x = split(a), y = split(b);
  for (let i = 0; i < Math.max(x.n.length, y.n.length); i++) {
    const d = (x.n[i] ?? 0) - (y.n[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export function validateFeed(f: unknown): f is UpdateFeed {
  const o = f as UpdateFeed;
  return !!o && typeof o.latest === 'string' && Array.isArray(o.releases) &&
    o.releases.every((r) => typeof r.version === 'string' && Array.isArray(r.assets));
}

export interface UpdateCheck {
  current: string;
  available: ReleaseInfo | null;
  /** нужный файл под текущую платформу (null, если релиз не содержит сборки для неё) */
  asset: ReleaseAsset | null;
  /** все релизы новее текущего — для показа changelog «что нового» */
  newer: ReleaseInfo[];
}

export function checkForUpdate(current: string, feed: UpdateFeed, platform: Platform, arch: 'x64' | 'arm64'): UpdateCheck {
  const newer = feed.releases
    .filter((r) => compareVersions(r.version, current) > 0 && r.assets.some((a) => a.platform === platform && a.arch === arch))
    .sort((a, b) => compareVersions(b.version, a.version));
  const available = newer[0] ?? null;
  return { current, available, asset: available?.assets.find((a) => a.platform === platform && a.arch === arch) ?? null, newer };
}
