import { SCHEMA_VERSION, computeEntity, loc, migrateSystem, renameVariable, schemaState, t, validateSystem } from "../core";
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
    label: both("ws.defaultTypeName"),
    category: "character",
    fields: [],
    cardViews: [{ id: "default", name: both("ws.defaultSheet"), blocks: [] }],
  };
}
export function newSystem(): GameSystem {
  return { schema: SCHEMA_VERSION, id: newId("system"), name: both("ws.defaultSystemName"), version: "0.1.0", entityTypes: [newType()] };
}
export function newField(): FieldDef {
  return { id: newId("field"), label: both("ws.defaultFieldName"), type: "number", default: 0 };
}
export function copyOf(template: GameSystem): GameSystem {
  const name = template.name;
  const suffix = both("ws.copySuffix");
  return {
    ...migrateSystem(structuredClone(template)),
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

/** true, если среди документов есть созданный более новой версией Rolepi (его нельзя ни читать, ни перезаписывать). */
export function libraryNewer(systems: unknown[], campaigns: unknown[]): boolean {
  return [...systems, ...campaigns].some((d) => schemaState(d) === "newer");
}

/** true, если есть документы старого формата, которые нужно перенести. */
export function libraryOld(systems: unknown[], campaigns: unknown[]): boolean {
  return [...systems, ...campaigns].some((d) => schemaState(d) === "old");
}

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
    isObj(s) && schemaState(s) !== 'invalid' && !!s.id &&
    (s.macros === undefined || arrayOf(s.macros, (m) => isObj(m) && typeof m.name === "string" && Array.isArray(m.params))) &&
    arrayOf(s.entityTypes, okType);
  const okCampaign = (c: any) =>
    isObj(c) && schemaState(c) !== 'invalid' && !!c.id &&
    arrayOf(c.entities, (e) => isObj(e) && typeof e.id === "string" && isObj(e.values)) &&
    arrayOf(c.notes, (n) => isObj(n) && typeof n.id === "string" && typeof n.title === "string" && typeof n.body === "string") &&
    (c.scenes === undefined || arrayOf(c.scenes, (x) => isObj(x) && typeof x.id === "string" && typeof x.title === "string" && Array.isArray(x.entityIds))) &&
    (c.maps === undefined || arrayOf(c.maps, (m) => isObj(m) && typeof m.id === "string" && typeof m.name === "string" && typeof m.image === "string" && arrayOf(m.markers, (k) => isObj(k) && typeof k.id === "string" && typeof k.x === "number" && typeof k.y === "number")));
  return !systems.every(okSystem) || !campaigns.every(okCampaign);
}

const VALID_ID = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Почему новое имя в формулах нельзя принять (или пустая строка, если можно). */
export function fieldIdProblem(type: EntityType, current: string, next: string, lang = "ru"): string {
  if (next === current) return "";
  if (!VALID_ID.test(next)) return t("ws.invalidId", lang);
  if (type.fields.some((f) => f.id === next)) return t("ws.idTaken", lang, { id: next });
  return "";
}

/** Переименовывает параметр и все ссылки на него внутри системы: формулы, действия, инициатива, блоки карточек. */
export function renameFieldInSystem(system: GameSystem, typeId: string, from: string, to: string): GameSystem {
  const fx = (f?: string) => (f ? renameVariable(f, from, to) : f);
  const swap = (id?: string) => (id === from ? to : id);
  return {
    ...system,
    entityTypes: system.entityTypes.map((type) => {
      if (type.id !== typeId) return type;
      return {
        ...type,
        initiative: fx(type.initiative),
        fields: type.fields.map((f) => ({ ...f, id: swap(f.id) as string, formula: fx(f.formula) })),
        actions: type.actions?.map((a) => ({
          ...a,
          formula: fx(a.formula) as string,
          effects: a.effects?.map((e) => ({ ...e, field: swap(e.field) as string, formula: fx(e.formula) as string })),
        })),
        cardViews: type.cardViews.map((v) => ({
          ...v,
          blocks: v.blocks.map((b) => ({
            ...b,
            field: swap(b.field),
            props: b.props && typeof b.props.maxField === "string" ? { ...b.props, maxField: swap(b.props.maxField as string) } : b.props,
          })),
        })),
      };
    }),
  };
}

/** Переносит значения героев этого типа на новое имя параметра. */
export function renameFieldInCampaign(campaign: Campaign, typeId: string, from: string, to: string): Campaign {
  return {
    ...campaign,
    entities: campaign.entities.map((e) => {
      if (e.typeId !== typeId || !(from in e.values)) return e;
      const { [from]: moved, ...rest } = e.values;
      return { ...e, values: { ...rest, [to]: moved } };
    }),
  };
}
