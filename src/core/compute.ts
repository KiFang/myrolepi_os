import { FormulaError, Scope, Value, dependencies, evaluate, parse, EvalOptions } from './formula';
import type { EntityType, GameSystem } from './schema';
import { DiceRoll } from './dice';

export interface ComputeResult {
  values: Record<string, unknown>;
  rolls: DiceRoll[];
  errors: Record<string, string>;
}

/** Порядок вычисления вычисляемых полей (топологическая сортировка). Бросает ошибку при циклах. */
export function computeOrder(type: EntityType): string[] {
  const computed = type.fields.filter((f) => f.formula);
  const ids = new Set(computed.map((f) => f.id));
  const deps = new Map<string, string[]>();
  for (const f of computed) {
    let used: string[] = [];
    try { used = dependencies(parse(f.formula!)); } catch { /* синтаксис проверяет validateSystem */ }
    deps.set(f.id, used.map((d) => d.split('.')[0]).filter((d) => ids.has(d)));
  }
  const order: string[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new FormulaError(`Циклическая зависимость полей: ${[...path, id].join(' → ')}`);
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) visit(d, [...path, id]);
    state.set(id, 2);
    order.push(id);
  };
  computed.forEach((f) => visit(f.id, []));
  return order;
}

/** Макросы системы превращаются в функции формул. */
export function systemFunctions(system?: GameSystem): EvalOptions['functions'] {
  const fns: NonNullable<EvalOptions['functions']> = {};
  for (const m of system?.macros ?? []) {
    const ast = parse(m.formula);
    fns[m.name.toLowerCase()] = (args, ctx) => {
      const scope: Scope = { ...ctx.scope };
      m.params.forEach((p, i) => { scope[p] = (args[i] ?? null) as Value; });
      const r = evaluate(ast, { scope, rng: ctx.rng, functions: ctx.functions });
      ctx.rolls.push(...r.rolls);
      return r.value;
    };
  }
  return fns;
}

/**
 * Вычисляет значения сущности: берёт введённые значения (или default), затем по порядку
 * считает поля с formula. Ошибка одной формулы не ломает остальные.
 */
export function computeEntity(
  type: EntityType,
  input: Record<string, unknown>,
  opts: EvalOptions & { system?: GameSystem } = {},
): ComputeResult {
  const values: Record<string, unknown> = {};
  for (const f of type.fields) {
    if (!f.formula) values[f.id] = input[f.id] ?? f.default ?? (f.type === 'number' ? 0 : f.type === 'boolean' ? false : f.type === 'list' ? [] : '');
  }
  const errors: Record<string, string> = {};
  const rolls: DiceRoll[] = [];
  const functions = { ...systemFunctions(opts.system), ...opts.functions };
  for (const id of computeOrder(type)) {
    const f = type.fields.find((x) => x.id === id)!;
    try {
      const r = evaluate(f.formula!, { ...opts, functions, scope: { ...(opts.scope ?? {}), ...(values as Scope) } });
      values[id] = r.value;
      rolls.push(...r.rolls);
    } catch (e) {
      errors[id] = (e as Error).message;
      values[id] = null;
    }
  }
  return { values, rolls, errors };
}
