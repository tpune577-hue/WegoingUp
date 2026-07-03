# We go วิ่ง อัพ 🏃⬆️

Party platformer 2D สไตล์ 8-bit — ผู้เล่น 2–8 คนแข่งกันปีนขึ้นยอดด่าน มีไอเทมป่วนกันระหว่างทาง
Prototype นี้เป็น **Race Mode** (ใครแตะเส้นชัยบนสุดก่อน ชนะ) ตามคำแนะนำ MVP ordering ใน [CONTEXT.md](CONTEXT.md)

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

## สถาปัตยกรรม

- [ADR-0001](docs/adr/0001-client-authoritative-no-body-collision.md) — client-authoritative movement: แต่ละเครื่อง sim ตัวเองแล้ว broadcast ตำแหน่ง ~12Hz, ตัวละครไม่ชนกัน, ไอเทมเป็น discrete event ที่เหยื่อ apply ผลเอง (victim-authoritative) — ดู [src/net/protocol.ts](src/net/protocol.ts) และ [src/game/game.ts](src/game/game.ts)
- [ADR-0002](docs/adr/0002-seed-based-chunk-generation.md) — ด่าน = ลำดับ chunk ออกแบบมือ สุ่มจาก seed เดียวที่แชร์ตอนเริ่มรอบ ทุกเครื่อง generate ตรงกันเป๊ะ — ดู [src/game/chunks.ts](src/game/chunks.ts) (กติการอยต่อ chunk อยู่ในคอมเมนต์หัวไฟล์) และ seeded RNG ใน [src/game/rng.ts](src/game/rng.ts)
- Transport สลับได้ 2 แบบใน [src/net/transport.ts](src/net/transport.ts): `BroadcastTransport` (ข้ามแท็บ, สำหรับ dev) และ `SupabaseTransport` (ออนไลน์จริง)

## การตัดสินใจที่ยังเปิดอยู่ (จาก Open Questions) และค่าที่ prototype เลือกไว้ชั่วคราว

- **Respawn ใน Race:** HP หมด = รีเซ็ต 3 ดวง + เกิดใหม่บนแพลตฟอร์มกลางจอ พร้อมอมตะ 2 วิ (ยังไม่ใช่คำตอบสุดท้าย — รอ playtest)
- **Controls:** keyboard-only ไปก่อน
- **Round structure:** รอบเดียวจบ มีปุ่ม "เล่นอีกรอบ"
- **Survival Mode / Rising Hazard:** ยังไม่ทำ (ตาม MVP ordering)
- กับดักมีเวลา arm 0.75 วิ แล้วโดนได้ทุกคนรวมถึงคนวาง

## เพิ่ม chunk ใหม่

เพิ่ม grid 20×15 ใน `MIDDLE` ของ [src/game/chunks.ts](src/game/chunks.ts) — ทำตามกติการอยต่อในคอมเมนต์ (แถว 1 = exit เสมอที่ cols 8-11, แถว 13 = entry เสมอที่ cols 12-15) แล้ววาง `B` 1 แถวเหนือแพลตฟอร์มสำหรับจุดเกิด Mystery Box

⚠️ **สำคัญ:** แพลตฟอร์มที่ห่างกัน 3 แถว (ระยะกระโดดสูงสุดของตัวละคร) ต้องไม่ทับคอลัมน์กันเกิน 1 ช่อง และไม่ห่างเกิน 2 ช่องว่าง ไม่งั้นผู้เล่นจะกระโดดไม่ผ่าน (หัวโขกใต้แพลตฟอร์มบนก่อนจะพ้นขึ้นไปได้) — นี่คือบั๊กที่เคยเกิดขึ้นจริงกับ chunk เดิม 7 ใน 8 แบบ ก่อนจะแก้ด้วยการจำลองฟิสิกส์ตรวจสอบทุก chunk ดังนั้นเวลาเพิ่ม chunk ใหม่ ให้ตรวจสอบระยะกระโดดจริงจัง (เขียนสคริปต์จำลองด้วยค่าคงที่จาก [src/game/constants.ts](src/game/constants.ts) หรือ diff เทียบกับ chunk ที่ผ่านการตรวจสอบแล้ว) ก่อน merge
