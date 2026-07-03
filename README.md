# We go วิ่ง อัพ 🏃⬆️

Party platformer 2D สไตล์ 8-bit — ผู้เล่น 2–8 คนแข่งกันปีนขึ้นยอดด่าน มีไอเทมป่วนกันระหว่างทาง
เลือกโหมดได้ในหน้าล็อบบี้ก่อนกดเริ่มเกม — ดูรายละเอียดออกแบบเต็ม ๆ ใน [CONTEXT.md](CONTEXT.md)

| โหมด | เงื่อนไขชนะ |
|---|---|
| **Race** | คนแรกที่แตะเส้นชัยชนะ, HP หมด = penalty (respawn) |
| **Speed Run** | เล่นต่อจนครบ/หมดเวลา 180 วิ แล้วเทียบเวลาถึงเส้นชัยเป็น leaderboard |
| **Survival** | HP หมด = ตกรอบ (spectate) เหลือคนสุดท้ายชนะ |
| **Lava Map** | เหมือน Survival แต่มีลาวาไล่ขึ้นจากด้านล่าง บังคับให้ปีนตลอดเวลา |

## วิธีรัน

```bash
npm install
npm run dev
```

เปิด http://localhost:5173

**ทดสอบ multiplayer เร็วที่สุด:** เลือก "เครื่องเดียวกัน (ข้ามแท็บ)" → สร้างห้อง → เปิดแท็บใหม่ → เข้าร่วมด้วยรหัสห้องเดียวกัน → กดเริ่มเกม

## วิธีเปิดโหมดออนไลน์ (ข้ามเครื่อง)

Prototype ใช้ Supabase Realtime เป็น transport ตาม [ADR-0001](docs/adr/0001-client-authoritative-no-body-collision.md) (ไม่เขียน game server เอง):

