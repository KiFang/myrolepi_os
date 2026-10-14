import { migrateCampaign, migrateSystem } from "../core";
import type { Campaign, GameSystem } from "../core";

const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,/;

export function dataUrlToBytes(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Заменяет встроенные в JSON картинки (data:…) ссылками на файлы проекта. put возвращает ссылку или null. */
export async function externalizeImages<T>(doc: T, put: (bytes: Uint8Array) => Promise<string | null>): Promise<{ doc: T; changed: boolean }> {
  let changed = false;
  const cache = new Map<string, Promise<string | null>>(); // запросы кэшируем, чтобы одинаковая картинка сохранялась один раз даже при параллельной обработке
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === "string") {
      if (!IMAGE_DATA_URL.test(v)) return v;
      if (!cache.has(v)) cache.set(v, put(dataUrlToBytes(v)));
      const ref = await cache.get(v);
      if (ref) { changed = true; return ref; }
      return v; // не удалось сохранить — оставляем как было, ничего не теряем
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === "object") {
      const entries = await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await walk(x)] as const));
      return Object.fromEntries(entries);
    }
    return v;
  };
  return { doc: (await walk(doc)) as T, changed };
}

/** Переводит документы на текущую версию формата и выносит картинки в файлы. Исходные объекты не меняются. */
export async function migrateProject(systems: GameSystem[], campaigns: Campaign[], put: (bytes: Uint8Array) => Promise<string | null>) {
  const outSystems: GameSystem[] = [];
  const outCampaigns: Campaign[] = [];
  for (const s of systems) outSystems.push((await externalizeImages(migrateSystem(s), put)).doc);
  for (const c of campaigns) outCampaigns.push((await externalizeImages(migrateCampaign(c), put)).doc);
  return { systems: outSystems, campaigns: outCampaigns };
}
