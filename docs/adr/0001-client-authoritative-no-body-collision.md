# ADR-0001: Client-Authoritative Movement, No Player Body Collision

## Status
Accepted

## Context
เกมเป็น online party platformer แบบ shared camera ที่ผู้เล่นแข่งกันปีนขึ้นที่สูง Prototype แรกทำบน web และต้องเล่น online ด้วยกันได้จริง

ถ้าตัวละครผู้เล่นชนกันทางกายภาพ (ผลัก/เบียด/ยืนบนหัวกันได้) ผลลัพธ์ physics จะขึ้นกับตำแหน่งของผู้เล่นทุกคนแบบ frame-perfect ทำให้ต้องมี authoritative physics server หรือ rollback netcode ซึ่ง:
- แพงทั้งเวลา dev และค่ารัน server สำหรับ prototype
- Latency ปกติ (50–100ms) จะสร้างประสบการณ์ "โดนเบียดตกทั้งที่ไม่เห็นใครแตะ" ซึ่งทำลายความสนุกของเกม party

## Decision
1. **ตัวละครผู้เล่นไม่ collide กัน** — ปฏิสัมพันธ์ PvP ทั้งหมดเกิดผ่านไอเทมเท่านั้น
2. **แต่ละ client เป็น authority ของตัวละครตัวเอง** — จำลอง physics เฉพาะตัวเอง แล้ว broadcast ตำแหน่ง (~10–20Hz) ให้คนอื่น render แบบ interpolate
3. **ไอเทมเป็น discrete event** — ยิง/วาง/ใช้ = event เดียว ฝั่งเหยื่อ (victim client) เป็นคน apply ผลกับตัวเอง (victim-authoritative) เพื่อให้ HP ของแต่ละคนมี authority เดียวเสมอ
4. Transport ของ prototype ใช้ realtime channel ที่มีอยู่ (เช่น Supabase Realtime) — ไม่เขียน game server เอง

## Consequences
**ดี:**
- Netcode ของ prototype เล็กมาก — ทำได้ในระดับวัน ไม่ใช่เดือน
- ไม่มีค่า physics server, scale ง่าย
- การเคลื่อนไหวของตัวเองลื่น 100% ไม่มี input lag จาก network
- "สลับที่" กลายเป็น event ธรรมดา (สลับพิกัด) ไม่ใช่ปัญหา physics

**เสีย:**
- เสีย gameplay แบบเหยียบหัว/เบียดเพื่อนด้วยตัวเปล่า
- Victim-authoritative = โกงได้ (client แก้โค้ดไม่รับ damage) — ยอมรับได้ในเกม party เล่นกับเพื่อน แต่ถ้าไปถึง ranked/public matchmaking ต้อง revisit
- ตำแหน่งเพื่อนบนจอคลาดเคลื่อนตาม latency — ไอเทมแบบเล็งยิงต้องออกแบบให้ hitbox ใจดี (generous)

## Revisit เมื่อไหร่
ถ้าเกมพิสูจน์ตัวเองแล้วและจะทำเวอร์ชัน PC/Steam จริงจัง ค่อยประเมิน server-authoritative + rollback อีกครั้ง
