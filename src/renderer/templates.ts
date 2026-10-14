import type { ActionDef, CardBlock, CardView, EntityCategory, EntityType, FieldDef } from "../core";
import { newId } from "./workspace-model";

/**
 * Готовые параметры и шаблоны типов: чтобы не собирать «с нуля» привычные вещи (характеристики, здоровье, броню).
 * Всё двуязычное. Параметры — обычные FieldDef, после добавления их можно менять как любые другие.
 */
type L = { ru: string; en: string };
const l = (ru: string, en: string): L => ({ ru, en });

export type PresetGroup = "basic" | "stats" | "combat" | "resources" | "story" | "ship" | "world";
export const PRESET_GROUPS: { id: PresetGroup; label: L }[] = [
  { id: "basic", label: l("Основное", "Basics") },
  { id: "stats", label: l("Характеристики", "Ability scores") },
  { id: "combat", label: l("Бой", "Combat") },
  { id: "resources", label: l("Ресурсы", "Resources") },
  { id: "story", label: l("История и описание", "Story and description") },
  { id: "ship", label: l("Корабли и техника", "Ships and machines") },
  { id: "world", label: l("Мир и поселения", "World and settlements") },
];

export interface FieldPreset {
  key: string;
  group: PresetGroup;
  label: L;
  /** что добавится (один параметр или несколько связанных) */
  fields: FieldDef[];
  /** для ресурсов: параметр-максимум, чтобы на карточке рисовалась полоска */
  bars?: Record<string, string>;
}

const num = (id: string, ru: string, en: string, def: number, extra: Partial<FieldDef> = {}): FieldDef => ({ id, label: l(ru, en), type: "number", default: def, ...extra });
const text = (id: string, ru: string, en: string, extra: Partial<FieldDef> = {}): FieldDef => ({ id, label: l(ru, en), type: "text", default: "", ...extra });
const long = (id: string, ru: string, en: string): FieldDef => ({ id, label: l(ru, en), type: "longtext", default: "" });
const resource = (id: string, ru: string, en: string, def: number): FieldDef => ({ id, label: l(ru, en), type: "resource", default: def });
const stat = (id: string, ru: string, en: string): FieldDef => num(id, ru, en, 10, { group: "stats" });
const mod = (of: string, ru: string, en: string): FieldDef => ({ id: `${of}_mod`, label: l(`Мод. ${ru.toLowerCase()}`, `${en} mod`), type: "number", formula: `floor((${of} - 10) / 2)` });

const SIX = [
  stat("str", "Сила", "Strength"), stat("dex", "Ловкость", "Dexterity"), stat("con", "Телосложение", "Constitution"),
  stat("int", "Интеллект", "Intelligence"), stat("wis", "Мудрость", "Wisdom"), stat("cha", "Харизма", "Charisma"),
];
const SIX_MODS = [mod("str", "Сила", "Strength"), mod("dex", "Ловкость", "Dexterity"), mod("con", "Телосложение", "Constitution"), mod("int", "Интеллект", "Intelligence"), mod("wis", "Мудрость", "Wisdom"), mod("cha", "Харизма", "Charisma")];

