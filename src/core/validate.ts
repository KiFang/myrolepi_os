import { dependencies, parse } from './formula';
import { computeOrder } from './compute';
import type { GameSystem } from './schema';

export interface Issue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

/** Проверка целостности системы: дубли id, битые формулы, неизвестные ссылки, циклы. */
export function validateSystem(sys: GameSystem): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  if (!sys.id) err('id', 'У системы нет id');
  const typeIds = new Set<string>();
  const macroNames = new Set((sys.macros ?? []).map((m) => m.name.toLowerCase()));

  for (const m of sys.macros ?? []) {
    try { parse(m.formula); } catch (e) { err(`macros.${m.name}`, (e as Error).message); }
  }

  sys.entityTypes.forEach((type, ti) => {
    const base = `entityTypes[${ti}:${type.id}]`;
    if (typeIds.has(type.id)) err(base, `Повторяющийся id типа "${type.id}"`);
    typeIds.add(type.id);

    const fieldIds = new Set<string>();
    for (const f of type.fields) {
      if (fieldIds.has(f.id)) err(`${base}.fields.${f.id}`, `Повторяющийся id поля "${f.id}"`);
      fieldIds.add(f.id);
      if (f.type === 'select' && !f.options?.length) warn(`${base}.fields.${f.id}`, 'Поле типа select без вариантов');
    }
    for (const f of type.fields) {
      if (!f.formula) continue;
      try {
        for (const d of dependencies(parse(f.formula))) {
          const root = d.split('.')[0];
          if (!fieldIds.has(root)) err(`${base}.fields.${f.id}`, `Формула ссылается на неизвестное поле "${root}"`);
        }
      } catch (e) { err(`${base}.fields.${f.id}`, (e as Error).message); }
    }
    try { computeOrder(type); } catch (e) { err(base, (e as Error).message); }

    for (const a of type.actions ?? []) {
      try { parse(a.formula); } catch (e) { err(`${base}.actions.${a.id}`, (e as Error).message); }
    }
    for (const v of type.cardViews) {
      for (const b of v.blocks) {
        if (b.field && !fieldIds.has(b.field)) err(`${base}.cardViews.${v.id}.${b.id}`, `Блок ссылается на неизвестное поле "${b.field}"`);
      }
    }
    if (!type.cardViews.length) warn(base, 'У типа нет ни одного вида карточки');
  });

  for (const type of sys.entityTypes) {
    for (const f of type.fields) {
      if (f.type === 'reference' && f.refType && !typeIds.has(f.refType)) err(`entityTypes.${type.id}.fields.${f.id}`, `Неизвестный тип "${f.refType}"`);
    }
    for (const c of type.children ?? []) {
      if (!typeIds.has(c.type)) err(`entityTypes.${type.id}.children`, `Неизвестный тип "${c.type}"`);
    }
  }
  void macroNames;
  return issues;
}
