import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/core';
import { loadPlugins } from '../src/renderer/plugin-host';

const manifest = JSON.parse(readFileSync('plugins/example-hello/plugin.json', 'utf8'));
const code = readFileSync('plugins/example-hello/index.js', 'utf8');

describe('plugin host', () => {
  it('loads the example plugin and exposes its formula function', () => {
    const { registry, status } = loadPlugins([{ dir: 'example-hello', manifest, errors: [], code }]);
    expect(status[0].ok).toBe(true);
    expect(evaluate('percent(100)', { functions: registry.functions }).value).toBe(true);
    expect(evaluate('percent(0)', { functions: registry.functions }).value).toBe(false);
  });
  it('enforces permissions', () => {
    const bad = `module.exports = { activate(h) { h.registerTheme({ id: 'x', name: 'x', vars: {} }); } };`;
    const { status } = loadPlugins([{ dir: 'bad', manifest, errors: [], code: bad }]);
    expect(status[0].ok).toBe(false);
    expect(status[0].errors[0]).toMatch(/themes/);
  });
});
