import { PLUGIN_API_VERSION, BlockRenderer, FormulaFn, GameSystem, PluginHost, PluginManifest, PluginModule, ThemeDef, registerLocale } from '../core';

export interface RawPlugin { dir: string; manifest: PluginManifest | null; errors: string[]; code?: string }

export interface PluginRegistry {
  functions: Record<string, FormulaFn>;
  blocks: Record<string, BlockRenderer>;
  systems: GameSystem[];
  themes: ThemeDef[];
}

export interface PluginStatus { id: string; name: string; ok: boolean; errors: string[] }

/**
 * Этап 1: плагины — код, который пользователь поставил сам (доверенный), но каждый получает
 * только те части API, на которые заявил permissions. Изоляция в Worker/iframe — в планах.
 */
export function loadPlugins(raw: RawPlugin[]): { registry: PluginRegistry; status: PluginStatus[] } {
  const registry: PluginRegistry = { functions: {}, blocks: {}, systems: [], themes: [] };
  const status: PluginStatus[] = [];
  for (const p of raw) {
    const m = p.manifest;
    const name = m ? (typeof m.name === 'string' ? m.name : Object.values(m.name)[0]) : p.dir;
    if (p.errors.length || !m || !p.code) { status.push({ id: m?.id ?? p.dir, name, ok: false, errors: p.errors }); continue; }
    const need = (perm: PluginManifest['permissions'][number]) => {
      if (!m.permissions.includes(perm)) throw new Error(`Плагин не заявил permission "${perm}"`);
    };
    const host: PluginHost = {
      apiVersion: PLUGIN_API_VERSION,
      registerFormulaFunction: (n, fn) => { need('formulas'); registry.functions[n.toLowerCase()] = fn; },
      registerBlock: (b) => { need('blocks'); registry.blocks[b.kind] = b; },
      registerSystem: (s) => { need('systems'); registry.systems.push(s); },
      registerLocale: (l, d) => { need('locales'); registerLocale(l, d); },
      registerTheme: (th) => { need('themes'); registry.themes.push(th); },
      log: (...a) => console.log(`[plugin ${m.id}]`, ...a),
    };
    try {
      const module: { exports: Partial<PluginModule> } = { exports: {} };
      new Function('module', 'exports', p.code)(module, module.exports);
      if (typeof module.exports.activate !== 'function') throw new Error('Плагин должен экспортировать activate(host)');
      void module.exports.activate(host);
      status.push({ id: m.id, name, ok: true, errors: [] });
    } catch (e) {
      status.push({ id: m.id, name, ok: false, errors: [(e as Error).message] });
    }
  }
  return { registry, status };
}
