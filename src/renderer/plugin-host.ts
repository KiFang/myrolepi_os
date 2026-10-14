import {
  PLUGIN_API_VERSION, parse, registerLocale, tm, validateManifest, validateSystem,
} from '../core';
import type {
  BlockRenderer, CommandDef, DicePreset, FormulaFn, FormulaFnInfo, GameSystem, LocalizedString,
  PanelDef, PluginHost, PluginManifest, PluginModule, PluginPermission, SettingDef, ThemeDef,
} from '../core';

export interface RawPlugin { dir: string; manifest: PluginManifest | null; errors: string[]; code?: string; /** отпечаток всех файлов плагина (для плагинов с панелями) */ filesHash?: string }

/** Согласия пользователя и отключённые плагины (хранятся в файле, см. App). */
export interface PluginState { approved: Record<string, string>; disabled: string[] }
/** Личные данные плагина: его хранилище и значения настроек. */
export interface PluginData { storage: Record<string, unknown>; settings: Record<string, unknown> }

export interface Contributions { functions: string[]; blocks: string[]; themes: string[]; systems: string[]; locales: string[]; commands: string[]; dice: string[]; panels: string[] }
const noContributions = (): Contributions => ({ functions: [], blocks: [], themes: [], systems: [], locales: [], commands: [], dice: [], panels: [] });

export type PluginRunState = 'active' | 'needs-approval' | 'disabled' | 'error';

export interface PluginInfo {
  id: string;
  dir: string;
  name: LocalizedString;
  version: string;
  author?: string;
  homepage?: string;
  description?: LocalizedString;
  permissions: PluginPermission[];
  settings: SettingDef[];
  /** панели плагина; заполнено, только пока плагин запущен */
  panels: PanelDef[];
  state: PluginRunState;
  errors: string[];
  contributes: Contributions;
  /** отпечаток кода и манифеста: согласие действует, пока он не изменился */
  hash: string;
}

export interface PluginRegistry {
  functions: Record<string, FormulaFn>;
  functionInfo: Record<string, FormulaFnInfo & { pluginId: string }>;
  blocks: Record<string, BlockRenderer>;
  systems: GameSystem[];
  themes: ThemeDef[];
  commands: (CommandDef & { pluginId: string })[];
  dicePresets: (DicePreset & { pluginId: string })[];
}
export const createRegistry = (): PluginRegistry => ({ functions: {}, functionInfo: {}, blocks: {}, systems: [], themes: [], commands: [], dicePresets: [] });

export interface PluginDeps {
  sha256(text: string): Promise<string>;
  state: PluginState;
  readData(id: string): Promise<PluginData>;
  writeData(id: string, data: PluginData): void;
  appVersion: string;
  getLang(): string;
  /** сколько ждать запуска плагина (по умолчанию 3 секунды) */
  activateTimeoutMs?: number;
}

const BUILTIN_BLOCKS = ['heading', 'field', 'text', 'divider', 'image', 'bar', 'actions'];
const BUILTIN_FUNCTIONS = ['floor', 'ceil', 'round', 'abs', 'sqrt', 'min', 'max', 'sum', 'avg', 'clamp', 'if', 'len', 'roll'];
export const STORAGE_LIMIT = 256 * 1024;
const ACTIVATE_TIMEOUT_MS = 3000;

/**
 * Имена браузерных и системных возможностей, которые плагин не получает: код выполняется с
 * ними, закрытыми параметрами-заглушками. Это защита от случайностей и грубых ошибок, а НЕ
 * граница безопасности — плагин работает с правами приложения. Поэтому действует согласие
 * пользователя на права и отпечаток кода (см. loadPlugins).
 */
const SHADOWED = ['window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'require', 'process', 'importScripts', 'navigator', 'location', 'open', 'alert', 'confirm', 'prompt', 'Function', 'Image', 'Audio', 'BroadcastChannel', 'MessageChannel', 'postMessage', 'electron', 'rpi'];

const isValue = (v: unknown) => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === 'number'));
const nameOf = (n: LocalizedString, lang = 'en') => (typeof n === 'string' ? n : n[lang] ?? n.en ?? Object.values(n)[0] ?? '');

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface LoadResult { registry: PluginRegistry; plugins: PluginInfo[]; data: Record<string, PluginData> }

