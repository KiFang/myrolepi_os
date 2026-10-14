import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate, validateManifest, validateSystem } from '../src/core';
import { loadPlugins, sha256Hex } from '../src/renderer/plugin-host';
import type { PluginData, RawPlugin } from '../src/renderer/plugin-host';

const guide = (f: string) => readFileSync(`docs/${f}`, 'utf8');
const blocks = (text: string, lang: string) => [...text.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);

async function run(manifest: object, code: string) {
  const p: RawPlugin = { dir: 'doc', manifest: { id: 'doc', name: 'Doc', version: '1', apiVersion: 1, main: 'index.js', permissions: [], ...manifest } as RawPlugin['manifest'], errors: [], code };
  const hash = await sha256Hex(JSON.stringify(p.manifest) + '\n' + p.code);
  const store: Record<string, PluginData> = {};
  return loadPlugins([p], { sha256: sha256Hex, state: { approved: { doc: hash }, disabled: [] }, appVersion: '0.1.0', getLang: () => 'en', readData: async (id) => store[id] ?? { storage: {}, settings: {} }, writeData: (id, d) => { store[id] = d; } });
}

// Примеры из гайда для нейросети должны работать — иначе нейросеть будет учиться на сломанном коде.
describe.each(['AI_PLUGIN_GUIDE.md', 'AI_PLUGIN_GUIDE.en.md'])('%s', (file) => {
  const text = guide(file);
  it('minimal system example is valid and loads', async () => {
    const snippet = blocks(text, 'js').find((b) => b.includes('registerSystem'))!;
    const r = await run({ permissions: ['systems'] }, `module.exports = { activate(host) {\n${snippet}\n} };`);
    expect(r.plugins[0].errors).toEqual([]);
    expect(validateSystem(r.registry.systems[0]).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('the "crit" recipe works', async () => {
    const snippet = blocks(text, 'js').find((b) => b.includes("'crit'"))!;
    const r = await run({ permissions: ['formulas', 'storage'] }, snippet);
    expect(r.plugins[0].errors).toEqual([]);
    expect(evaluate('crit(20, 8)', { functions: r.registry.functions }).value).toBe(16);
    expect(evaluate('crit(3, 8)', { functions: r.registry.functions }).value).toBe(8);
  });
  it('percent example and settings JSON are well-formed', async () => {
    const snippet = blocks(text, 'js').find((b) => b.includes("'percent'"))!;
    const r = await run({ permissions: ['formulas'] }, `module.exports = { activate(host) {\n${snippet}\n} };`);
    expect(r.plugins[0].errors).toEqual([]);
    const settings = JSON.parse('{' + blocks(text, 'json').find((b) => b.includes('"settings"'))! + '}');
    expect(settings.settings).toHaveLength(2);
  });
  it('lists every permission and host method', () => {
    for (const perm of ['formulas', 'blocks', 'systems', 'locales', 'themes', 'commands', 'dice', 'storage', 'ui', 'project.read', 'project.write']) expect(text).toContain('`' + perm + '`');
    for (const m of ['registerFormulaFunction', 'registerBlock', 'registerSystem', 'registerLocale', 'registerTheme', 'registerCommand', 'registerDicePreset', 'host.storage', 'host.settings.get']) expect(text).toContain(m);
  });
});

describe.each(['AI_PLUGIN_GUIDE.md', 'AI_PLUGIN_GUIDE.en.md'])('%s panels', (file) => {
  const text = guide(file);
  it('the panel manifest example is valid', () => {
    const json = '{' + blocks(text, 'json').find((b) => b.includes('"panels"'))! + '}';
    const o = JSON.parse(json);
    expect(validateManifest({ id: 'p', name: 'P', version: '1', apiVersion: 1, ...o })).toEqual([]);
  });
  it('the panel page example includes the SDK and uses no inline script', () => {
    const html = blocks(text, 'html')[0];
    expect(html).toContain('href="@sdk.css"');
    expect(html).toContain('src="@sdk.js"');
    expect(html.replace(/<script src="[^"]*"><\/script>/g, '')).not.toMatch(/<script/);
  });
  it('documents every SDK call', () => {
    for (const m of ['rolepi.ready', 'rolepi.project.createNote', 'rolepi.project.createEntity', 'rolepi.project.updateEntityValues', 'rolepi.project.createSystem', 'rolepi.storage', 'rolepi.roll', 'rolepi.notify']) expect(text).toContain(m);
  });
});

describe('guide parity', () => {
  it('Russian and English guides have the same code examples', () => {
    const ru = blocks(guide('AI_PLUGIN_GUIDE.md'), 'js').length, en = blocks(guide('AI_PLUGIN_GUIDE.en.md'), 'js').length;
    expect(ru).toBe(en);
    expect(guide('AI_PLUGIN_GUIDE.md')).toContain(guide('plugin-api.d.ts').trim().split('\n').slice(2, 6).join('\n'));
  });
});
