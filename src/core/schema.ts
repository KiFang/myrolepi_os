import type { LocalizedString } from './i18n';

/**
 * Универсальная модель «своей системы». Ничто здесь не привязано к конкретной игре:
 * «персонаж», «космический корабль», «город» или «база» — просто типы сущностей (EntityType),
 * которые пользователь (или плагин) объявляет данными.
 */

/**
 * Версия формата документов. 2: картинки хранятся отдельными файлами ("asset:<имя>"),
 * а не встроены в JSON; появились необязательные `meta` и `protection` у системы.
 * Старые документы переносит core/migrate.ts.
 */
export const SCHEMA_VERSION = 2;

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
  /** формула инициативы для трекера боя, напр. "1d20 + dex_mod" (по умолчанию 1d20) */
  initiative?: string;
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

/** Сведения об авторе и лицензии системы. Заполняются при публикации. */
export interface DocMeta {
  author?: string;
  /** название лицензии, например «CC BY 4.0» или «Только для личного пользования» */
  license?: string;
  /** разрешено ли делать правимую копию защищённой системы */
  allowFork?: boolean;
  note?: string;
  /** откуда произошла правимая копия */
  derivedFrom?: { title: string; author?: string; keyId?: string };
}

/** Защита от правки: подпись автора. Проверяется приложением (см. docs: это не защита от копирования). */
export interface Protection {
  locked: true;
  /** открытый ключ автора (base64) и его короткий отпечаток */
  publicKey: string;
  keyId: string;
  /** подпись содержимого системы (base64) */
  signature: string;
  signedAt: string;
}

export interface GameSystem {
  schema: number;
  id: string;
  name: LocalizedString;
  version: string;
  description?: LocalizedString;
  entityTypes: EntityType[];
  tables?: TableDef[];
  /** пользовательские формулы-макросы, доступны во всех формулах как функции: name(args) */
  macros?: { name: string; params: string[]; formula: string }[];
  meta?: DocMeta;
  protection?: Protection;
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

/** Участник боя: ссылка на сущность кампании и её инициатива. */
export interface Combatant {
  id: string;
  entityId: string;
  initiative: number;
}

export interface Encounter {
  id: string;
  name: string;
  round: number;
  /** индекс текущего участника в порядке инициативы */
  turn: number;
  combatants: Combatant[];
}

/** Кампания: набор сущностей, заметок, сцен, ссылающихся на систему. */
export interface Campaign {
  schema: number;
  id: string;
  name: string;
  systemId: string;
  entities: Entity[];
  /** links — id сущностей и заметок, с которыми связана заметка */
  notes: { id: string; title: string; body: string; links?: string[] }[];
  encounters?: Encounter[];
  scenes?: Scene[];
  maps?: GameMap[];
}

/** Сцена: место и момент игры — участники, карта, музыка и звуки. Музыка и звуки — ссылки на файлы из папок звука (см. audio.ts). */
export interface Scene {
  id: string;
  title: string;
  notes?: string;
  entityIds: string[];
  mapId?: string;
  /** ссылка на музыку: "music/<путь>" */
  music?: string;
  /** ссылки на звуки: "sounds/<путь>" */
  sounds?: string[];
}

/** Метка на карте. Координаты — доли размера картинки (0…1). */
export interface MapMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  color?: string;
  /** куда ведёт метка (любое одно): сцена, герой или заметка */
  sceneId?: string;
  entityId?: string;
  noteId?: string;
}

/** Карта: картинка (ссылка "asset:…") и метки на ней. */
export interface GameMap {
  id: string;
  name: string;
  image: string;
  markers: MapMarker[];
}
