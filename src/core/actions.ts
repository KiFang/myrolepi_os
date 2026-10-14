import { DiceRoll } from './dice';
import { computeEntity, systemFunctions } from './compute';
import { EvalOptions, Scope, Value, evaluate } from './formula';
import type { ActionDef, EntityType, GameSystem } from './schema';

export interface ActionEffect {
  field: string;
  from: unknown;
  to: unknown;
}
export interface ActionResult {
  value: Value;
  rolls: DiceRoll[];
  effects: ActionEffect[];
}

type RunOptions = EvalOptions & { system?: GameSystem };

/** Числовая часть значения поля: число как есть, у ресурса {current, max} — current. */
function numericOf(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof (v as { current?: unknown }).current === 'number') return (v as { current: number }).current;
  return Number(v) || 0;
}
function withNumeric(prev: unknown, n: number): unknown {
  return prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...(prev as object), current: n } : n;
}

/**
 * Выполняет действие сущности: считает формулу по её значениям и введённым параметрам.
 * Эффекты (изменение полей) только вычисляются — применяет их вызывающий код.
 */
export function runAction(
  type: EntityType,
  action: ActionDef,
  entityValues: Record<string, unknown>,
  inputs: Record<string, unknown> = {},
  opts: RunOptions = {},
): ActionResult {
  const functions = { ...systemFunctions(opts.system), ...opts.functions };
  const computed = computeEntity(type, entityValues, { ...opts, functions }).values;
  const inputScope: Record<string, unknown> = {};
  for (const i of action.inputs ?? []) inputScope[i.id] = inputs[i.id] ?? i.default ?? (i.type === 'number' ? 0 : i.type === 'boolean' ? false : '');
  const scope = { ...computed, ...inputScope } as Scope;
  const main = evaluate(action.formula, { ...opts, functions, scope });
  const rolls = [...main.rolls];
  const effects: ActionEffect[] = [];
  for (const e of action.effects ?? []) {
    const r = evaluate(e.formula, { ...opts, functions, scope: { ...scope, result: main.value } as Scope });
    rolls.push(...r.rolls);
    const prev = entityValues[e.field] ?? computed[e.field];
    const amount = Number(r.value);
    const next = e.op === 'add' ? withNumeric(prev, numericOf(prev) + amount) : (typeof prev === 'object' && prev && typeof r.value === 'number' ? withNumeric(prev, r.value) : r.value);
    effects.push({ field: e.field, from: prev, to: next });
  }
  return { value: main.value, rolls, effects };
}

/** Бросок инициативы по формуле типа (по умолчанию 1d20). */
export function rollInitiative(type: EntityType | undefined, entityValues: Record<string, unknown>, opts: RunOptions = {}): number {
  const formula = type?.initiative?.trim() || '1d20';
  const functions = { ...systemFunctions(opts.system), ...opts.functions };
  const computed = type ? computeEntity(type, entityValues, { ...opts, functions }).values : {};
  const r = evaluate(formula, { ...opts, functions, scope: computed as Scope });
  return Number(r.value) || 0;
}

/** Порядок хода: по убыванию инициативы, при равенстве — в порядке добавления. */
export function turnOrder<T extends { initiative: number }>(combatants: T[]): T[] {
  return combatants.map((c, i) => ({ c, i })).sort((a, b) => b.c.initiative - a.c.initiative || a.i - b.i).map((x) => x.c);
}

/**
 * Прибавляет число к значению параметра. У ресурса {current, max} меняется current (от 0 до max);
 * у обычного числа границы задаёт `limits` (по умолчанию ниже нуля не уходит только ресурс).
 */
export function adjustResource(prev: unknown, delta: number, limits: { min?: number; max?: number } = {}): unknown {
  const base = numericOf(prev) + delta;
  if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
    const max = (prev as { max?: number }).max;
    return { ...(prev as object), current: Math.max(limits.min ?? 0, max !== undefined ? Math.min(max, base) : base) };
  }
  let n = base;
  if (limits.min !== undefined) n = Math.max(limits.min, n);
  if (limits.max !== undefined) n = Math.min(limits.max, n);
  return n;
}