export const FIELD_PRESETS: FieldPreset[] = [
  { key: "level", group: "basic", label: l("Уровень", "Level"), fields: [num("level", "Уровень", "Level", 1, { min: 1 })] },
  { key: "xp", group: "basic", label: l("Опыт", "Experience"), fields: [num("xp", "Опыт", "Experience", 0, { min: 0 })] },
  { key: "class", group: "basic", label: l("Класс или профессия", "Class or profession"), fields: [text("class", "Класс", "Class")] },
  { key: "race", group: "basic", label: l("Раса или происхождение", "Race or origin"), fields: [text("race", "Раса", "Race")] },
  { key: "age", group: "basic", label: l("Возраст", "Age"), fields: [num("age", "Возраст", "Age", 25, { min: 0 })] },
  { key: "portrait", group: "basic", label: l("Портрет (картинка)", "Portrait (picture)"), fields: [{ id: "portrait", label: l("Портрет", "Portrait"), type: "image", default: "" }] },

  { key: "six", group: "stats", label: l("Шесть характеристик + модификаторы", "Six ability scores + modifiers"), fields: [...SIX, ...SIX_MODS] },
  ...SIX.map((f): FieldPreset => ({ key: f.id, group: "stats", label: f.label as L, fields: [f] })),
  { key: "skill", group: "stats", label: l("Навык (число)", "Skill (number)"), fields: [num("skill", "Навык", "Skill", 0, { group: "skills" })] },

  { key: "hp", group: "combat", label: l("Здоровье с максимумом", "Health with maximum"), fields: [num("max_hp", "Макс. здоровье", "Max health", 10, { min: 1 }), resource("hp", "Здоровье", "Health", 10)], bars: { hp: "max_hp" } },
  { key: "armor", group: "combat", label: l("Броня", "Armor"), fields: [num("armor", "Броня", "Armor", 10, { min: 0 })] },
  { key: "speed", group: "combat", label: l("Скорость", "Speed"), fields: [num("speed", "Скорость", "Speed", 30, { min: 0 })] },
  { key: "attack", group: "combat", label: l("Бонус атаки", "Attack bonus"), fields: [num("attack", "Бонус атаки", "Attack bonus", 0)] },
  { key: "damage", group: "combat", label: l("Урон (текстом, например 1d6+2)", "Damage (as text, e.g. 1d6+2)"), fields: [text("damage", "Урон", "Damage", { default: "1d6" })] },
  { key: "initiative", group: "combat", label: l("Бонус инициативы", "Initiative bonus"), fields: [num("initiative_bonus", "Бонус инициативы", "Initiative bonus", 0)] },
  { key: "danger", group: "combat", label: l("Опасность", "Challenge"), fields: [num("challenge", "Опасность", "Challenge", 1, { min: 0 })] },

  { key: "mana", group: "resources", label: l("Мана с максимумом", "Mana with maximum"), fields: [num("max_mana", "Макс. мана", "Max mana", 10, { min: 0 }), resource("mana", "Мана", "Mana", 10)], bars: { mana: "max_mana" } },
  { key: "stamina", group: "resources", label: l("Выносливость с максимумом", "Stamina with maximum"), fields: [num("max_stamina", "Макс. выносливость", "Max stamina", 10, { min: 0 }), resource("stamina", "Выносливость", "Stamina", 10)], bars: { stamina: "max_stamina" } },
  { key: "gold", group: "resources", label: l("Деньги", "Money"), fields: [num("gold", "Деньги", "Money", 0, { min: 0 })] },
  { key: "inventory", group: "resources", label: l("Снаряжение (текст)", "Equipment (text)"), fields: [long("inventory", "Снаряжение", "Equipment")] },

  { key: "description", group: "story", label: l("Описание", "Description"), fields: [long("description", "Описание", "Description")] },
  { key: "background", group: "story", label: l("Предыстория", "Background"), fields: [long("background", "Предыстория", "Background")] },
  { key: "goals", group: "story", label: l("Цели", "Goals"), fields: [long("goals", "Цели", "Goals")] },
  { key: "behavior", group: "story", label: l("Повадки", "Behavior"), fields: [long("behavior", "Повадки", "Behavior")] },
  { key: "loot", group: "story", label: l("Добыча", "Loot"), fields: [text("loot", "Добыча", "Loot")] },
  { key: "gm_notes", group: "story", label: l("Заметки мастера", "GM notes"), fields: [long("gm_notes", "Заметки мастера", "GM notes")] },

  { key: "hull", group: "ship", label: l("Корпус с максимумом", "Hull with maximum"), fields: [num("max_hull", "Макс. корпус", "Max hull", 50, { min: 1 }), resource("hull", "Корпус", "Hull", 50)], bars: { hull: "max_hull" } },
  { key: "shields", group: "ship", label: l("Щиты с максимумом", "Shields with maximum"), fields: [num("max_shields", "Макс. щиты", "Max shields", 20, { min: 0 }), resource("shields", "Щиты", "Shields", 20)], bars: { shields: "max_shields" } },
  { key: "crew", group: "ship", label: l("Экипаж", "Crew"), fields: [num("crew", "Экипаж", "Crew", 4, { min: 0 })] },
  { key: "fuel", group: "ship", label: l("Топливо с максимумом", "Fuel with maximum"), fields: [num("max_fuel", "Макс. топливо", "Max fuel", 100, { min: 0 }), resource("fuel", "Топливо", "Fuel", 100)], bars: { fuel: "max_fuel" } },
  { key: "cargo", group: "ship", label: l("Грузовой отсек", "Cargo hold"), fields: [num("cargo", "Груз", "Cargo", 0, { min: 0 })] },

  { key: "population", group: "world", label: l("Население", "Population"), fields: [num("population", "Население", "Population", 1000, { min: 0 })] },
  { key: "wealth", group: "world", label: l("Богатство", "Wealth"), fields: [num("wealth", "Богатство", "Wealth", 0)] },
  { key: "defense", group: "world", label: l("Защита", "Defense"), fields: [num("defense", "Защита", "Defense", 10, { min: 0 })] },
  { key: "influence", group: "world", label: l("Влияние", "Influence"), fields: [num("influence", "Влияние", "Influence", 0)] },
  { key: "attitude", group: "world", label: l("Отношение (союзник / нейтрал / враг)", "Attitude (ally / neutral / enemy)"), fields: [{ id: "attitude", label: l("Отношение", "Attitude"), type: "select", default: "neutral", options: [{ value: "ally", label: l("Союзник", "Ally") }, { value: "neutral", label: l("Нейтрал", "Neutral") }, { value: "enemy", label: l("Враг", "Enemy") }] }] },
  { key: "rarity", group: "world", label: l("Редкость", "Rarity"), fields: [{ id: "rarity", label: l("Редкость", "Rarity"), type: "select", default: "common", options: [{ value: "common", label: l("Обычный", "Common") }, { value: "rare", label: l("Редкий", "Rare") }, { value: "epic", label: l("Эпический", "Epic") }, { value: "legendary", label: l("Легендарный", "Legendary") }] }] },
  { key: "weight", group: "world", label: l("Вес", "Weight"), fields: [num("weight", "Вес", "Weight", 1, { min: 0 })] },
  { key: "cost", group: "world", label: l("Цена", "Cost"), fields: [num("cost", "Цена", "Cost", 0, { min: 0 })] },
];

