/** FNV-1a + Mulberry32. Versioned and independent of wall-clock/render timing. */
export class SeededRandom {
  private state: number;
  constructor(seed: string | number) {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    this.state = h >>> 0;
  }
  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b-a) * this.next(); }
  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('Empty asset selection');
    return items[Math.floor(this.next()*items.length)]!;
  }
}
