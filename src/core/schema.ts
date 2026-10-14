import type { LocalizedString } from './i18n';

/**
 * Универсальная модель «своей системы». Ничто здесь не привязано к конкретной игре:
 * «персонаж», «космический корабль», «город» или «база» — просто типы сущностей (EntityType),
 * которые пользователь (или плагин) объявляет данными.
 */

export const SCHEMA_VERSION = 1;

export type FieldType =
  | 'number'      // число
  | 'text'        // короткий текст
  | 'longtext'    // многострочный текст
  | 'boolean'     // флажок
  | 'select'      // выбор из списка options
  | 'resource'    // ресурс с текущим/максимумом (HP, топливо, мана)
  | 'list'        // список значений/строк
  | 'reference'   // ссылка на другую сущность (refType — id типа)
  | 'image';      // картинка/портрет

export interface FieldDef {
  id: string;                 // латиница/кириллица/цифры/_ ; используется в формулах как переменная
  label: LocalizedString;
  type: FieldType;
  group?: string;             // раздел листа ("Характеристики", "Бой", ...)
  default?: unknown;
  min?: number;
  max?: number;
  options?: { value: string; label: LocalizedString }[];
  refType?: string;
  /** если задана — поле вычисляемое, значение берётся из формулы (может ссылаться на другие поля) */
  formula?: string;
  description?: LocalizedString;
}

/** Блок карточки: что и где показывать. Рендерится движком карточек, расширяется плагинами. */
export interface CardBlock {
  id: string;
  /** встроенные: field | heading | text | divider | image | resource-bar | table | action-button; плагины добавляют свои */
  kind: string;
  /** позиция на сетке карточки (12 колонок) */
  x: number; y: number; w: number; h: number;
  field?: string;
  props?: Record<string, unknown>;
}

export interface CardView {
  id: string;
  name: LocalizedString;
  /** размер в сетке */
  size?: { cols: number; rows: number };
  background?: { color?: string; image?: string; fit?: 'cover' | 'contain' | 'tile'; opacity?: number };
  theme?: string;             // id темы оформления
  blocks: CardBlock[];
}

/** Действие: именованная формула (атака, проверка навыка, ремонт, сбор налога...). */
export interface ActionDef {
  id: string;
  label: LocalizedString;
  /** формула; в области видимости поля сущности + inputs. Результат бросков сохраняется в историю */
  formula: string;
  inputs?: { id: string; label: LocalizedString; type: 'number' | 'text' | 'boolean'; default?: unknown }[];
  /** необязательные эффекты: изменить поле сущности на значение формулы */
  effects?: { field: string; op: 'set' | 'add'; formula: string }[];
}

export type EntityCategory = 'character' | 'creature' | 'vehicle' | 'structure' | 'settlement' | 'item' | 'location' | 'faction' | 'custom';

export interface EntityType {
  id: string;
  label: LocalizedString;
  category: EntityCategory;
  icon?: string;
  fields: FieldDef[];
  actions?: ActionDef[];
  cardViews: CardView[];
  /** Тип может содержать вложенные сущности других типов (экипаж на корабле, здания в городе) */
  children?: { type: string; label: LocalizedString; max?: number }[];
}

export interface TableDef {
  id: string;
  label: LocalizedString;
  columns: { id: string; label: LocalizedString }[];
  rows: Record<string, string | number>[];
  /** формула-бросок, по которой выбирается строка, напр. "1d100" */
  rollFormula?: string;
}

export interface GameSystem {
  schema: typeof SCHEMA_VERSION;
  id: string;
  name: LocalizedString;
  version: string;
  description?: LocalizedString;
  entityTypes: EntityType[];
  tables?: TableDef[];
  /** пользовательские формулы-макросы, доступны во всех формулах как функции: name(args) */
  macros?: { name: string; params: string[]; formula: string }[];
  /** id плагинов, необходимых системе */
  requires?: string[];
}

/** Конкретный экземпляр: персонаж Ариэль, корабль «Странник», город Асгард. */
export interface Entity {
  id: string;
  typeId: string;
  name: string;
  values: Record<string, unknown>;
  children?: string[];       // id вложенных сущностей
  cardView?: string;         // выбранный вид карточки
  tags?: string[];
}

/** Кампания: набор сущностей, заметок, сцен, ссылающихся на систему. */
export interface Campaign {
  schema: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  systemId: string;
  entities: Entity[];
  notes: { id: string; title: string; body: string; links?: string[] }[];
  scenes?: { id: string; title: string; entityIds: string[]; notes?: string }[];
}
