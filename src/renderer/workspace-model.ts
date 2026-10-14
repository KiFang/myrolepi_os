import { computeEntity, loc, validateSystem } from "../core";
import type { Campaign, EntityType, FieldDef, GameSystem } from "../core";
import type { PluginRegistry } from "./plugin-host";

export interface Project {
  systems: GameSystem[];
  campaigns: Campaign[];
}
export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
export const label = (value: Parameters<typeof loc>[0]) => loc(value, "ru");
export function rename(value: Parameters<typeof loc>[0], text: string) {
  return typeof value === "object" ? { ...value, ru: text } : text;
}
export function newType(): EntityType {
  return {
    id: newId("type"),
    label: "Персонаж",
    category: "character",
    fields: [],
    cardViews: [{ id: "default", name: "Основной лист", blocks: [] }],
  };
}
export function newSystem(): GameSystem {
  return {
    schema: 1,
    id: newId("system"),
    name: "Новая система",
    version: "0.1.0",
    entityTypes: [newType()],
  };
}
export function newField(): FieldDef {
  return {
    id: newId("field"),
    label: "Новое поле",
    type: "number",
    default: 0,
  };
}
export function preview(
  type: EntityType,
  input: Record<string, unknown>,
  system: GameSystem,
  registry: PluginRegistry,
) {
  try {
    return computeEntity(type, input, {
      system,
      functions: registry.functions,
      rng: () => 0.5,
    });
  } catch (e) {
    return { values: {}, rolls: [], errors: { system: (e as Error).message } };
  }
}
export function systemIssues(system: GameSystem) {
  const issues = validateSystem(system);
  const validId = /^[\p{L}_][\p{L}\p{N}_]*$/u;
  for (const type of system.entityTypes) {
    if (!type.id)
      issues.push({
        level: "error",
        path: "Тип сущности",
        message: "У типа нет идентификатора",
      });
    for (const field of type.fields) {
      if (!validId.test(field.id))
        issues.push({
          level: "error",
          path: field.id || "Поле",
          message:
            "ID поля должен начинаться с буквы или _, содержать буквы, цифры и _",
        });
      if (
        field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max
      )
        issues.push({
          level: "error",
          path: field.id,
          message: "Минимум больше максимума",
        });
    }
  }
  return issues;
}
/** Preserve historical values on schema edits; new fields take defaults. */
export function createEntity(type: EntityType) {
  return {
    id: newId("entity"),
    typeId: type.id,
    name: `Новый ${label(type.label).toLowerCase()}`,
    values: {},
  };
}
