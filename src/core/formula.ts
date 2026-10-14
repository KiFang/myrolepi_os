import { DICE_RE, DiceRoll, rollDice } from './dice';
import { Rng, defaultRng } from './rng';
import { tm } from './i18n';

/**
 * Движок формул. Примеры:
 *   2d6 + floor((str - 10) / 2)
 *   4d6kh3                       (4 кубика, оставить 3 лучших)
 *   if(roll >= dc, 1, 0)
 *   ship.hull.armor * 2          (путь через точку)
 *   sum(crew_skill)              (если значение — массив)
 */

export type Value = number | string | boolean | number[] | null;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'dice'; v: string }
  | { t: 'id'; v: string; s: number; e: number }
  | { t: 'op'; v: string }
  | { t: 'eof' };

export class FormulaError extends Error {}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    // дайс-литерал: только если не примыкает к идентификатору (напр. "1d6", но не "bid6")
    const dm = DICE_RE.exec(rest);
    if (dm && /^(\d*)d/i.test(rest) && !/[A-Za-z0-9_]/.test(rest[dm[0].length] ?? '')) {
      out.push({ t: 'dice', v: dm[0] });
      i += dm[0].length;
      continue;
    }
    const nm = /^\d+(\.\d+)?/.exec(rest);
    if (nm) { out.push({ t: 'num', v: parseFloat(nm[0]) }); i += nm[0].length; continue; }
    const im = /^@?[\p{L}_][\p{L}\p{N}_]*(\.[\p{L}_][\p{L}\p{N}_]*)*/u.exec(rest);
    if (im) { out.push({ t: 'id', v: im[0].replace(/^@/, ''), s: i, e: i + im[0].length }); i += im[0].length; continue; }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FormulaError(tm('err.strOpen'));
      out.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const op = /^(>=|<=|==|!=|&&|\|\||[+\-*\/%^()<>,!?:])/.exec(rest);
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    throw new FormulaError(tm('err.badChar', { c, i }));
  }
  out.push({ t: 'eof' });
  return out;
}

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'dice'; v: string }
  | { k: 'var'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'cond'; c: Node; a: Node; b: Node };

const BIN_PREC: Record<string, [number, 'L' | 'R']> = {
  '||': [1, 'L'], '&&': [2, 'L'],
  '==': [3, 'L'], '!=': [3, 'L'], '<': [4, 'L'], '>': [4, 'L'], '<=': [4, 'L'], '>=': [4, 'L'],
  '+': [5, 'L'], '-': [5, 'L'], '*': [6, 'L'], '/': [6, 'L'], '%': [6, 'L'], '^': [8, 'R'],
};

export function parse(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = (v: string) => peek().t === 'op' && (peek() as { v: string }).v === v;
  const expect = (v: string) => { if (!isOp(v)) throw new FormulaError(tm('err.expected', { v })); p++; };

  function expr(minPrec: number): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t.t !== 'op') break;
      if (t.v === '?' && minPrec <= 0) {
        p++;
        const a = expr(0);
        expect(':');
        const b = expr(0);
        left = { k: 'cond', c: left, a, b };
        continue;
      }
      const info = BIN_PREC[t.v];
      if (!info || info[0] < minPrec) break;
      p++;
      const right = expr(info[1] === 'L' ? info[0] + 1 : info[0]);
      left = { k: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }
  function unary(): Node {
    if (isOp('-') || isOp('!') || isOp('+')) {
      const op = (next() as { v: string }).v;
      return { k: 'un', op, a: expr(7) };
    }
    return primary();
  }
  function primary(): Node {
    const t = next();
    switch (t.t) {
      case 'num': return { k: 'num', v: t.v };
      case 'str': return { k: 'str', v: t.v };
      case 'dice': return { k: 'dice', v: t.v };
      case 'id':
        if (isOp('(')) {
          p++;
          const args: Node[] = [];
          if (!isOp(')')) { do { args.push(expr(0)); } while (isOp(',') && ++p); }
          expect(')');
          return { k: 'call', name: t.v.toLowerCase(), args };
        }
        return { k: 'var', name: t.v };
      case 'op':
        if (t.v === '(') { const e = expr(0); expect(')'); return e; }
    }
    throw new FormulaError(tm('err.unexpectedEnd'));
  }

  const ast = expr(0);
  if (peek().t !== 'eof') throw new FormulaError(tm('err.trailing'));
  return ast;
}

/**
 * Переименовывает переменную `from` в `to` во всех местах формулы (в том числе в путях `from.sub`
 * и с префиксом @). Кубики, функции, строки и похожие имена не затрагиваются. Некорректная
 * формула возвращается как есть.
 */
export function renameVariable(formula: string, from: string, to: string): string {
  let toks: Tok[];
  try { toks = lex(formula); } catch { return formula; }
  let out = '';
  let last = 0;
  toks.forEach((t, i) => {
    if (t.t !== 'id') return;
    const isCall = toks[i + 1]?.t === 'op' && (toks[i + 1] as { v: string }).v === '(';
    if (isCall) return;
    const [root, ...rest] = t.v.split('.');
    if (root !== from) return;
    const prefix = formula[t.s] === '@' ? '@' : '';
    out += formula.slice(last, t.s) + prefix + [to, ...rest].join('.');
    last = t.e;
  });
  return out + formula.slice(last);
}

