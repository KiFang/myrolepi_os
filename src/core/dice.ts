import { Rng, defaultRng } from './rng';

export interface DiceSpec {
  count: number;
  /** число граней; 'F' — кубик Fudge (-1,0,+1) */
  sides: number | 'F';
  explode: boolean;
  keep?: { mode: 'high' | 'low'; n: number };
  drop?: { mode: 'high' | 'low'; n: number };
}

export interface DiceRoll {
  notation: string;
  /** все выпавшие значения (включая от взрывов) */
  rolls: number[];
  /** индексы значений, которые учтены в сумме */
  kept: number[];
  total: number;
}

export const DICE_RE = /^(\d*)d(\d+|%|F)((?:!|k[hl]?\d+|d[hl]?\d+)*)/i;

export function parseDice(notation: string): DiceSpec {
  const m = DICE_RE.exec(notation.trim());
  if (!m || m[0].length !== notation.trim().length) throw new Error(`Некорректная запись кубика: "${notation}"`);
  const count = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides: DiceSpec['sides'] = m[2].toUpperCase() === 'F' ? 'F' : m[2] === '%' ? 100 : parseInt(m[2], 10);
  if (count < 0 || count > 1000) throw new Error('Количество кубиков должно быть от 0 до 1000');
  if (sides !== 'F' && (sides < 1 || sides > 100000)) throw new Error('Некорректное число граней');
  const spec: DiceSpec = { count, sides, explode: false };
  const mods = m[3].toLowerCase();
  const re = /!|k([hl]?)(\d+)|d([hl]?)(\d+)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(mods))) {
    if (mm[0] === '!') spec.explode = true;
    else if (mm[0][0] === 'k') spec.keep = { mode: mm[1] === 'l' ? 'low' : 'high', n: parseInt(mm[2], 10) };
    else spec.drop = { mode: mm[3] === 'h' ? 'high' : 'low', n: parseInt(mm[4], 10) };
  }
  if (spec.explode && (spec.sides === 'F' || spec.sides === 1)) throw new Error('Этот кубик нельзя взрывать');
  return spec;
}

export function rollDice(spec: DiceSpec | string, rng: Rng = defaultRng): DiceRoll {
  const s = typeof spec === 'string' ? parseDice(spec) : spec;
  const notation = typeof spec === 'string' ? spec : formatDice(s);
  const rolls: number[] = [];
  const one = () => (s.sides === 'F' ? Math.floor(rng() * 3) - 1 : Math.floor(rng() * s.sides) + 1);
  for (let i = 0; i < s.count; i++) {
    let v = one();
    rolls.push(v);
    let guard = 0;
    while (s.explode && typeof s.sides === 'number' && v === s.sides && guard++ < 100) {
      v = one();
      rolls.push(v);
    }
  }
  let idx = rolls.map((_, i) => i);
  const byValue = (mode: 'high' | 'low') => [...idx].sort((a, b) => (mode === 'high' ? rolls[b] - rolls[a] : rolls[a] - rolls[b]) || a - b);
  if (s.keep) idx = byValue(s.keep.mode).slice(0, s.keep.n);
  if (s.drop) {
    const drop = new Set(byValue(s.drop.mode).slice(0, s.drop.n));
    idx = idx.filter((i) => !drop.has(i));
  }
  idx.sort((a, b) => a - b);
  return { notation, rolls, kept: idx, total: idx.reduce((t, i) => t + rolls[i], 0) };
}

export function formatDice(s: DiceSpec): string {
  let out = `${s.count}d${s.sides}`;
  if (s.explode) out += '!';
  if (s.keep) out += `k${s.keep.mode === 'low' ? 'l' : 'h'}${s.keep.n}`;
  if (s.drop) out += `d${s.drop.mode === 'high' ? 'h' : 'l'}${s.drop.n}`;
  return out;
}
