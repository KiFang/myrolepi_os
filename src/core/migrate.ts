import { SCHEMA_VERSION } from './schema';
import type { Campaign, GameSystem } from './schema';

export { SCHEMA_VERSION as CURRENT_SCHEMA };

/** Состояние документа относительно текущей версии формата. */
export type SchemaState = 'ok' | 'old' | 'newer' | 'invalid';

export function schemaState(doc: unknown): SchemaState {
  const v = (doc as { schema?: unknown } | null)?.schema;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return 'invalid';
  return v === SCHEMA_VERSION ? 'ok' : v < SCHEMA_VERSION ? 'old' : 'newer';
}

/**
 * Миграции формата. Каждая функция переводит документ на одну версию вверх и ничего не удаляет.
 * Перенос картинок из JSON в файлы требует записи на диск, поэтому делается отдельно (renderer/migration.ts).
 */
const steps: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: схема только повышает номер; новые поля (meta, protection) необязательны
  1: (doc) => ({ ...doc, schema: 2 }),
};

function migrate<T>(doc: T): T {
  let cur = doc as unknown as Record<string, unknown>;
  while (typeof cur.schema === 'number' && cur.schema < SCHEMA_VERSION) {
    const step = steps[cur.schema as number];
    if (!step) break;
    cur = step(cur);
  }
  return cur as unknown as T;
}

export const migrateSystem = (doc: GameSystem): GameSystem => migrate(doc);
export const migrateCampaign = (doc: Campaign): Campaign => migrate(doc);
