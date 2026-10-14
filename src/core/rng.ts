/** Генератор случайных чисел [0,1). Подменяемый — нужен для тестов и воспроизводимых бросков. */
export type Rng = () => number;

export const defaultRng: Rng = () => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 0x1_0000_0000;
  }
  return Math.random();
};

/** Детерминированный генератор (mulberry32) для тестов и «сидов» кампаний. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