/**
 * Загружает плагины. Выполняются только те, что: корректны, совместимы по версии, одобрены
 * пользователем (с тем же отпечатком кода) и не отключены. Результаты регистрации собираются
 * в черновик и попадают в общий реестр только при успешной активации — сломанный плагин не
 * оставляет «полурегистраций».
 */
export async function loadPlugins(raw: RawPlugin[], deps: PluginDeps): Promise<LoadResult> {
  const registry = createRegistry();
  const plugins: PluginInfo[] = [];
  const data: Record<string, PluginData> = {};
  const seen = new Set<string>();

  for (const p of raw) {
    const m = p.manifest;
    const baseErrors = [...p.errors];
    if (m && !baseErrors.length) baseErrors.push(...validateManifest(m, deps.appVersion));
    if (m && !baseErrors.length && m.main !== undefined && !p.code) baseErrors.push(tm('plug.noCode'));
    if (m && !baseErrors.length && m.panels?.length && !p.filesHash) baseErrors.push(tm('plug.noFilesHash'));
    if (!m || baseErrors.length) {
      plugins.push({ id: m?.id ?? p.dir, dir: p.dir, name: m?.name ?? p.dir, version: m?.version ?? '?', permissions: Array.isArray(m?.permissions) ? m!.permissions : [], settings: [], panels: [], state: 'error', errors: baseErrors, contributes: noContributions(), hash: '' });
      continue;
    }
    if (seen.has(m.id)) {
      plugins.push({ id: m.id, dir: p.dir, name: m.name, version: m.version, permissions: m.permissions, settings: [], panels: [], state: 'error', errors: [tm('plug.duplicate', { id: m.id })], contributes: noContributions(), hash: '' });
      continue;
    }
    seen.add(m.id);
    const hash = await deps.sha256(JSON.stringify(m) + '\n' + (p.code ?? '') + (m.panels?.length ? '\nfiles:' + p.filesHash : ''));
    const info: PluginInfo = { id: m.id, dir: p.dir, name: m.name, version: m.version, author: m.author, homepage: m.homepage, description: m.description, permissions: m.permissions, settings: m.settings ?? [], panels: m.panels ?? [], state: 'active', errors: [], contributes: noContributions(), hash };
    plugins.push(info);
    if (deps.state.approved[m.id] !== hash) { info.state = 'needs-approval'; continue; }
    if (deps.state.disabled.includes(m.id)) { info.state = 'disabled'; continue; }

    const pdata: PluginData = await deps.readData(m.id).catch((): PluginData => ({ storage: {}, settings: {} }));
    pdata.storage ??= {};
    pdata.settings ??= {};
    data[m.id] = pdata;

    // черновик регистраций этого плагина
    const draft = createRegistry();
    const locales: [string, Record<string, string>][] = [];
    const need = (perm: PluginPermission) => { if (!m.permissions.includes(perm)) throw new Error(tm('plug.noPermission', { perm })); };
    const host: PluginHost = {
      apiVersion: PLUGIN_API_VERSION,
      appVersion: deps.appVersion,
      lang: () => deps.getLang(),
      registerFormulaFunction: (name, fn, finfo) => {
        need('formulas');
        const n = String(name).toLowerCase();
        if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw new Error(tm('plug.badFnName', { name }));
        if (BUILTIN_FUNCTIONS.includes(n) || n in registry.functions) throw new Error(tm('plug.fnTaken', { name: n }));
        if (typeof fn !== 'function') throw new Error(tm('plug.notFunction', { name: n }));
        draft.functions[n] = (args, ctx) => {
          let r: unknown;
          try { r = fn(args, ctx); } catch (e) { throw new Error(`[${m.id}] ${(e as Error).message}`); }
          if (!isValue(r)) throw new Error(tm('plug.badResult', { id: m.id, name: n }));
          return r as ReturnType<FormulaFn>;
        };
        draft.functionInfo[n] = { ...finfo, pluginId: m.id };
        info.contributes.functions.push(n);
      },
      registerBlock: (b) => {
        need('blocks');
        if (!b || typeof b.kind !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(b.kind) || typeof b.render !== 'function') throw new Error(tm('plug.badBlock'));
        if (BUILTIN_BLOCKS.includes(b.kind) || b.kind in registry.blocks) throw new Error(tm('plug.blockTaken', { kind: b.kind }));
        draft.blocks[b.kind] = b;
        info.contributes.blocks.push(b.kind);
      },
      registerSystem: (s) => {
        need('systems');
        const bad = validateSystem(s).find((i) => i.level === 'error');
        if (bad) throw new Error(tm('plug.badSystem', { msg: bad.message }));
        draft.systems.push(s);
        info.contributes.systems.push(s.id);
      },
      registerLocale: (lang, dict) => {
        need('locales');
        if (!/^[a-z]{2,3}(-[A-Za-z]+)?$/.test(lang) || !dict || typeof dict !== 'object') throw new Error(tm('plug.badLocale', { lang }));
        locales.push([lang, Object.fromEntries(Object.entries(dict).filter(([, v]) => typeof v === 'string'))]);
        info.contributes.locales.push(lang);
      },
      registerTheme: (th) => {
        need('themes');
        if (!th || !/^[a-z0-9][a-z0-9-]*$/.test(th.id) || !th.vars || typeof th.vars !== 'object') throw new Error(tm('plug.badTheme'));
        draft.themes.push(th);
        info.contributes.themes.push(th.id);
      },
      registerCommand: (c) => {
        need('commands');
        if (!c || typeof c.id !== 'string' || !c.title || typeof c.run !== 'function') throw new Error(tm('plug.badCommand'));
        draft.commands.push({ ...c, id: `${m.id}:${c.id}`, pluginId: m.id });
        info.contributes.commands.push(c.id);
      },
      registerDicePreset: (d) => {
        need('dice');
        if (!d || typeof d.formula !== 'string' || !d.label) throw new Error(tm('plug.badPreset'));
        try { parse(d.formula); } catch (e) { throw new Error(tm('plug.badPresetFormula', { msg: (e as Error).message })); }
        draft.dicePresets.push({ ...d, id: d.id ?? `${m.id}:${d.formula}`, pluginId: m.id });
        info.contributes.dice.push(d.formula);
      },
      storage: {
        get: (key) => { need('storage'); const v = pdata.storage[String(key)]; return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); },
        set: (key, value) => {
          need('storage');
          const next = { ...pdata.storage, [String(key)]: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) };
          if (JSON.stringify(next).length > STORAGE_LIMIT) throw new Error(tm('plug.storageFull'));
          pdata.storage = next;
          deps.writeData(m.id, pdata);
        },
      },
      settings: { get: (id) => pdata.settings[id] ?? (m.settings ?? []).find((s) => s.id === id)?.default },
      log: (...a) => console.log(`[plugin ${m.id}]`, ...a),
    };

    try {
      if (p.code !== undefined) {
        const module: { exports: Partial<PluginModule> } = { exports: {} };
        new Function('module', 'exports', ...SHADOWED, p.code)(module, module.exports, ...SHADOWED.map(() => undefined));
        if (typeof module.exports.activate !== 'function') throw new Error(tm('plug.noActivate'));
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          Promise.resolve(module.exports.activate(host)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(tm('plug.timeout'))), deps.activateTimeoutMs ?? ACTIVATE_TIMEOUT_MS); }),
        ]).finally(() => clearTimeout(timer));
      }
      if (m.panels?.length) { info.panels = m.panels; info.contributes.panels = m.panels.map((x) => x.id); }
      // успех: переносим черновик в общий реестр
      Object.assign(registry.functions, draft.functions);
      Object.assign(registry.functionInfo, draft.functionInfo);
      Object.assign(registry.blocks, draft.blocks);
      registry.systems.push(...draft.systems);
      registry.themes.push(...draft.themes);
      registry.commands.push(...draft.commands);
      registry.dicePresets.push(...draft.dicePresets);
      for (const [lang, dict] of locales) registerLocale(lang, dict);
    } catch (e) {
      info.state = 'error';
      info.errors = [(e as Error).message];
      info.contributes = noContributions();
      info.panels = [];
    }
  }
  return { registry, plugins, data };
}

export { nameOf as pluginName };
