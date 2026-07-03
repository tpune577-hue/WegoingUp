// Seeded RNG (mulberry32) — ห้ามใช้ Math.random กับทุกอย่างที่ต้อง deterministic
// ข้ามทุก client (ลำดับ chunk, ตำแหน่งกล่อง) ตาม ADR-0002

export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

// การสุ่มไอเทม (rubber-banding) ใช้ Math.random ได้ เพราะเกิดบน client เดียว
// แล้ว broadcast ผลเป็น event — ไม่ต้อง deterministic ข้ามเครื่อง
export function weightedPick<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}
