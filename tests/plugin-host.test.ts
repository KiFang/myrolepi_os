import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate, setCoreLang } from '../src/core';
import { loadPlugins, sha256Hex } from '../src/renderer/plugin-host';
import type { PluginData, PluginDeps, PluginState, RawPlugin } from '../src/renderer/plugin-host';

const read = (dir: string): RawPlugin => ({ dir, manifest: JSON.parse(readFileSync(`plugins/${dir}/plugin.json`, 'utf8')), errors: [], code: readFileSync(`plugins/${dir}/index.js`, 'utf8') });
const raw = (manifest: object, code: string): RawPlugin => ({ dir: 'x', manifest: { id: 'x', name: 'X', version: '1', apiVersion: 1, main: 'index.js', permissions: [], ...manifest } as RawPlugin['manifest'], errors: [], code });

async function deps(plugins: RawPlugin[], over: Partial<PluginState> = {}, store: Record<string, PluginData> = {}): Promise<PluginDeps> {
  const approved: Record<string, string> = {};
  for (const p of plugins) approved[p.manifest!.id] = await sha256Hex(JSON.stringify(p.manifest) + '\n' + p.code);
  return { sha256: sha256Hex, state: { approved, disabled: [], ...over }, appVersion: '0.1.0', getLang: () => 'en', readData: async (id) => store[id] ?? { storage: {}, settings: {} }, writeData: (id, d) => { store[id] = d; } };
}
const load = async (ps: RawPlugin[], over?: Partial<PluginState>, store?: Record<string, PluginData>) => loadPlugins(ps, await deps(ps, over, store));

describe('plugin host', () => {
  it('loads the example plugin and exposes its formula function', async () => {
    const r = await load([read('example-hello')]);
    expect(r.plugins[0]).toMatchObject({ state: 'active', contributes: { functions: ['percent'] } });
    expect(evaluate('percent(100)', { functions: r.registry.functions }).value).toBe(true);
    expect(evaluate('percent(0)', { functions: r.registry.functions }).value).toBe(false);
    expect(r.registry.functionInfo.percent.example).toBe('percent(40)');
  });
  it('registers card blocks, themes, commands and dice presets', async () => {
    const r = await load([read('example-extras')]);
    expect(r.plugins[0].state).toBe('active');
    expect(r.registry.blocks['power-badge'].render({ values: { level: 6 }, props: {}, lang: 'en' })).toContain('★★★');
    expect(r.registry.themes[0].id).toBe('sunset');
    expect(r.registry.commands[0].id).toBe('example-extras:quick-roll');
    expect(r.registry.dicePresets[0].formula).toBe('1d20 + 5');
  });
  it('does not run plugins without the user\'s approval, or after the code changed', async () => {
    const p = read('example-hello');
    const none = await load([p], { approved: {} });
    expect(none.plugins[0].state).toBe('needs-approval');
    expect(Object.keys(none.registry.functions)).toEqual([]);
    const d = await deps([p]);
    const changed = await loadPlugins([{ ...p, code: p.code + '\n// edited' }], d);
    expect(changed.plugins[0].state).toBe('needs-approval');
  });
  it('skips disabled plugins', async () => {
    const r = await load([read('example-hello')], { disabled: ['example-hello'] });
    expect(r.plugins[0].state).toBe('disabled');
    expect(Object.keys(r.registry.functions)).toEqual([]);
  });
  it('enforces permissions and leaves nothing half-registered', async () => {
    const bad = raw({ permissions: ['formulas'] }, `module.exports = { activate(h) { h.registerFormulaFunction('ok', () => 1); h.registerTheme({ id: 'x', name: 'x', vars: {} }); } };`);
    const r = await load([bad]);
    expect(r.plugins[0].state).toBe('error');
    expect(r.plugins[0].errors[0]).toMatch(/themes/);
    expect(r.registry.functions.ok).toBeUndefined();
  });
  it('refuses to override built-in functions or blocks', async () => {
    const r = await load([raw({ permissions: ['formulas', 'blocks'] }, `module.exports = { activate(h) { h.registerFormulaFunction('floor', () => 1); } };`)]);
    expect(r.plugins[0].errors[0]).toMatch(/floor/);
    const b = await load([raw({ permissions: ['blocks'] }, `module.exports = { activate(h) { h.registerBlock({ kind: 'bar', label: 'x', render: () => '' }); } };`)]);
    expect(b.plugins[0].errors[0]).toMatch(/bar/);
  });
  it('wraps plugin formula functions: errors are attributed, bad results rejected', async () => {
    const r = await load([raw({ id: 'wrap', permissions: ['formulas'] }, `module.exports = { activate(h) { h.registerFormulaFunction('boom', () => { throw new Error('nope'); }); h.registerFormulaFunction('bad', () => ({ a: 1 })); } };`)]);
    expect(() => evaluate('boom()', { functions: r.registry.functions })).toThrow(/\[wrap\] nope/);
    expect(() => evaluate('bad()', { functions: r.registry.functions })).toThrow(/invalid result|недопустимый/);
  });
  it('closes browser and system globals for plugin code', async () => {
    const probe = raw({ permissions: ['formulas'] }, `module.exports = { activate(h) { h.registerFormulaFunction('probe', () => [typeof window, typeof document, typeof fetch, typeof localStorage, typeof process, typeof require].join(',')); } };`);
    const r = await load([probe]);
    expect(evaluate('probe()', { functions: r.registry.functions }).value).toBe('undefined,undefined,undefined,undefined,undefined,undefined');
  });
  it('gives each plugin its own storage and settings', async () => {
    const store: Record<string, PluginData> = { counter: { storage: { n: 41 }, settings: { step: 5 } } };
    const p = raw({ id: 'counter', permissions: ['formulas', 'storage'], settings: [{ id: 'step', type: 'number', label: 'Step', default: 1 }, { id: 'other', type: 'number', label: 'Other', default: 9 }] },
      `module.exports = { activate(h) { h.registerFormulaFunction('bump', () => { const n = Number(h.storage.get('n') ?? 0) + Number(h.settings.get('step')); h.storage.set('n', n); return n + Number(h.settings.get('other')); }); } };`);
    const r = await load([p], {}, store);
    expect(evaluate('bump()', { functions: r.registry.functions }).value).toBe(46 + 9);
    expect(store.counter.storage.n).toBe(46);
  });
  it('rejects incompatible plugins and broken manifests with readable errors', async () => {
    setCoreLang('en');
    try {
      const old = await load([raw({ minAppVersion: '9.0.0' }, 'module.exports={activate(){}}')]);
      expect(old.plugins[0].state).toBe('error');
      expect(old.plugins[0].errors[0]).toMatch(/9\.0\.0/);
      const dup = await load([raw({}, 'module.exports={activate(){}}'), raw({}, 'module.exports={activate(){}}')]);
      expect(dup.plugins[1].errors[0]).toMatch(/already loaded/);
    } finally { setCoreLang('ru'); }
  });
  it('gives up on plugins that hang at start', async () => {
    const p = raw({}, 'module.exports = { activate() { return new Promise(() => {}); } };');
    const r = await loadPlugins([p], { ...(await deps([p])), activateTimeoutMs: 40 });
    expect(r.plugins[0].state).toBe('error');
  });
});
