import type { LocalizedString } from './i18n';
import { tm } from './i18n';
import type { FormulaFn } from './formula';
import type { GameSystem } from './schema';
import { compareVersions } from './updates';

/**
 * Контракт плагина. Плагин — папка с plugin.json (манифест) и точкой входа (JS).
 * То же самое описано в docs/AI_PLUGIN_GUIDE.md — этот файл можно отдать нейросети для генерации плагина.
 *
 * Версия API (apiVersion) остаётся 1: новые возможности добавляются без поломки старых плагинов.
 */
export const PLUGIN_API_VERSION = 1;

export type PluginPermission =
  | 'formulas'      // регистрировать функции формул
  | 'blocks'        // регистрировать типы блоков карточек
  | 'systems'       // поставлять готовые системы/шаблоны
  | 'locales'       // добавлять языки/переводы
  | 'themes'        // темы оформления
  | 'commands'      // команды в палитре команд (Ctrl+K)
  | 'dice'          // пресеты кубиков на странице «Кубики»
  | 'storage'       // личное хранилище плагина (host.storage)
  | 'ui';           // зарезервировано, пока ничего не открывает

export const ALL_PERMISSIONS: PluginPermission[] = ['formulas', 'blocks', 'systems', 'locales', 'themes', 'commands', 'dice', 'storage', 'ui'];

/** Настройка плагина: приложение само рисует форму и сохраняет значения; плагин читает host.settings.get(id). */
export interface SettingDef {
  id: string;
  type: 'number' | 'text' | 'boolean' | 'select';
  label: LocalizedString;
  description?: LocalizedString;
  default?: unknown;
  min?: number;
  max?: number;
  options?: { value: string; label: LocalizedString }[];
}

export interface PluginManifest {
  id: string;                         // уникальный, a-z0-9-.
  name: LocalizedString;
  version: string;
  apiVersion: number;                 // версия PLUGIN_API_VERSION, под которую написан плагин
  description?: LocalizedString;
  author?: string;
  homepage?: string;
  /** минимальная версия приложения, например "0.1.0" */
  minAppVersion?: string;
  main: string;                       // относительный путь к JS-файлу
  permissions: PluginPermission[];
  settings?: SettingDef[];
}

export interface BlockRenderer {
  kind: string;
  label: LocalizedString;
  /** вернуть HTML-строку (будет очищена: только безопасные теги и атрибуты class/title) или DOM-узел */
  render(ctx: { values: Record<string, unknown>; props: Record<string, unknown>; lang: string }): string | HTMLElement;
}

export interface ThemeDef {
  id: string;
  name: LocalizedString;
  /** CSS-переменные темы: --bg, --fg, --accent, ... (см. docs/AI_PLUGIN_GUIDE.md) */
  vars: Record<string, string>;
  fonts?: string[];
}

export interface FormulaFnInfo {
  /** что делает функция — попадёт в справочник */
  description?: LocalizedString;
  /** пример вызова, например "percent(40)" */
  example?: string;
}

export interface CommandContext {
  lang: string;
  /** показать короткое уведомление */
  notify(message: string): void;
  /** выполнить формулу и показать результат: roll('2d6 + 3') */
  roll(formula: string): { value: unknown; text: string };
  /** перейти в раздел приложения */
  openPage(page: 'workspace' | 'dice' | 'formulas' | 'plugins' | 'help' | 'about'): void;
}

export interface CommandDef {
  id: string;
  title: LocalizedString;
  /** слова для поиска в палитре команд */
  keywords?: string[];
  run(ctx: CommandContext): void | Promise<void>;
}

export interface DicePreset {
  id?: string;
  label: LocalizedString;
  formula: string;
}

/** Объект, который получает плагин в activate(). */
export interface PluginHost {
  apiVersion: number;
  appVersion: string;
  /** текущий язык интерфейса ("ru", "en", ...) */
  lang(): string;
  registerFormulaFunction(name: string, fn: FormulaFn, info?: FormulaFnInfo): void;
  registerBlock(block: BlockRenderer): void;
  registerSystem(system: GameSystem): void;
  registerLocale(lang: string, dict: Record<string, string>): void;
  registerTheme(theme: ThemeDef): void;
  registerCommand(command: CommandDef): void;
  registerDicePreset(preset: DicePreset): void;
  /** личное хранилище (право storage); значения должны быть JSON-совместимыми */
  storage: { get(key: string): unknown; set(key: string, value: unknown): void };
  /** значения настроек, описанных в манифесте */
  settings: { get(id: string): unknown };
  log(...args: unknown[]): void;
}

export interface PluginModule {
  activate(host: PluginHost): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

const ID_RE = /^[a-z0-9][a-z0-9.\-]*$/;

/** Проверка манифеста. Сообщения — на языке интерфейса (setCoreLang). */
export function validateManifest(m: unknown, appVersion?: string): string[] {
  const errs: string[] = [];
  const o = m as Partial<PluginManifest> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return [tm('plug.notObject')];
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) errs.push(tm('plug.id'));
  if (!o.name) errs.push(tm('plug.name'));
  if (typeof o.version !== 'string') errs.push(tm('plug.version'));
  if (o.apiVersion !== PLUGIN_API_VERSION) errs.push(tm('plug.apiVersion', { v: PLUGIN_API_VERSION }));
  if (typeof o.main !== 'string' || o.main.includes('..') || o.main.startsWith('/') || /^[a-zA-Z]:/.test(o.main)) errs.push(tm('plug.main'));
  if (!Array.isArray(o.permissions) || o.permissions.some((p) => !ALL_PERMISSIONS.includes(p))) errs.push(tm('plug.permissions', { list: ALL_PERMISSIONS.join(', ') }));
  if (o.settings !== undefined) {
    const ids = new Set<string>();
    if (!Array.isArray(o.settings)) errs.push(tm('plug.settings'));
    else for (const s of o.settings) {
      if (!s || typeof s.id !== 'string' || !['number', 'text', 'boolean', 'select'].includes(s.type) || ids.has(s.id)) { errs.push(tm('plug.settingBad', { id: String((s as SettingDef | undefined)?.id ?? '?') })); continue; }
      ids.add(s.id);
    }
  }
  if (o.minAppVersion !== undefined) {
    if (typeof o.minAppVersion !== 'string') errs.push(tm('plug.minApp'));
    else if (appVersion && compareVersions(appVersion, o.minAppVersion) < 0) errs.push(tm('plug.needNewer', { v: o.minAppVersion, cur: appVersion }));
  }
  return errs;
}

/** Человекочитаемое объяснение права — для окна согласия. */
export const PERMISSION_KEYS: Record<PluginPermission, string> = {
  formulas: 'perm.formulas', blocks: 'perm.blocks', systems: 'perm.systems', locales: 'perm.locales', themes: 'perm.themes',
  commands: 'perm.commands', dice: 'perm.dice', storage: 'perm.storage', ui: 'perm.ui',
};