/** Все переменные, на которые ссылается формула (для графа зависимостей). */
export function dependencies(ast: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    switch (n.k) {
      case 'var': out.add(n.name); break;
      case 'un': walk(n.a); break;
      case 'bin': walk(n.a); walk(n.b); break;
      case 'call': n.args.forEach(walk); break;
      case 'cond': walk(n.c); walk(n.a); walk(n.b); break;
    }
  };
  walk(ast);
  return [...out];
}

export interface Scope {
  [key: string]: Value | Scope;
}
export type FormulaFn = (args: Value[], ctx: EvalContext) => Value;

export interface EvalContext {
  scope: Scope;
  rng: Rng;
  rolls: DiceRoll[];
  functions: Record<string, FormulaFn>;
}

export interface EvalResult {
  value: Value;
  rolls: DiceRoll[];
}

const num = (v: Value, what = tm('err.value')): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  throw new FormulaError(tm('err.needNumber', { what, got: JSON.stringify(v) }));
};
const nums = (args: Value[]): number[] => args.flatMap((a) => (Array.isArray(a) ? a : [num(a)]));
const truthy = (v: Value) => (typeof v === 'string' ? v !== '' : !!v);

export const builtins: Record<string, FormulaFn> = {
  floor: (a) => Math.floor(num(a[0])),
  ceil: (a) => Math.ceil(num(a[0])),
  round: (a) => Math.round(num(a[0])),
  abs: (a) => Math.abs(num(a[0])),
  sqrt: (a) => Math.sqrt(num(a[0])),
  min: (a) => Math.min(...nums(a)),
  max: (a) => Math.max(...nums(a)),
  sum: (a) => nums(a).reduce((x, y) => x + y, 0),
  avg: (a) => { const n = nums(a); return n.reduce((x, y) => x + y, 0) / (n.length || 1); },
  clamp: (a) => Math.min(Math.max(num(a[0]), num(a[1])), num(a[2])),
  if: (a) => (truthy(a[0]) ? a[1] : a[2]) ?? null,
  len: (a) => (Array.isArray(a[0]) ? a[0].length : String(a[0] ?? '').length),
  // roll(count, sides) — бросок из формулы: roll(2, 6) == 2d6
  roll: (a, ctx) => {
    const r = rollDice({ count: num(a[0]), sides: num(a[1]), explode: false }, ctx.rng);
    ctx.rolls.push(r);
    return r.total;
  },
};

function lookup(scope: Scope, path: string): Value {
  let cur: unknown = scope;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else throw new FormulaError(tm('err.unknownVar', { p: path }));
  }
  return cur as Value;
}

function evalNode(n: Node, ctx: EvalContext): Value {
  switch (n.k) {
    case 'num': return n.v;
    case 'str': return n.v;
    case 'dice': {
      const r = rollDice(n.v, ctx.rng);
      ctx.rolls.push(r);
      return r.total;
    }
    case 'var': return lookup(ctx.scope, n.name);
    case 'un': {
      const v = evalNode(n.a, ctx);
      if (n.op === '!') return !truthy(v);
      return n.op === '-' ? -num(v) : num(v);
    }
    case 'cond': return truthy(evalNode(n.c, ctx)) ? evalNode(n.a, ctx) : evalNode(n.b, ctx);
    case 'call': {
      const fn = ctx.functions[n.name];
      if (!fn) throw new FormulaError(tm('err.unknownFn', { n: n.name }));
      // if() вычисляется лениво, чтобы не бросать кубики в неиспользуемой ветке
      if (n.name === 'if' && n.args.length === 3) {
        return truthy(evalNode(n.args[0], ctx)) ? evalNode(n.args[1], ctx) : evalNode(n.args[2], ctx);
      }
      return fn(n.args.map((a) => evalNode(a, ctx)), ctx);
    }
    case 'bin': {
      if (n.op === '&&') { const l = evalNode(n.a, ctx); return truthy(l) ? truthy(evalNode(n.b, ctx)) : false; }
      if (n.op === '||') { const l = evalNode(n.a, ctx); return truthy(l) ? true : truthy(evalNode(n.b, ctx)); }
      const a = evalNode(n.a, ctx), b = evalNode(n.b, ctx);
      switch (n.op) {
        case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': { const d = num(b); if (d === 0) throw new FormulaError(tm('err.divZero')); return num(a) / d; }
        case '%': { const d = num(b); if (d === 0) throw new FormulaError(tm('err.divZero')); return num(a) % d; }
        case '^': return Math.pow(num(a), num(b));
        case '==': return a === b;
        case '!=': return a !== b;
        case '<': return num(a) < num(b);
        case '>': return num(a) > num(b);
        case '<=': return num(a) <= num(b);
        case '>=': return num(a) >= num(b);
      }
    }
  }
  throw new FormulaError(tm('err.unknownNode'));
}

export interface EvalOptions {
  scope?: Scope;
  rng?: Rng;
  /** дополнительные функции (их добавляют плагины) */
  functions?: Record<string, FormulaFn>;
}

export function evaluate(formula: string | Node, opts: EvalOptions = {}): EvalResult {
  const ast = typeof formula === 'string' ? parse(formula) : formula;
  const ctx: EvalContext = {
    scope: opts.scope ?? {},
    rng: opts.rng ?? defaultRng,
    rolls: [],
    functions: { ...builtins, ...opts.functions },
  };
  return { value: evalNode(ast, ctx), rolls: ctx.rolls };
}