const byKey = (key: string) => FIELD_PRESETS.find((p) => p.key === key)!;

// ───────────────────────── карточки ─────────────────────────

/** Раскладка карточки по списку параметров: заголовок, полоски ресурсов, картинка слева, остальное сеткой по три. */
export function buildBlocks(fields: FieldDef[], bars: Record<string, string> = {}, withActions = false, startY = 0, withHeading = true): CardBlock[] {
  const blocks: CardBlock[] = [];
  let y = startY;
  const add = (b: Omit<CardBlock, "id">) => { blocks.push({ id: newId("block"), ...b }); };
  if (withHeading) { add({ kind: "heading", x: 0, y, w: 12, h: 2, props: { size: "l" } }); y += 2; }
  for (const f of fields.filter((x) => x.type === "resource")) { add({ kind: "bar", x: 0, y, w: 12, h: 2, field: f.id, props: bars[f.id] ? { maxField: bars[f.id] } : {} }); y += 2; }
  const image = fields.find((x) => x.type === "image");
  const small = fields.filter((x) => !["resource", "image", "longtext", "list"].includes(x.type) && !Object.values(bars).includes(x.id));
  let i = 0;
  if (image) {
    add({ kind: "image", x: 0, y, w: 4, h: 4, field: image.id });
    for (let k = 0; k < 4 && i < small.length; k++, i++) add({ kind: "field", x: 4 + (k % 2) * 4, y: y + Math.floor(k / 2) * 2, w: 4, h: 2, field: small[i].id });
    y += 4;
  }
  for (let k = 0; i < small.length; k++, i++) {
    add({ kind: "field", x: (k % 3) * 4, y: y + Math.floor(k / 3) * 2, w: 4, h: 2, field: small[i].id });
  }
  y += Math.ceil(Math.max(0, small.length - (image ? Math.min(4, small.length) : 0)) / 3) * 2;
  for (const f of fields.filter((x) => x.type === "longtext")) { add({ kind: "text", x: 0, y, w: 12, h: 3, field: f.id }); y += 3; }
  if (withActions) add({ kind: "actions", x: 0, y, w: 12, h: 2 });
  return blocks;
}

export function buildCardView(fields: FieldDef[], bars: Record<string, string> = {}, withActions = false): CardView {
  return { id: "default", name: l("Лист", "Sheet"), blocks: buildBlocks(fields, bars, withActions) };
}

