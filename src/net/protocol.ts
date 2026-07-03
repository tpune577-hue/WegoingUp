// ข้อความทั้งหมดบนสาย — ตาม ADR-0001:
// - ตำแหน่ง broadcast เป็นระยะ (state)
// - ไอเทมเป็น discrete event, เหยื่อเป็นคน apply ผล (victim-authoritative)

export type ItemType = 'swap' | 'shot' | 'shield' | 'trap';

export type NetMsg =
  | { t: 'hello'; id: string; name: string; reply: boolean }
  | { t: 'bye'; id: string }
  | { t: 'start'; seed: number; players: Array<{ id: string; name: string }> }
  | {
      t: 'state'; id: string;
      x: number; y: number; vx: number; vy: number;
      face: 1 | -1; hp: number; shield: boolean;
      item: ItemType | null; ground: boolean;
    }
  | { t: 'shot'; from: string; x: number; y: number; dir: 1 | -1 }
  // ผู้ยิงตรวจ hit บนจอตัวเอง แล้วส่งให้เหยื่อ apply เอง
  | { t: 'hit'; from: string; to: string; dir: 1 | -1 }
  | { t: 'swapreq'; from: string; to: string; x: number; y: number }
  | { t: 'swapack'; from: string; to: string; x: number; y: number }
  | { t: 'swapblock'; from: string; to: string }
  | { t: 'trap'; id: string; owner: string; x: number; y: number }
  | { t: 'trapfire'; id: string; by: string }
  | { t: 'box'; id: number; by: string }
  | { t: 'win'; id: string };
