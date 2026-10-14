/** Ссылки на файлы проекта в документах: "asset:<sha256>.<расширение>". Общий код для приложения и главного процесса. */
export const ASSET_ID_RE = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
export const ASSET_REF_RE = /asset:([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g;

export const isAssetRef = (v: unknown): v is string => typeof v === 'string' && /^asset:[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(v);

/** Все файлы, на которые ссылается значение (документ целиком). */
export function collectAssetRefs(value: unknown): string[] {
  return [...new Set([...JSON.stringify(value ?? null).matchAll(ASSET_REF_RE)].map((m) => m[1]))];
}

/** Заменяет ссылки по таблице {старое имя → новое имя}; всё остальное не меняется. */
export function remapAssetRefs<T>(value: T, map: Record<string, string>): T {
  if (!Object.keys(map).length) return value;
  return JSON.parse(JSON.stringify(value ?? null).replace(ASSET_REF_RE, (m, id: string) => `asset:${map[id] ?? id}`));
}