/** Добавляет блоки для новых параметров в конец карточки (чтобы готовые параметры сразу были видны). */
export function appendToView(view: CardView, fields: FieldDef[], bars: Record<string, string> = {}): CardView {
  const hasActions = view.blocks.some((b) => b.kind === "actions");
  const actions = hasActions ? view.blocks.filter((b) => b.kind === "actions") : [];
  const rest = hasActions ? view.blocks.filter((b) => b.kind !== "actions") : view.blocks;
  const base = Math.max(0, ...rest.map((b) => b.y + b.h));
  const added = buildBlocks(fields, bars, false, base, false);
  const shift = added.length ? Math.max(...added.map((b) => b.y + b.h)) - base : 0;
  return { ...view, blocks: [...rest, ...added, ...actions.map((a) => ({ ...a, y: a.y + shift }))] };
}

// ───────────────────────── типы ─────────────────────────

export interface TypeTemplate {
  key: string;
  label: L;
  description: L;
  category: EntityCategory;
  build(): EntityType;
}

const pick = (...keys: string[]) => keys.flatMap((k) => byKey(k).fields.map((f) => structuredClone(f)));
const barsOf = (...keys: string[]) => Object.assign({}, ...keys.map((k) => byKey(k).bars ?? {})) as Record<string, string>;
const attack = (formula: string): ActionDef => ({ id: "attack", label: l("Атака", "Attack"), formula });

function make(key: string, label: L, category: EntityCategory, keys: string[], opts: { initiative?: string; actions?: ActionDef[] } = {}): EntityType {
  const fields = pick(...keys);
  const bars = barsOf(...keys);
  return {
    id: key, label, category, fields,
    ...(opts.initiative ? { initiative: opts.initiative } : {}),
    ...(opts.actions ? { actions: opts.actions } : {}),
    cardViews: [buildCardView(fields, bars, !!opts.actions?.length)],
  };
}

export const TYPE_TEMPLATES: TypeTemplate[] = [
  { key: "character", label: l("Персонаж", "Character"), description: l("Герой игрока: уровень, шесть характеристик, здоровье, броня, атака.", "A player hero: level, six ability scores, health, armor, attack."), category: "character",
    build: () => make("character", l("Персонаж", "Character"), "character", ["portrait", "level", "class", "race", "six", "hp", "armor", "attack", "description"], { initiative: "1d20 + dex_mod", actions: [attack("1d20 + attack + str_mod"), { id: "check", label: l("Проверка силы", "Strength check"), formula: "1d20 + str_mod" }] }) },
  { key: "creature", label: l("Существо", "Creature"), description: l("Монстр или противник: здоровье, броня, атака, урон, опасность, повадки.", "A monster or foe: health, armor, attack, damage, challenge, behavior."), category: "creature",
    build: () => make("creature", l("Существо", "Creature"), "creature", ["portrait", "danger", "hp", "armor", "attack", "damage", "speed", "behavior", "loot"], { initiative: "1d20", actions: [attack("1d20 + attack"), { id: "damage", label: l("Урон", "Damage"), formula: "1d6" }] }) },
  { key: "ship", label: l("Корабль или техника", "Ship or machine"), description: l("Корпус, щиты, топливо, экипаж, груз.", "Hull, shields, fuel, crew, cargo."), category: "vehicle",
    build: () => make("ship", l("Корабль", "Ship"), "vehicle", ["portrait", "hull", "shields", "fuel", "speed", "crew", "cargo", "description"]) },
  { key: "settlement", label: l("Город или поселение", "Town or settlement"), description: l("Население, богатство, защита, описание.", "Population, wealth, defense, description."), category: "settlement",
    build: () => make("settlement", l("Поселение", "Settlement"), "settlement", ["portrait", "population", "wealth", "defense", "description"]) },
  { key: "item", label: l("Предмет", "Item"), description: l("Редкость, вес, цена, описание.", "Rarity, weight, cost, description."), category: "item",
    build: () => make("item", l("Предмет", "Item"), "item", ["portrait", "rarity", "weight", "cost", "description"]) },
  { key: "location", label: l("Место", "Location"), description: l("Описание и опасность.", "Description and danger."), category: "location",
    build: () => make("location", l("Место", "Location"), "location", ["portrait", "danger", "description", "gm_notes"]) },
  { key: "faction", label: l("Фракция", "Faction"), description: l("Влияние, отношение, цели.", "Influence, attitude, goals."), category: "faction",
    build: () => make("faction", l("Фракция", "Faction"), "faction", ["influence", "attitude", "goals", "description"]) },
];

/** Уникальный id типа в системе: character, character_2, … */
export function uniqueTypeId(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
