-- World Leaderboard สำหรับ Speed Run mode — เก็บเวลาที่แต่ละคนถึงเส้นชัย ข้ามห้อง/ข้ามเซสชันทั้งหมด
-- รันไฟล์นี้กับ Supabase project ของคุณเอง (Dashboard > SQL Editor หรือ `supabase db push`)
-- ยังไม่ได้ถูกรันอัตโนมัติ — ดู README หัวข้อ World Leaderboard

create table if not exists public.wgw_speedrun_times (
  id bigint generated always as identity primary key,
  player_name text not null check (char_length(player_name) between 1 and 20),
  time_seconds double precision not null check (time_seconds > 0 and time_seconds <= 180),
  room text,
  created_at timestamptz not null default now()
);

create index if not exists wgw_speedrun_times_time_idx
  on public.wgw_speedrun_times (time_seconds asc);

alter table public.wgw_speedrun_times enable row level security;

-- เกมนี้ไม่มีระบบ auth — ทุกคนที่มี anon key (ก็คือทุกคนที่เปิดหน้าเว็บ) ส่งเวลาของตัวเองได้
-- (client-authoritative เหมือนโปรโตคอลเกมส่วนอื่นๆ ตาม ADR-0001 — โกงได้ในทางเทคนิค ยอมรับได้สำหรับ
-- leaderboard เล่นกับเพื่อน)
create policy "anyone can submit a speedrun time"
  on public.wgw_speedrun_times for insert
  to anon
  with check (true);

create policy "anyone can read the leaderboard"
  on public.wgw_speedrun_times for select
  to anon
  using (true);
