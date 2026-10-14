import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/core';
import { loadPlugins } from '../src/renderer/plugin-host';

const load = (dir: string) => ({ dir, manifest: JSON.parse(readFileSync(`plugins/${dir}/plugin.json`, 'utf8')), errors: [] as string[], code: readFileSync(`plugins/${dir}/index.js`, 'utf8') });

describe('plugin host', () => {
  it('loads the example plugin and exposes its formula function', () => {
    const { registry, status } = loadPlugins([load('example-hello')]);
    expect(status[0].ok).toBe(true);
    expect(evaluate('percent(100)', { functions: registry.functions }).value).toBe(true);
    expect(evaluate('percent(0)', { functions: registry.functions }).value).toBe(false);
  });
  it('registers card blocks and themes', () => {
    const { registry, status } = loadPlugins([load('example-extras')]);
    expect(status[0]).toMatchObject({ ok: true });
    expect(registry.blocks['power-badge'].render({ values: { level: 6 }, props: {}, lang: 'en' })).toContain('★★★');
    expect(registry.themes[0].id).toBe('sunset');
  });
  it('enforces permissions', () => {
    const bad = `module.exports = { activate(h) { h.registerTheme({ id: 'x', name: 'x', vars: {} }); } };`;
    const p = load('example-hello');
    const { status } = loadPlugins([{ ...p, code: bad }]);
    expect(status[0].ok).toBe(false);
    expect(status[0].errors[0]).toMatch(/themes/);
  });
});
