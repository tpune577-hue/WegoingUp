import * as C from './constants';
import { isSolid } from './chunks';
import type { Game } from './game';
import type { ItemType } from '../net/protocol';

export function draw(g: Game, ctx: CanvasRenderingContext2D) {
  const now = g.now(); // เวลาจริง — เฉพาะ animation ประดับ (ธงโบก, กล่องเด้ง)
  const sim = g.simTime; // เวลาเกม — ทุกอย่างที่ผูกกับ gameplay timer
  const camY = g.camY;

  drawBackground(g, ctx);
  drawTiles(g, ctx);
  drawGoal(g, ctx, now);
  drawBoxes(g, ctx, now, sim);
  drawTraps(g, ctx, sim);
  drawShots(g, ctx);
  if (g.mode === 'lava') drawLava(g, ctx, now);

  for (const r of g.remotes.values()) {
    if (r.eliminated) continue;
    drawPlayer(ctx, camY, r.x, r.y, r.face, r.color, r.name, r.shield, r.item, false);
  }
  const blink = sim < g.invulnUntil && Math.floor(now * 10) % 2 === 0;
  if (!blink && !g.eliminated) {
    drawPlayer(
      ctx, camY, g.px, g.py, g.face, g.self.color, g.self.name,
      g.shield, g.item, true,
    );
  }

  drawHud(g, ctx, sim);
}

function drawBackground(g: Game, ctx: CanvasRenderingContext2D) {
  // สีท้องฟ้าไล่ตามความสูงที่ปีนขึ้นไป
  const progress = 1 - g.camY / Math.max(1, g.level.heightPx - C.VIEW_H);
  const top = lerpColor([26, 24, 48], [72, 34, 90], progress);
  const bottom = lerpColor([16, 14, 31], [36, 22, 60], progress);
  const grad = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

  // ดาวประดับ (ตำแหน่ง deterministic จาก index)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 73) % C.VIEW_W;
    const wy = (i * 149) % g.level.heightPx;
    const sy = wy - g.camY * (0.4 + (i % 3) * 0.15); // parallax
    const yy = ((sy % C.VIEW_H) + C.VIEW_H) % C.VIEW_H;
    ctx.fillRect(sx, yy, 1, 1);
  }
}

function drawTiles(g: Game, ctx: CanvasRenderingContext2D) {
  const r0 = Math.max(0, Math.floor(g.camY / C.TILE));
  const r1 = Math.min(g.level.rows - 1, Math.floor((g.camY + C.VIEW_H) / C.TILE) + 1);
  for (let row = r0; row <= r1; row++) {
    for (let col = 0; col < g.level.cols; col++) {
      if (!isSolid(g.level, col, row)) continue;
      const x = col * C.TILE;
      const y = row * C.TILE - g.camY;
      ctx.fillStyle = '#6b5a96';
      ctx.fillRect(x, y, C.TILE, C.TILE);
      ctx.fillStyle = '#8a77bd';
      ctx.fillRect(x, y, C.TILE, 3);
      ctx.fillStyle = '#4a3d6e';
      ctx.fillRect(x, y + C.TILE - 2, C.TILE, 2);
      ctx.fillRect(x + C.TILE - 2, y, 2, C.TILE);
      // ลายอิฐ
      ctx.fillStyle = '#5a4a80';
      ctx.fillRect(x + (row % 2 ? 4 : 10), y + 6, 2, 2);
    }
  }
}

function drawGoal(g: Game, ctx: CanvasRenderingContext2D, now: number) {
  const y = g.level.goalY - g.camY;
  if (y < -20 || y > C.VIEW_H + 20) return;
  // เส้นชัยลายตาราง + ธง
  for (let x = 0; x < C.VIEW_W; x += 8) {
    ctx.fillStyle = (x / 8) % 2 === 0 ? '#ffd34d' : '#2a2340';
    ctx.fillRect(x, y - 3, 8, 3);
  }
  const wave = Math.sin(now * 4) * 2;
  ctx.fillStyle = '#eee';
  ctx.fillRect(C.VIEW_W / 2 - 1, y - 26, 2, 24);
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.moveTo(C.VIEW_W / 2 + 1, y - 26);
  ctx.lineTo(C.VIEW_W / 2 + 14 + wave, y - 21);
  ctx.lineTo(C.VIEW_W / 2 + 1, y - 16);
  ctx.fill();
}

