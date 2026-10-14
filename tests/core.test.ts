import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeEntity, evaluate, loc, parseDice, rollDice, seededRng, setCoreLang, t, validateSystem, validateManifest, GameSystem } from '../src/core';

const rngOf = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('dice', () => {
  it('parses notation', () => {
    expect(parseDice('d20')).toMatchObject({ count: 1, sides: 20 });
    expect(parseDice('4d6kh3').keep).toEqual({ mode: 'high', n: 3 });
    expect(parseDice('d%').sides).toBe(100);
    expect(() => parseDice('banana')).toThrow();
  });
  it('keep highest / drop lowest', () => {
    // rng 0.0 -> 1, 0.99 -> max
    const r = rollDice('4d6kh3', rngOf(0, 0.99, 0.5, 0.99));
    expect(r.rolls).toEqual([1, 6, 4, 6]);
    expect(r.total).toBe(16);
    expect(rollDice('4d6dl1', rngOf(0, 0.99, 0.5, 0.99)).total).toBe(16);
  });
  it('explodes', () => {
    const r = rollDice('1d6!', rngOf(0.99, 0.99, 0.2));
    expect(r.rolls).toEqual([6, 6, 2]);
    expect(r.total).toBe(14);
  });
  it('fudge dice stay within -1..1', () => {
    const r = rollDice('100dF', seededRng(1));
    expect(r.rolls.every((v) => v >= -1 && v <= 1)).toBe(true);
  });
  it('is statistically uniform', () => {
    const rng = seededRng(42);
    const c = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) c[rollDice('1d6', rng).total - 1]++;
    c.forEach((n) => expect(Math.abs(n - 1000)).toBeLessThan(150));
  });
});

describe('formula', () => {
  it('arithmetic & precedence', () => {
    expect(evaluate('2 + 3 * 4').value).toBe(14);
    expect(evaluate('2 ^ 3 ^ 2').value).toBe(512);
    expect(evaluate('-(2 + 3) * 2').value).toBe(-10);
    expect(evaluate('7 % 4').value).toBe(3);
  });
  it('variables, paths, cyrillic', () => {
    expect(evaluate('str + ship.hull + @сила', { scope: { str: 1, ship: { hull: 2 }, сила: 3 } }).value).toBe(6);
  });
  it('functions and conditions', () => {
    expect(evaluate('floor((15 - 10) / 2)').value).toBe(2);
    expect(evaluate('max(1, 5, 3) + min(4, 2)').value).toBe(7);
    expect(evaluate('x >= 10 ? "ok" : "bad"', { scope: { x: 12 } }).value).toBe('ok');
    expect(evaluate('if(1 > 2, 1d20, 5)').rolls).toHaveLength(0); // ленивая ветка
  });
  it('dice in formulas record rolls', () => {
    const r = evaluate('2d6 + 3', { rng: rngOf(0.99, 0.99) });
    expect(r.value).toBe(15);
    expect(r.rolls[0].rolls).toEqual([6, 6]);
  });
  it('does not mistake identifiers for dice', () => {
    expect(evaluate('bid6 + d4x', { scope: { bid6: 1, d4x: 2 } }).value).toBe(3);
  });
  it('errors are reported', () => {
    expect(() => evaluate('1 / 0')).toThrow();
    expect(() => evaluate('nope')).toThrow(/Неизвестная переменная/);
    expect(() => evaluate('2 +')).toThrow();
    expect(() => evaluate('foo(1)')).toThrow(/функция/);
  });
  it('plugin functions', () => {
    expect(evaluate('double(4)', { functions: { double: (a) => (a[0] as number) * 2 } }).value).toBe(8);
  });
});

describe('custom system', () => {
  const sys = JSON.parse(readFileSync('examples/space-opera.system.json', 'utf8')) as GameSystem;
  it('example system is valid', () => {
    expect(validateSystem(sys).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('computes character with macros', () => {
    const type = sys.entityTypes.find((x) => x.id === 'character')!;
    const r = computeEntity(type, { level: 3, str: 14, tech: 16 }, { system: sys });
    expect(r.errors).toEqual({});
    expect(r.values.max_hp).toBe(8 + 2 + 12);
    expect(r.values.tech_mod).toBe(3);
  });
  it('computes starship and colony (custom types)', () => {
    const ship = computeEntity(sys.entityTypes[1], { engines: 4, mass: 40, hull: 90 }, { system: sys });
    expect(ship.values).toMatchObject({ speed: 10, armor: 4 });
    const colony = computeEntity(sys.entityTypes[2], {}, { system: sys });
    expect(colony.values.food_balance).toBe(250);
  });
  it('detects cycles, unknown refs, broken formulas', () => {
    const bad: GameSystem = {
      ...sys,
      entityTypes: [{
        id: 'x', label: 'X', category: 'custom', cardViews: [],
        fields: [
          { id: 'a', label: 'a', type: 'number', formula: 'b + 1' },
          { id: 'b', label: 'b', type: 'number', formula: 'a + 1' },
          { id: 'c', label: 'c', type: 'number', formula: 'zzz' },
          { id: 'd', label: 'd', type: 'number', formula: '1 +' },
        ],
      }],
    };
    const msgs = validateSystem(bad).map((i) => i.message).join('|');
    expect(msgs).toMatch(/Циклическая/);
    expect(msgs).toMatch(/неизвестное поле "zzz"/);
    expect(validateSystem(bad).filter((i) => i.level === 'error').length).toBeGreaterThanOrEqual(3);
  });
});

describe('i18n & plugins', () => {
  it('localizes with fallback', () => {
    expect(loc({ ru: 'Привет', en: 'Hello' }, 'en')).toBe('Hello');
    expect(loc({ en: 'Hello' }, 'de')).toBe('Hello');
    expect(t('nav.dice', 'ru')).toBe('Кубики');
    expect(t('nav.dice', 'de')).toBe('Dice');
    expect(t('missing.key', 'ru')).toBe('missing.key');
  });
  it('validates manifest', () => {
    const ok = { id: 'a-b', name: 'A', version: '1', apiVersion: 1, main: 'index.js', permissions: ['formulas'] };
    expect(validateManifest(ok)).toEqual([]);
    expect(validateManifest({ ...ok, main: '../evil.js' }).length).toBe(1);
    expect(validateManifest({ ...ok, permissions: ['root'] }).length).toBe(1);
  });
});

describe('localized core errors', () => {
  it('speaks the interface language', () => {
    try {
      setCoreLang('en');
      expect(() => evaluate('nope')).toThrow(/Unknown variable "nope"/);
      expect(() => evaluate('1 / 0')).toThrow(/Division by zero/);
      expect(() => parseDice('banana')).toThrow(/Invalid dice notation/);
      const bad = { schema: 1, id: 's', name: 's', version: '1', entityTypes: [{ id: 'x', label: 'X', category: 'custom', cardViews: [], fields: [{ id: 'a', label: 'a', type: 'number', formula: 'zzz' }] }] } as GameSystem;
      expect(validateSystem(bad).map((i) => i.message).join('|')).toMatch(/unknown field "zzz"/);
    } finally {
      setCoreLang('ru');
    }
    expect(() => evaluate('nope')).toThrow(/Неизвестная переменная/);
  });
});
