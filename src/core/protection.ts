import type { DocMeta, GameSystem, Protection } from './schema';

/**
 * Защита системы от правки: подпись автора (Ed25519). Приложение не позволяет менять подписанную
 * систему и обнаруживает любые правки файла после подписи.
 *
 * Это НЕ защита от копирования: файл лежит на компьютере пользователя, его можно открыть и поправить
 * вручную. Подпись не даёт выдать правку за оригинал и показывает автора и лицензию.
 */

/** Стабильная запись JSON: ключи по алфавиту, undefined пропускается. Одно и то же содержимое — одна строка. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(',')}]`;
  const keys = Object.keys(value as object).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

/**
 * Что именно подписывается: вся система, кроме локального `id` (при импорте он меняется), версии формата
 * `schema` (её повышает миграция) и самой подписи.
 */
export function protectionPayload(system: GameSystem): string {
  const { id: _id, schema: _schema, protection, ...rest } = system;
  void _id; void _schema;
  const { signature: _sig, ...prot } = (protection ?? {}) as Partial<Protection>;
  void _sig;
  return canonicalize({ ...rest, protection: prot });
}

export const isLocked = (s: GameSystem | undefined): boolean => s?.protection?.locked === true;

export type SignFn = (payload: string) => Promise<string>;
export type VerifyFn = (publicKey: string, payload: string, signature: string) => Promise<boolean>;

export interface Author { publicKey: string; keyId: string; name?: string }

export interface ShareOptions { author: string; license: string; allowFork: boolean; note?: string }

/** Подписанная копия системы для передачи другим. Исходная система не меняется. */
export async function protectSystem(system: GameSystem, opts: ShareOptions, author: Author, sign: SignFn, now = new Date()): Promise<GameSystem> {
  const meta: DocMeta = { ...system.meta, author: opts.author, license: opts.license, allowFork: opts.allowFork, ...(opts.note ? { note: opts.note } : {}) };
  const draft: GameSystem = { ...system, meta, protection: { locked: true, publicKey: author.publicKey, keyId: author.keyId, signedAt: now.toISOString(), signature: '' } };
  const signature = await sign(protectionPayload(draft));
  return { ...draft, protection: { ...draft.protection!, signature } };
}

export type ProtectionStatus =
  | { state: 'none' }
  | { state: 'valid'; keyId: string; author?: string; license?: string; allowFork: boolean }
  | { state: 'tampered'; keyId: string; author?: string }
  | { state: 'unverified'; keyId: string; author?: string };

/** Проверяет подпись. `verify` — проверка Ed25519 (в приложении она выполняется в главном процессе). */
export async function verifyProtection(system: GameSystem, verify: VerifyFn | null): Promise<ProtectionStatus> {
  const p = system.protection;
  if (!p) return { state: 'none' };
  if (!verify) return { state: 'unverified', keyId: p.keyId, author: system.meta?.author };
  let ok = false;
  try { ok = p.locked === true && !!p.signature && (await verify(p.publicKey, protectionPayload(system), p.signature)); } catch { ok = false; }
  if (!ok) return { state: 'tampered', keyId: p.keyId, author: system.meta?.author };
  return { state: 'valid', keyId: p.keyId, author: system.meta?.author, license: system.meta?.license, allowFork: system.meta?.allowFork !== false };
}

/** Можно ли сделать правимую копию: если автор разрешил — да; своя система (ваш ключ) — всегда. */
export function canFork(system: GameSystem, status: ProtectionStatus, myKeyId?: string): boolean {
  if (status.state === 'none') return true;
  if (status.state === 'valid') return status.allowFork || status.keyId === myKeyId;
  return status.keyId === myKeyId; // подпись нарушена или не проверена: копию правят только свои
}

/** Правимая копия без защиты; происхождение сохраняется в meta.derivedFrom. */
export function forkSystem(system: GameSystem): GameSystem {
  const { protection, ...rest } = system;
  const from = protection ? { title: typeof system.name === 'string' ? system.name : Object.values(system.name)[0] ?? '', author: system.meta?.author, keyId: protection.keyId } : system.meta?.derivedFrom;
  return { ...rest, meta: { ...system.meta, ...(from ? { derivedFrom: from } : {}), allowFork: undefined, license: system.meta?.license } };
}

/** Короткий отпечаток ключа для показа: «ab12-cd34-ef56-7890». */
export const formatKeyId = (id: string) => id.replace(/(.{4})(?=.)/g, '$1-');
