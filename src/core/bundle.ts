import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { ASSET_ID_RE, collectAssetRefs } from './assetRef';
import type { Campaign, GameSystem } from './schema';

/**
 * Пакет обмена (.rolepi) — обычный ZIP-архив:
 *   manifest.json            описание пакета
 *   system.json              система (если есть)
 *   campaign.json            кампания (если есть)
 *   assets/<имя файла>       картинки, на которые ссылаются документы
 */
export const BUNDLE_FORMAT = 'rolepi-bundle';
export const BUNDLE_VERSION = 1;
export const BUNDLE_EXTENSION = '.rolepi';

export const BUNDLE_LIMITS = {
  maxFiles: 400,
  maxFileBytes: 12 * 1024 * 1024,
  maxTotalBytes: 160 * 1024 * 1024,
  maxJsonBytes: 20 * 1024 * 1024,
} as const;

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  formatVersion: number;
  kind: 'system' | 'campaign';
  app: string;
  createdAt: string;
  title: string;
  /** есть ли в пакете подписанная защищённая система */
  protected?: boolean;
}

export interface BundleContents {
  manifest: BundleManifest;
  system?: GameSystem;
  campaign?: Campaign;
  assets: Record<string, Uint8Array>;
}

export class BundleError extends Error {
  constructor(public code: 'not-zip' | 'bad-manifest' | 'too-big' | 'bad-entry' | 'bad-json' | 'newer-format' | 'empty', message: string) { super(message); }
}

export function makeManifest(kind: 'system' | 'campaign', title: string, app: string, extra: Partial<BundleManifest> = {}): BundleManifest {
  return { format: BUNDLE_FORMAT, formatVersion: BUNDLE_VERSION, kind, app, createdAt: new Date().toISOString(), title, ...extra };
}

export function packBundle(c: BundleContents): Uint8Array {
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(c.manifest, null, 2)) };
  if (c.system) files['system.json'] = strToU8(JSON.stringify(c.system, null, 2));
  if (c.campaign) files['campaign.json'] = strToU8(JSON.stringify(c.campaign, null, 2));
  const wanted = new Set([...(c.system ? collectAssetRefs(c.system) : []), ...(c.campaign ? collectAssetRefs(c.campaign) : [])]);
  for (const id of wanted) {
    const bytes = c.assets[id];
    if (bytes) files[`assets/${id}`] = bytes; // картинки уже сжаты — архивируем без повторного сжатия
  }
  return zipSync(files, { level: 6 });
}

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;
export const looksLikeBundle = isZip;

/**
 * Читает и проверяет пакет. Защита от «бомб» и подделок: ограничения на число и размер файлов
 * (проверяются до распаковки), допускаются только известные имена, картинки — только с именами-хешами.
 */
export function unpackBundle(bytes: Uint8Array): BundleContents {
  if (!isZip(bytes)) throw new BundleError('not-zip', 'Это не пакет Rolepi');
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(f) {
        if (++count > BUNDLE_LIMITS.maxFiles) throw new BundleError('too-big', 'В пакете слишком много файлов');
        if (f.originalSize > BUNDLE_LIMITS.maxFileBytes) throw new BundleError('too-big', 'В пакете слишком большой файл');
        total += f.originalSize;
        if (total > BUNDLE_LIMITS.maxTotalBytes) throw new BundleError('too-big', 'Пакет слишком велик');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof BundleError) throw e;
    throw new BundleError('not-zip', 'Файл повреждён и не читается как архив');
  }
  const json = (name: string): unknown => {
    const raw = files[name];
    if (!raw) return undefined;
    if (raw.length > BUNDLE_LIMITS.maxJsonBytes) throw new BundleError('too-big', `Файл ${name} слишком большой`);
    try { return JSON.parse(strFromU8(raw)); } catch { throw new BundleError('bad-json', `Файл ${name} повреждён`); }
  };
  const manifest = json('manifest.json') as Partial<BundleManifest> | undefined;
  if (!manifest || manifest.format !== BUNDLE_FORMAT || typeof manifest.kind !== 'string' || !['system', 'campaign'].includes(manifest.kind)) throw new BundleError('bad-manifest', 'В пакете нет описания Rolepi');
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > BUNDLE_VERSION) throw new BundleError('newer-format', 'Пакет создан более новой версией Rolepi');
  const assets: Record<string, Uint8Array> = {};
  for (const name of Object.keys(files)) {
    if (name === 'manifest.json' || name === 'system.json' || name === 'campaign.json' || name.endsWith('/')) continue;
    const m = /^assets\/([^/]+)$/.exec(name);
    if (!m || !ASSET_ID_RE.test(m[1])) throw new BundleError('bad-entry', `Недопустимый файл в пакете: ${name.slice(0, 60)}`);
    assets[m[1]] = files[name];
  }
  const system = json('system.json') as GameSystem | undefined;
  const campaign = json('campaign.json') as Campaign | undefined;
  if (!system && !campaign) throw new BundleError('empty', 'В пакете нет ни системы, ни кампании');
  return { manifest: manifest as BundleManifest, system, campaign, assets };
}
