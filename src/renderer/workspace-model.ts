import { computeEntity, loc, t, validateSystem } from "../core";
import type { Campaign, Entity, EntityType, FieldDef, GameSystem, LocalizedString } from "../core";
import type { PluginRegistry } from "./plugin-host";
import "./strings";

export interface Project {
  systems: GameSystem[];
  campaigns: Campaign[];
}
export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

/** Название на выбранном языке (с откатом на другие). */
export const label = (value: LocalizedString | undefined, lang = "ru") => loc(value, lang);

/** Новое значение названия: переводы на других языках сохраняются, обычная строка остаётся строкой. */
export function rename(value: LocalizedString | undefined, text: string, lang = "ru"): LocalizedString {
  return value && typeof value === "object" ? { ...value, [lang]: text } : text;
}

/** Двуязычная строка по ключу словаря — для названий, которые создаёт сама программа. */
export const both = (key: string): Record<string, string> => ({ ru: t(key, "ru"), en: t(key, "en") });

export function newType(): EntityType {
  return {
    id: newId("type"),
    label: both("ws.newType"),
    category: "character",
    fields: [],
    cardViews: [{ id: "default", name: both("ws.defaultSheet"), blocks: [] }],
  };
}
export function newSystem(): GameSystem {
  return { schema: 1, id: newId("system"), name: both("ws.newSystem"), version: "0.1.0", entityTypes: [newType()] };
}
export function newField(): FieldDef {
  return { id: newId("field"), label: both("ws.newField"), type: "number", default: 0 };
}
export function copyOf(template: GameSystem): GameSystem {
  const name = template.name;
  const suffix = both("ws.copySuffix");
  return {
    ...structuredClone(template),
    id: newId("system"),
    name: typeof name === "object"
      ? Object.fromEntries(Object.entries(name).map(([l, v]) => [l, `${v} — ${suffix[l] ?? suffix.en}`]))
      : `${name} — ${suffix.en}`,
  };
}
export function createEntity(type: EntityType, lang = "ru", number = 1): Entity {
  return { id: newId("entity"), typeId: type.id, name: `${label(type.label, lang)} ${number}`, values: {} };
}

export function preview(type: EntityType, input: Record<string, unknown>, system: GameSystem, registry: PluginRegistry) {
  try {
    // RNG зафиксирован, чтобы предпросмотр не «мигал» от броска к броску
    return computeEntity(type, input, { system, functions: registry.functions, rng: () => 0.5 });
  } catch (e) {
    return { values: {}, rolls: [], errors: { system: (e as Error).message } };
  }
}

export interface RuleIssue { level: "error" | "warning"; path: string; message: string }

/** Проверка ядра плюс правила редактора. Тексты редактора локализованы. */
export function systemIssues(system: GameSystem, lang = "ru"): RuleIssue[] {
  const issues: RuleIssue[] = validateSystem(system);
  const validId = /^[\p{L}_][\p{L}\p{N}_]*$/u;
  for (const type of system.entityTypes) {
    if (!type.id) issues.push({ level: "error", path: "type", message: t("ws.invalidType", lang) });
    for (const field of type.fields) {
      if (!validId.test(field.id))
        issues.push({ level: "error", path: field.id || "field", message: t("ws.invalidId", lang) });
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        issues.push({ level: "error", path: field.id, message: t("ws.minMax", lang) });
    }
  }
  return issues;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const arrayOf = (v: unknown, ok: (x: any) => boolean) => Array.isArray(v) && v.every(ok);

/**
 * true, если сохранённые файлы повреждены или другого формата: тогда библиотека
 * открывается только для чтения и ничего не перезаписывает.
 */
export function libraryProblem(systems: unknown[], campaigns: unknown[]): boolean {
  const okType = (t: any) =>
    isObj(t) &&
    arrayOf(t.fields, (f) => isObj(f) && typeof f.id === "string") &&
    arrayOf(t.cardViews, (v) => isObj(v) && arrayOf(v.blocks, isObj)) &&
    (t.actions === undefined || arrayOf(t.actions, isObj)) &&
    (t.children === undefined || arrayOf(t.children, isObj));
  const okSystem = (s: any) =>
    isObj(s) && s.schema === 1 && !!s.id &&
    (s.macros === undefined || arrayOf(s.macros, (m) => isObj(m) && typeof m.name === "string" && Array.isArray(m.params))) &&
    arrayOf(s.entityTypes, okType);
  const okCampaign = (c: any) =>
    isObj(c) && c.schema === 1 && !!c.id &&
    arrayOf(c.entities, (e) => isObj(e) && typeof e.id === "string" && isObj(e.values)) &&
    arrayOf(c.notes, (n) => isObj(n) && typeof n.id === "string" && typeof n.title === "string" && typeof n.body === "string");
  return !systems.every(okSystem) || !campaigns.every(okCampaign);
}
