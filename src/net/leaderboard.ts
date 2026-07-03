// World Leaderboard: อันดับเวลา Speed Run ที่เร็วที่สุด สะสมข้ามห้อง/ข้ามเซสชันทั้งหมด
// เก็บถาวรใน Supabase table (คนละเรื่องกับ Realtime broadcast ใน transport.ts ที่ไม่เก็บอะไรไว้)
// ต้องรัน supabase/migrations/0001_speedrun_world_leaderboard.sql กับโปรเจกต์ Supabase ก่อนใช้งานจริง —
// ถ้ายังไม่ได้ตั้งค่า VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ฟีเจอร์นี้จะปิดเงียบๆ (no-op ไม่ throw)
//
// เวลาที่ส่งเข้ามาเป็น self-reported โดยผู้เล่นแต่ละคน (client-authoritative เหมือนข้อความ
// 'finish'/'win' อื่นๆ ตาม ADR-0001) จึงโกงได้ในทางเทคนิค — ยอมรับได้สำหรับ leaderboard เล่นกับเพื่อน
// ถ้าจะทำ public/ranked จริงจัง ต้อง revisit (ดู ADR-0001 Consequences)

const TABLE = 'wgw_speedrun_times';

export interface WorldScore {
  name: string;
  time: number;
}

let clientPromise: Promise<import('@supabase/supabase-js').SupabaseClient | null> | null = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!url || !key) return null;
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(url, key);
    })();
  }
  return clientPromise;
}

export async function submitWorldTime(name: string, timeSeconds: number, room: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.from(TABLE).insert({ player_name: name, time_seconds: timeSeconds, room });
  } catch {
    // best-effort — ล้มเหลวไม่ควรกวนคนเล่น
  }
}

export async function fetchWorldTop(limit = 10): Promise<WorldScore[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from(TABLE)
      .select('player_name, time_seconds')
      .order('time_seconds', { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => ({
      name: row.player_name as string,
      time: row.time_seconds as number,
    }));
  } catch {
    return [];
  }
}
