// ข้อความทั้งหมดบนสาย — ตาม ADR-0001:
// - ตำแหน่ง broadcast เป็นระยะ (state)
// - ไอเทมเป็น discrete event, เหยื่อเป็นคน apply ผล (victim-authoritative)

export type ItemType = 'swap' | 'shot' | 'shield' | 'trap';

// race: ใครถึงก่อนชนะ, HP เป็น penalty
// speedrun: ทุกคนถึงเส้นชัยแล้วจับเวลา เล่นต่อจนครบ/หมดเวลา แล้วเทียบ leaderboard
// survival: HP หมด = ตกรอบ (spectate) เหลือคนสุดท้ายชนะ
// lava: เหมือน survival + มี Rising Hazard (ลาวา) ไล่จากล่างขึ้นบน
export type GameMode = 'race' | 'speedrun' | 'survival' | 'lava';

// ทุก msg ในรอบ (ยกเว้น hello/bye/start เอง) พก `seed` ของรอบนั้นติดไปด้วย —
// กัน msg ที่ค้างอยู่ระหว่างทางตอนเปลี่ยนรอบ (เช่นกด "เล่นอีกรอบ" ในห้องเดิม)
// ไปหลุดเข้า Game instance ของรอบใหม่ (เช่น swapack ของรอบเก่ามาเทเลพอร์ตผู้เล่นรอบใหม่)
export type NetMsg =
  | { t: 'hello'; id: string; name: string; reply: boolean }
  | { t: 'bye'; id: string }
  | {
      t: 'start'; seed: number; mode: GameMode;
      players: Array<{ id: string; name: string }>;
    }
  | {
      t: 'state'; id: string; seed: number;
      x: number; y: number; vx: number; vy: number;
      face: 1 | -1; hp: number; shield: boolean;
      item: ItemType | null; ground: boolean;
    }
  | { t: 'shot'; from: string; seed: number; x: number; y: number; dir: 1 | -1 }
  // ผู้ยิงตรวจ hit บนจอตัวเอง แล้วส่งให้เหยื่อ apply เอง
  | { t: 'hit'; from: string; to: string; seed: number; dir: 1 | -1 }
  | { t: 'swapreq'; from: string; to: string; seed: number; x: number; y: number }
  | { t: 'swapack'; from: string; to: string; seed: number; x: number; y: number }
  | { t: 'swapblock'; from: string; to: string; seed: number }
  | { t: 'trap'; id: string; owner: string; seed: number; x: number; y: number }
  | { t: 'trapfire'; id: string; by: string; seed: number }
  | { t: 'box'; id: number; by: string; seed: number }
  | { t: 'win'; id: string; seed: number }
  // survival/lava: ประกาศตัวเองตกรอบ (self-authoritative เหมือนไอเทมอื่น ๆ ตาม ADR-0001)
  | { t: 'eliminated'; id: string; seed: number }
  // speedrun: ประกาศเวลาที่ตัวเองถึงเส้นชัย (วินาทีนับจากเริ่มรอบ)
  | { t: 'finish'; id: string; seed: number; time: number };