function drawBoxes(g: Game, ctx: CanvasRenderingContext2D, now: number, sim: number) {
  for (const b of g.level.boxes) {
    const until = g.boxTakenUntil.get(b.id);
    if (until !== undefined && sim < until) continue;
    const bob = Math.sin(now * 3 + b.id) * 2;
    const x = b.x - 7;
    const y = b.y - 7 - g.camY + bob;
    if (y < -20 || y > C.VIEW_H + 20) continue;
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(x, y, 14, 14);
    ctx.fillStyle = '#b3541e';
    ctx.fillRect(x, y, 14, 2);
    ctx.fillRect(x, y + 12, 14, 2);
    ctx.fillStyle = '#2a2340';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('?', b.x, b.y - g.camY + 4 + bob);
  }
}

function drawTraps(g: Game, ctx: CanvasRenderingContext2D, sim: number) {
  for (const t of g.traps.values()) {
    // จางหายใน ~2 วิ (เกมความจำ) — ยังทำงานอยู่แม้มองไม่เห็น
    const age = sim - t.placed;
    const alpha = Math.max(0, 1 - age / C.TRAP_FADE);
    if (alpha <= 0) continue;
    const x = t.x;
    const y = t.y + 8 - g.camY;
    if (y < -20 || y > C.VIEW_H + 20) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff5c5c';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 4, y);
      ctx.lineTo(x + i * 4 + 2, y - 6);
      ctx.lineTo(x + i * 4 + 4, y);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawShots(g: Game, ctx: CanvasRenderingContext2D) {
  for (const s of g.shots) {
    const y = s.y - g.camY;
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x - 2, y - 2, 4, 4);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(s.x - s.dir * 5, y - 1, 4, 2); // หางกระสุน
  }
}

function drawLava(g: Game, ctx: CanvasRenderingContext2D, now: number) {
  const y = g.lavaY - g.camY;
  if (y > C.VIEW_H) return; // ลาวายังไม่เข้าจอ
  const top = Math.max(0, y);
  const grad = ctx.createLinearGradient(0, top, 0, top + 16);
  grad.addColorStop(0, '#ffb13d');
  grad.addColorStop(1, '#c2280f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, C.VIEW_W, 16);
  ctx.fillStyle = '#c2280f';
  ctx.fillRect(0, top + 16, C.VIEW_W, C.VIEW_H - top);
  // ผิวคลื่น + ฟองอากาศประดับ
  ctx.fillStyle = '#ffd97a';
  for (let x = 0; x < C.VIEW_W; x += 10) {
    const h = 2 + Math.sin(now * 3 + x * 0.3) * 1.5;
    ctx.fillRect(x, top - h, 6, h + 2);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  camY: number,
  x: number,
  y: number,
  face: 1 | -1,
  color: string,
  name: string,
  shield: boolean,
  item: ItemType | null,
  isSelf: boolean,
) {
  const sy = y - camY;
  if (sy < -40 || sy > C.VIEW_H + 40) return;

  // ตัวละคร 8-bit อย่างง่าย
  ctx.fillStyle = color;
  ctx.fillRect(x, sy, C.PLAYER_W, C.PLAYER_H);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, sy + C.PLAYER_H - 3, C.PLAYER_W, 3); // ขา/เงา
  ctx.fillStyle = '#fff';
  const eyeX = face === 1 ? x + 7 : x + 3;
  ctx.fillRect(eyeX, sy + 3, 2, 3);

  if (shield) {
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + C.PLAYER_W / 2, sy + C.PLAYER_H / 2, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ไอเทมที่ถือ ลอยเหนือหัว — ทุกคนมองเห็น (CONTEXT.md — Mystery Box)
  if (item) drawItemIcon(ctx, item, x + C.PLAYER_W / 2, sy - 14);

  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = isSelf ? '#ffd34d' : 'rgba(255,255,255,0.8)';
  ctx.fillText(name, x + C.PLAYER_W / 2, sy - 4);
}

function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  item: ItemType,
  cx: number,
  cy: number,
) {
  switch (item) {
    case 'shot':
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 3, cy - 2, 6, 4);
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(cx + 3, cy - 1, 2, 2);
      break;
    case 'shield':
      ctx.strokeStyle = '#78dcff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'trap':
      ctx.fillStyle = '#ff5c5c';
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + 3);
      ctx.lineTo(cx, cy - 4);
      ctx.lineTo(cx + 4, cy + 3);
      ctx.fill();
      break;
    case 'swap':
      ctx.fillStyle = '#7de07d';
      ctx.fillRect(cx - 4, cy - 1, 3, 5); // ลูกศรลง (แท่ง)
      ctx.fillRect(cx + 1, cy - 4, 3, 5); // ลูกศรขึ้น (แท่ง)
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + 3);
      ctx.lineTo(cx - 2.5, cy + 6);
      ctx.lineTo(cx, cy + 3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx + 2.5, cy - 7);
      ctx.lineTo(cx + 5, cy - 3);
      ctx.fill();
      break;
  }
}