1. สร้างโปรเจกต์ฟรีที่ https://supabase.com (ไม่ต้องสร้างตารางอะไร ใช้แค่ Realtime channel)
2. `cp .env.example .env` แล้วใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` จาก Project Settings → API
3. รีสตาร์ท dev server แล้วเลือก "ออนไลน์ (Supabase)" ที่หน้าเมนู

## ควบคุม

| ปุ่ม | การกระทำ |
|---|---|
| ← → หรือ A D | เดิน |
| Space / W / ↑ | กระโดด (กดสั้น = เตี้ย, กดค้าง = สูง) |
| X / Enter | ใช้ไอเทม |

## กติกา (Race Mode)

- กล้องจอเดียวร่วมกัน follow คนที่อยู่สูงสุด — **หลุดขอบล่างจอ = เสีย 1 หัวใจ** แล้วเกิดใหม่ในจอ
- หัวใจ 3 ดวง หมดแล้วไม่แพ้ (HP เป็น penalty) — รีเซ็ตเป็น 3 แล้วเกิดใหม่
- เก็บ **Mystery Box (?)** ได้ไอเทม 1 ชิ้น (ถือได้ทีละชิ้น) — สุ่มถ่วงน้ำหนักตามอันดับ: คนรั้งท้ายมีสิทธิ์ได้ "สลับที่" คนนำได้ "เกราะ" บ่อยกว่า
- ไอเทม: **สลับที่** (สลับกับคนที่สูงสุด) · **ยิง** (โดนแล้วเสีย HP + กระเด็น) · **เกราะ** (กัน 1 hit ทุกอย่างรวมถึงสลับที่) · **กับดัก** (วางแล้วจางหายใน 2 วิ — เกมความจำ!)

## Leaderboard (Speed Run)

จบรอบ Speed Run แล้วเห็น leaderboard 2 ส่วนแยกกัน:

- **Leaderboard ในเกม** — อันดับเวลาของคนในห้องรอบนี้เท่านั้น (มีอยู่แล้วเดิม)
- **World Leaderboard** — 10 อันดับเวลาที่เร็วที่สุด สะสมข้ามห้อง/ข้ามเซสชันทั้งหมด เก็บถาวรใน Supabase table (คนละเรื่องกับ Realtime broadcast ที่ใช้ sync ตำแหน่งผู้เล่น)

วิธีเปิดใช้งาน World Leaderboard:

1. รัน [`supabase/migrations/0001_speedrun_world_leaderboard.sql`](supabase/migrations/0001_speedrun_world_leaderboard.sql) กับ Supabase project ของคุณ (Dashboard > SQL Editor)
2. ตั้งค่า `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` ใน `.env` (ตัวเดียวกับที่ใช้เปิดโหมดออนไลน์ด้านบน)
3. เล่น Speed Run จบรอบ — แต่ละคนจะส่งเวลาของตัวเองขึ้น World Leaderboard อัตโนมัติตอนถึงเส้นชัย

ถ้ายังไม่ได้ตั้งค่า Supabase ฟีเจอร์นี้จะปิดเงียบๆ (โชว์ "ยังไม่มีข้อมูล" แทนที่จะ error)

⚠️ **ข้อจำกัดที่ตั้งใจ:**
- เวลาแต่ละคนวัดบนด่านที่สุ่ม seed คนละแบบ (ดู ADR-0002) เทียบกันตรงๆ จึงไม่แฟร์ 100% —ยอมรับได้สำหรับ prototype นี้ (ยังไม่ทำ "ranked run ด้วย seed คงที่")
- เวลาที่ส่งเป็น self-reported โดย client (client-authoritative เหมือนโปรโตคอลเกมส่วนอื่นๆ ตาม [ADR-0001](docs/adr/0001-client-authoritative-no-body-collision.md)) จึงโกงได้ในทางเทคนิค — ยอมรับได้สำหรับ leaderboard เล่นกับเพื่อน ไม่ใช่ public ranked

## สถาปัตยกรรม

- [ADR-0001](docs/adr/0001-client-authoritative-no-body-collision.md) — client-authoritative movement: แต่ละเครื่อง sim ตัวเองแล้ว broadcast ตำแหน่ง ~12Hz, ตัวละครไม่ชนกัน, ไอเทมเป็น discrete event ที่เหยื่อ apply ผลเอง (victim-authoritative) — ดู [src/net/protocol.ts](src/net/protocol.ts) และ [src/game/game.ts](src/game/game.ts)
- [ADR-0002](docs/adr/0002-seed-based-chunk-generation.md) — ด่าน = ลำดับ chunk ออกแบบมือ สุ่มจาก seed เดียวที่แชร์ตอนเริ่มรอบ ทุกเครื่อง generate ตรงกันเป๊ะ — ดู [src/game/chunks.ts](src/game/chunks.ts) (กติการอยต่อ chunk อยู่ในคอมเมนต์หัวไฟล์) และ seeded RNG ใน [src/game/rng.ts](src/game/rng.ts)
- Transport สลับได้ 2 แบบใน [src/net/transport.ts](src/net/transport.ts): `BroadcastTransport` (ข้ามแท็บ, สำหรับ dev) และ `SupabaseTransport` (ออนไลน์จริง)

## การตัดสินใจที่ยังเปิดอยู่ (จาก Open Questions) และค่าที่ prototype เลือกไว้ชั่วคราว

- **Respawn ใน Race:** HP หมด = รีเซ็ต 3 ดวง + เกิดใหม่บนแพลตฟอร์มกลางจอ พร้อมอมตะ 2 วิ (ยังไม่ใช่คำตอบสุดท้าย — รอ playtest)
- **Controls:** keyboard-only ไปก่อน
- **Round structure:** รอบเดียวจบ มีปุ่ม "เล่นอีกรอบ"
- กับดักมีเวลา arm 0.75 วิ แล้วโดนได้ทุกคนรวมถึงคนวาง
- **Survival/Lava tie เมื่อคนสุดท้าย 2 คนตกรอบพร้อมกัน:** ยังไม่ resolve (ดู Open Questions ใน CONTEXT.md)
- **Speed Run หลัง finish:** ผู้เล่นยัง freeze แต่ยังโดนไอเทมได้อยู่ — v1 ปล่อยไว้แบบนี้ก่อน
- **Lava rise speed/start delay:** ค่าเริ่มต้นกะคร่าว ๆ ต้องจูนตอน playtest

## เพิ่ม chunk ใหม่

เพิ่ม grid 20×15 ใน `MIDDLE` ของ [src/game/chunks.ts](src/game/chunks.ts) — ทำตามกติการอยต่อในคอมเมนต์ (แถว 1 = exit เสมอที่ cols 8-11, แถว 13 = entry เสมอที่ cols 12-15) แล้ววาง `B` 1 แถวเหนือแพลตฟอร์มสำหรับจุดเกิด Mystery Box

⚠️ **สำคัญ:** แพลตฟอร์มที่ห่างกัน 3 แถว (ระยะกระโดดสูงสุดของตัวละคร) ต้องไม่ทับคอลัมน์กันเกิน 1 ช่อง และไม่ห่างเกิน 2 ช่องว่าง ไม่งั้นผู้เล่นจะกระโดดไม่ผ่าน (หัวโขกใต้แพลตฟอร์มบนก่อนจะพ้นขึ้นไปได้) — นี่คือบั๊กที่เคยเกิดขึ้นจริงกับ chunk เดิม 7 ใน 8 แบบ ก่อนจะแก้ด้วยการจำลองฟิสิกส์ตรวจสอบทุก chunk ดังนั้นเวลาเพิ่ม chunk ใหม่ ให้ตรวจสอบระยะกระโดดจริงจัง (เขียนสคริปต์จำลองด้วยค่าคงที่จาก [src/game/constants.ts](src/game/constants.ts) หรือ diff เทียบกับ chunk ที่ผ่านการตรวจสอบแล้ว) ก่อน merge (ทับคอลัมน์ 2 ช่องก็ยังกระโดดผ่านได้จริง แต่หน้าต่างกระโดดแคบมาก เก็บไว้ใช้เฉพาะ chunk "ชาเลนจ์")

### แพลตฟอร์มเคลื่อนที่ (Mover)

ประกาศแยกจาก grid ตัวอักษรผ่าน `movers` ของแต่ละ chunk (ดู `MoverSpec`/`MOVER_ELEVATOR`/`MOVER_BRIDGE` ใน chunks.ts) เพราะตำแหน่งขยับตามเวลาแบบคลื่นสามเหลี่ยม (ความเร็วคงที่ ตัดสลับทิศทันทีที่สุดราง) คำนวณจาก `simTime` ล้วนๆ จึงตรงกันทุก client โดยไม่ต้อง sync เพิ่ม ผู้เล่นถูก "พา" (carry) ไปกับแพลตฟอร์มเมื่อยืนอยู่บนนั้น (ดู `standingMover`/`nudge` ใน game.ts)

⚠️ **ระวัง:** ตำแหน่ง "บ้าน"/ปลายทางของ mover ต้องเว้นอย่างน้อย 2 แถวจากแพลตฟอร์มตายตัวข้างเคียงถ้าคอลัมน์ทับกัน (เว้นแค่ 1 แถวเจอบั๊กจริง — กล่อง collision ของผู้เล่นที่ยืนบน mover สุดราง ไปชนขอบล่างของแพลตฟอร์มตายตัวข้างบนพอดี เกิด false-positive "ยืนติดพื้น" จนโดนตรึงไม่ตกจริง) และแถวที่ mover เคลื่อนที่ผ่านทั้งเส้นทางต้องโล่ง (ห้ามมี '#' ทับ)
