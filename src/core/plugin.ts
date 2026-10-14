import type { LocalizedString } from './i18n';
import type { FormulaFn } from './formula';
import type { GameSystem } from './schema';

/**
 * Контракт плагина. Плагин — папка с plugin.json (манифест) и точкой входа (JS).
 * Это же описано в docs/AI_PLUGIN_GUIDE.md — файл можно отдать нейросети для генерации плагина.
 */

export const PLUGIN_API_VERSION = 1;

export type PluginPermission =
  | 'formulas'      // регистрировать функции формул
  | 'blocks'        // регистрировать типы блоков карточек
  | 'systems'       // поставлять готовые системы/шаблоны
  | 'locales'       // добавлять языки/переводы
  | 'themes'        // темы оформления
  | 'ui'            // панели/страницы интерфейса
  | 'storage';      // личное хранилище плагина

export interface PluginManifest {
  id: string;                         // уникальный, a-z0-9-.
  name: LocalizedString;
  version: string;
  apiVersion: number;                 // версия PLUGIN_API_VERSION, под которую написан плагин
  description?: LocalizedString;
  author?: string;
  main: string;                       // относительный путь к JS-файлу
  permissions: PluginPermission[];
}

export interface BlockRenderer {
  kind: string;
  label: LocalizedString;
  /** вернуть HTML-строку (будет санитизирована) или DOM-узел */
  render(ctx: { values: Record<string, unknown>; props: Record<string, unknown>; lang: string }): string | HTMLElement;
}

export interface ThemeDef {
  id: string;
  name: LocalizedString;
  /** CSS-переменные: --bg, --fg, --accent, --card-bg ... */
  vars: Record<string, string>;
  fonts?: string[];
}

/** Объект, который получает плагин в activate(). */
export interface PluginHost {
  apiVersion: number;
  registerFormulaFunction(name: string, fn: FormulaFn): void;
  registerBlock(block: BlockRenderer): void;
  registerSystem(system: GameSystem): void;
  registerLocale(lang: string, dict: Record<string, string>): void;
  registerTheme(theme: ThemeDef): void;
  log(...args: unknown[]): void;
}

export interface PluginModule {
  activate(host: PluginHost): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

const ID_RE = /^[a-z0-9][a-z0-9.\-]*$/;
const PERMS: PluginPermission[] = ['formulas', 'blocks', 'systems', 'locales', 'themes', 'ui', 'storage'];

export function validateManifest(m: unknown): string[] {
  const errs: string[] = [];
  const o = m as Partial<PluginManifest> | null;
  if (!o || typeof o !== 'object') return ['Манифест должен быть объектом'];
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) errs.push('id: допустимы a-z, 0-9, "-" и "."');
  if (!o.name) errs.push('name обязателен');
  if (typeof o.version !== 'string') errs.push('version обязателен');
  if (o.apiVersion !== PLUGIN_API_VERSION) errs.push(`apiVersion должен быть ${PLUGIN_API_VERSION}`);
  if (typeof o.main !== 'string' || o.main.includes('..') || o.main.startsWith('/')) errs.push('main: относительный путь внутри папки плагина');
  if (!Array.isArray(o.permissions) || o.permissions.some((p) => !PERMS.includes(p))) errs.push(`permissions: допустимо ${PERMS.join(', ')}`);
  return errs;
}