function drawHud(g: Game, ctx: CanvasRenderingContext2D, now: number) {
  if (g.eliminated) {
    drawSpectatorHud(g, ctx);
    return;
  }

  // หัวใจ (HP)
  for (let i = 0; i < C.START_HP; i++) {
    drawHeart(ctx, 6 + i * 12, 6, i < g.hp);
  }

  // ช่องไอเทม
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(C.VIEW_W - 24, 5, 18, 18);
  if (g.item) drawItemIcon(ctx, g.item, C.VIEW_W - 15, 14);

  // อันดับ
  const { rank, total } = g.rank();
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`อันดับ ${rank}/${total}`, 6, C.VIEW_H - 6);

  // ความสูง
  const height = Math.max(0, Math.round((g.level.heightPx - (g.py + C.PLAYER_H)) / C.TILE));
  ctx.textAlign = 'right';
  ctx.fillText(`${height}m`, C.VIEW_W - 6, C.VIEW_H - 6);

  if (g.mode === 'speedrun') drawSpeedrunHud(g, ctx, now);
  if (g.mode === 'lava') drawLavaHud(g, ctx, now);

  // นับถอยหลัง
  const remain = g.startedAt - now;
  if (remain > 0) {
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(`${Math.ceil(remain)}`, C.VIEW_W / 2, C.VIEW_H / 2 - 20);
  } else if (remain > -0.8) {
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7de07d';
    ctx.fillText('GO!', C.VIEW_W / 2, C.VIEW_H / 2 - 20);
  }
}

function drawLavaHud(g: Game, ctx: CanvasRenderingContext2D, sim: number) {
  const remain = g.startedAt + C.LAVA_START_DELAY - sim;
  if (remain <= 0) return;
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff8c42';
  ctx.fillText(`ลาวาเริ่มไหลใน ${Math.ceil(remain)}วิ`, C.VIEW_W / 2, 12);
}

function drawSpectatorHud(g: Game, ctx: CanvasRenderingContext2D) {
  let alive = 0;
  for (const r of g.remotes.values()) if (!r.eliminated) alive++;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5c7a';
  ctx.fillText('☠ ตกรอบ — รอดูจนจบ', C.VIEW_W / 2, 14);
  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`เหลือ ${alive} คน`, C.VIEW_W / 2, 26);
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function drawSpeedrunHud(g: Game, ctx: CanvasRenderingContext2D, sim: number) {
  // นาฬิกาจับเวลา กลางบนจอ — หยุดนิ่งที่เวลาเข้าเส้นชัยของตัวเองถ้าจบแล้ว
  const elapsed = g.finished
    ? (g.finishOrder.get(g.self.id) ?? 0)
    : Math.max(0, sim - g.startedAt);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = g.finished ? '#7de07d' : '#fff';
  ctx.fillText(formatTime(elapsed), C.VIEW_W / 2, 12);

  // mini leaderboard มุมขวาบน — คนที่ถึงเส้นชัยแล้วเรียงตามเวลา
  const rows = [...g.finishOrder.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4);
  ctx.font = '6px monospace';
  ctx.textAlign = 'right';
  rows.forEach(([id, time], i) => {
    const name = id === g.self.id ? g.self.name : (g.remotes.get(id)?.name ?? '???');
    ctx.fillStyle = id === g.self.id ? '#ffd34d' : 'rgba(255,255,255,0.7)';
    ctx.fillText(`${i + 1}. ${name} ${formatTime(time)}`, C.VIEW_W - 4, 28 + i * 8);
  });
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, full: boolean) {
  ctx.fillStyle = full ? '#ff5c7a' : 'rgba(255,255,255,0.15)';
  // หัวใจ pixel 9x8
  ctx.fillRect(x + 1, y, 3, 2);
  ctx.fillRect(x + 5, y, 3, 2);
  ctx.fillRect(x, y + 2, 9, 3);
  ctx.fillRect(x + 1, y + 5, 7, 1);
  ctx.fillRect(x + 2, y + 6, 5, 1);
  ctx.fillRect(x + 3, y + 7, 3, 1);
  ctx.fillRect(x + 4, y + 8, 1, 1);
}

function lerpColor(a: number[], b: number[], f: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
