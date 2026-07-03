import { buildLevel, isSolid, type Level } from './chunks';
import * as C from './constants';
import { weightedPick } from './rng';
import type { GameMode, ItemType, NetMsg } from '../net/protocol';
import type { Transport } from '../net/transport';
import { draw } from './render';

export interface RosterEntry {
  id: string;
  name: string;
  color: string;
}

interface Snap {
  t: number;
  x: number;
  y: number;
  face: 1 | -1;
}

// ผู้เล่นคนอื่น — เครื่องเราแค่ render จาก state ที่เขา broadcast มา
// (interpolate ย้อนหลังเล็กน้อยให้ลื่น) ตาม ADR-0001
export class RemotePlayer {
  buf: Snap[] = [];
  x = 0;
  y = 0;
  face: 1 | -1 = 1;
  hp = C.START_HP;
  shield = false;
  item: ItemType | null = null;
  eliminated = false; // survival/lava
  constructor(
    public id: string,
    public name: string,
    public color: string,
  ) {}

  push(s: Snap) {
    this.buf.push(s);
    const cutoff = s.t - 2;
    while (this.buf.length > 2 && this.buf[0].t < cutoff) this.buf.shift();
  }

  sample(now: number) {
    const t = now - C.INTERP_DELAY;
    const b = this.buf;
    if (b.length === 0) return;
    if (b.length === 1 || t <= b[0].t) {
      ({ x: this.x, y: this.y, face: this.face } = b[0]);
      return;
    }
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= t) {
        const a = b[i];
        const nxt = b[i + 1];
        if (!nxt) {
          ({ x: this.x, y: this.y, face: this.face } = a);
          return;
        }
        const f = (t - a.t) / Math.max(1e-6, nxt.t - a.t);
        this.x = a.x + (nxt.x - a.x) * f;
        this.y = a.y + (nxt.y - a.y) * f;
        this.face = f < 0.5 ? a.face : nxt.face;
        return;
      }
    }
    ({ x: this.x, y: this.y, face: this.face } = b[b.length - 1]);
  }
}

export interface Trap {
  id: string;
  owner: string;
  x: number;
  y: number;
  placed: number;
}

export interface Projectile {
  x: number;
  y: number;
  dir: 1 | -1;
  owner: string;
  born: number;
}

const COUNTDOWN = 3;

export interface FinishRow {
  name: string;
  time: number | null; // null = DNF
}

export class Game {
  level: Level;
  camY: number;
  lavaY: number; // lava mode: px จากบน — ทุกอย่างต่ำกว่าเส้นนี้คือลาวา
  private roundSeed: number; // ติดไปกับทุก msg กัน msg รอบเก่าหลุดเข้ารอบใหม่ (กด "เล่นอีกรอบ" ในห้องเดิม)
  remotes = new Map<string, RemotePlayer>();
  traps = new Map<string, Trap>();
  shots: Projectile[] = [];
  boxTakenUntil = new Map<number, number>(); // boxId -> เวลา respawn (clock ท้องถิ่น)

  // ตัวเราเอง — client นี้เป็น authority เต็มตัว (ADR-0001)
  px: number;
  py: number;
  vx = 0;
  vy = 0;
  face: 1 | -1 = 1;
  ground = false;
  hp = C.START_HP;
  shield = false;
  item: ItemType | null = null;
  stunUntil = 0;
  invulnUntil = 0;

  // speedrun: เข้าเส้นชัยแล้วแต่รอบยังไม่จบ (รอคนอื่น/หมดเวลา)
  finished = false;
  finishOrder = new Map<string, number>(); // id -> เวลาที่ถึงเส้นชัย (วินาทีนับจากเริ่มรอบ)

  // survival/lava: HP หมด = ตกรอบ กลายเป็นผู้ชม ทำอะไรไม่ได้
  eliminated = false;

  // นาฬิกาของเกม เดินเฉพาะตอน tick (fixed timestep) — timer เกมทุกตัว
  // (invuln, stun, countdown, trap, กระสุน) ต้องใช้ตัวนี้ ห้ามใช้เวลาจริง
  // ไม่งั้นตอน browser throttle แท็บ timer จะหมดอายุเร็วกว่า sim
  simTime = 0;
  startedAt: number;
  ended = false;
  winnerName: string | null = null;
  onEnd: ((winnerName: string) => void) | null = null;
  onFinishBoard: ((rows: FinishRow[]) => void) | null = null;

  self: RosterEntry;

  private keys = new Set<string>();
  private jumpBufferedAt = -1;
  private coyoteAt = -1;
  private sendAcc = 0;
  private trapCounter = 0;
  private rafId = 0;
  private lastFrame = 0;
  private acc = 0;
  private ctx: CanvasRenderingContext2D;
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.keys.add(e.key.toLowerCase());
    if ([' ', 'w', 'arrowup'].includes(e.key.toLowerCase())) {
      this.jumpBufferedAt = this.simTime;
    }
    if (['x', 'enter'].includes(e.key.toLowerCase())) this.useItem();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  constructor(
    canvas: HTMLCanvasElement,
    private transport: Transport,
    private selfId: string,
    public roster: RosterEntry[],
    seed: number,
    public mode: GameMode = 'race',
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.roundSeed = seed;
    this.level = buildLevel(seed);
    this.camY = this.level.heightPx - C.VIEW_H;
    this.lavaY = this.level.heightPx;

    const self = roster.find((r) => r.id === selfId);
    this.self = self ?? { id: selfId, name: '???', color: '#fff' };
    const idx = Math.max(0, roster.findIndex((r) => r.id === selfId));
    // เรียงหน้ากระดานบนพื้น start chunk ตามลำดับใน roster
    const spread = C.VIEW_W / (roster.length + 1);
    this.px = spread * (idx + 1) - C.PLAYER_W / 2;
    this.py = this.level.spawnY - C.PLAYER_H;

    for (const r of roster) {
      if (r.id === selfId) continue;
      const rp = new RemotePlayer(r.id, r.name, r.color);
      const rIdx = roster.findIndex((e) => e.id === r.id);
      rp.x = spread * (rIdx + 1) - C.PLAYER_W / 2;
      rp.y = this.level.spawnY - C.PLAYER_H;
      this.remotes.set(r.id, rp);
    }

    this.startedAt = COUNTDOWN;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  now(): number {
    return performance.now() / 1000;
  }

  start() {
    this.lastFrame = this.now();
    const loop = () => {
      const t = this.now();
      let frame = t - this.lastFrame;
      this.lastFrame = t;
      if (frame > 0.25) frame = 0.25;
      this.acc += frame;
      while (this.acc >= C.DT) {
        this.tick(C.DT);
        this.acc -= C.DT;
      }
      for (const r of this.remotes.values()) r.sample(t);
      draw(this, this.ctx);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  removePlayer(id: string) {
    this.remotes.delete(id);
  }

  // ---------- simulation ----------

  private tick(dt: number) {
    this.simTime += dt;
    const now = this.simTime;
    if (!this.ended) {
      if (this.mode === 'lava') this.updateLava(dt, now); // สถานะ global — เดินต่อแม้เรา eliminated แล้ว
      if (!this.eliminated) {
        this.updateSelf(dt, now);
        this.checkFallOut(now);
        this.checkBoxes(now);
        this.checkTraps(now);
        if (this.mode === 'lava') this.checkLava(now);
      }
      this.updateShots(dt, now);
      this.updateCamera(dt);
      this.checkWin();
      this.checkSurvivalWin();
      if (this.mode === 'speedrun' && now >= this.startedAt + C.SPEEDRUN_TIME_LIMIT) {
        this.finishSpeedrun();
      }
    }
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / C.POS_SEND_HZ) {
      this.sendAcc = 0;
      this.sendState();
    }
  }

  private updateSelf(dt: number, now: number) {
    const frozen = now < this.startedAt || now < this.stunUntil || this.finished;
    const left = this.keys.has('arrowleft') || this.keys.has('a');
    const right = this.keys.has('arrowright') || this.keys.has('d');

    if (!frozen) {
      let move = 0;
      if (left) move -= 1;
      if (right) move += 1;
      this.vx = move * C.MOVE_SPEED;
      if (move !== 0) this.face = move as 1 | -1;
    } else {
      this.vx = 0;
    }

    this.vy = Math.min(this.vy + C.GRAVITY * dt, C.MAX_FALL);

    if (this.ground) this.coyoteAt = now;
    const wantJump = now - this.jumpBufferedAt < 0.1;
    const canJump = now - this.coyoteAt < 0.08;
    if (!frozen && wantJump && canJump) {
      this.vy = -C.JUMP_VEL;
      this.jumpBufferedAt = -1;
      this.coyoteAt = -1;
    }
    // ปล่อยปุ่มกลางอากาศ = กระโดดเตี้ยลง (variable jump)
    const holdingJump =
      this.keys.has(' ') || this.keys.has('w') || this.keys.has('arrowup');
    if (this.vy < -140 && !holdingJump) this.vy = -140;

    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);
  }

  private collides(x: number, y: number): boolean {
    const c0 = Math.floor(x / C.TILE);
    const c1 = Math.floor((x + C.PLAYER_W - 1) / C.TILE);
    const r0 = Math.floor(y / C.TILE);
    const r1 = Math.floor((y + C.PLAYER_H - 1) / C.TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (isSolid(this.level, c, r)) return true;
      }
    }
    return false;
  }

  private moveX(d: number) {
    const sign = Math.sign(d);
    let remaining = Math.abs(d);
    while (remaining > 0) {
      const inc = Math.min(1, remaining);
      const nx = this.px + inc * sign;
      if (this.collides(nx, this.py)) {
        this.vx = 0;
        break;
      }
      this.px = nx;
      remaining -= inc;
    }
  }

  private moveY(d: number) {
    const sign = Math.sign(d);
    let remaining = Math.abs(d);
    this.ground = false;
    while (remaining > 0) {
      const inc = Math.min(1, remaining);
      const ny = this.py + inc * sign;
      if (this.collides(this.px, ny)) {
        if (sign > 0) this.ground = true;
        this.vy = 0;
        break;
      }
      this.py = ny;
      remaining -= inc;
    }
    if (sign === 0 && this.collides(this.px, this.py + 1)) this.ground = true;
    if (this.vy === 0 && this.collides(this.px, this.py + 1)) this.ground = true;
  }

  // กล้องตาม "ผู้เล่นที่อยู่สูงสุดของฉาก" และไม่เลื่อนลง — ขอบล่างจอคือเส้นอันตราย
  private updateCamera(dt: number) {
    // spectator (eliminated) ไม่ผูกกล้อง — follow เฉพาะผู้เล่นที่ยังไม่ตกรอบ
    let highest: number | null = this.eliminated ? null : this.py;
    for (const r of this.remotes.values()) {
      if (r.eliminated) continue;
      if (highest === null || r.y < highest) highest = r.y;
    }
    if (highest === null) return; // ทุกคนตกรอบพร้อมกัน — กล้องหยุดนิ่ง (edge case)
    let desired = Math.max(
      0,
      Math.min(highest - C.VIEW_H * 0.45, this.level.heightPx - C.VIEW_H),
    );
    // lava mode: กล้องถูกลาวาลากขึ้นด้วย ไม่ต้องรอผู้เล่นคนนำอย่างเดียว ("ด่านขยับขึ้นเอง")
    if (this.mode === 'lava') desired = Math.min(desired, this.lavaY - C.VIEW_H);
    if (desired < this.camY) {
      this.camY += (desired - this.camY) * Math.min(1, dt * 4);
    }
  }

  private checkFallOut(now: number) {
    if (this.py > this.camY + C.VIEW_H + 12) {
      this.takeDamage(now, { respawn: true });
    }
  }

  private updateLava(dt: number, now: number) {
    if (now < this.startedAt + C.LAVA_START_DELAY) return;
    // clamp ไม่ให้ไล่เลย goal chunk กัน unwinnable state
    this.lavaY = Math.max(this.level.goalY - 8, this.lavaY - C.LAVA_RISE_SPEED * dt);
  }

  private checkLava(now: number) {
    if (this.py + C.PLAYER_H > this.lavaY) {
      this.takeDamage(now, { knockUp: true });
    }
  }

  private updateShots(dt: number, now: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.dir * C.SHOT_SPEED * dt;
      const col = Math.floor(s.x / C.TILE);
      const row = Math.floor(s.y / C.TILE);
      let dead = now - s.born > C.SHOT_LIFE || isSolid(this.level, col, row);
      // ผู้ยิงตรวจ hit บนจอตัวเอง (hitbox ใจดี) แล้วส่ง event ให้เหยื่อ apply เอง
      if (!dead && s.owner === this.selfId) {
        for (const r of this.remotes.values()) {
          if (r.eliminated) continue;
          const cx = r.x + C.PLAYER_W / 2;
          const cy = r.y + C.PLAYER_H / 2;
          if (
            Math.abs(s.x - cx) < C.SHOT_HITBOX &&
            Math.abs(s.y - cy) < C.SHOT_HITBOX
          ) {
            this.transport.send({
              t: 'hit', from: this.selfId, to: r.id, seed: this.roundSeed, dir: s.dir,
            });
            dead = true;
            break;
          }
        }
      }
      if (dead) this.shots.splice(i, 1);
    }
  }

  private checkBoxes(now: number) {
    if (this.item !== null) return;
    const cx = this.px + C.PLAYER_W / 2;
    const cy = this.py + C.PLAYER_H / 2;
    for (const b of this.level.boxes) {
      const until = this.boxTakenUntil.get(b.id);
      if (until !== undefined && now < until) continue;
      if (Math.abs(cx - b.x) < 12 && Math.abs(cy - b.y) < 12) {
        this.boxTakenUntil.set(b.id, now + C.BOX_RESPAWN);
        this.item = this.rollItem();
        this.transport.send({ t: 'box', id: b.id, by: this.selfId, seed: this.roundSeed });
        this.sendState();
        break;
      }
    }
  }

  // Rubber-banding: ถ่วงน้ำหนักตามอันดับความสูง (CONTEXT.md — Mystery Box)
  private rollItem(): ItemType {
    const heights: Array<[string, number]> = [[this.selfId, this.py]];
    for (const r of this.remotes.values()) {
      if (r.eliminated) continue;
      heights.push([r.id, r.y]);
    }
    heights.sort((a, b) => a[1] - b[1]); // y น้อย = สูงกว่า = อันดับดีกว่า
    const idx = heights.findIndex(([id]) => id === this.selfId);
    const f = heights.length <= 1 ? 1 : idx / (heights.length - 1); // 0=ผู้นำ 1=บ๊วย
    return weightedPick<ItemType>([
      ['shield', 1 + 2.5 * (1 - f)], // ผู้นำได้ไอเทมรับมากกว่า
      ['shot', 2],
      ['trap', 1.5],
      ['swap', f >= 0.5 ? 2.5 * f : 0], // จำกัดให้ท้ายตารางเท่านั้น (กันสลับวน 1-2)
    ]);
  }

  private checkTraps(now: number) {
    for (const trap of this.traps.values()) {
      if (now - trap.placed < C.TRAP_ARM) continue;
      const overlap =
        this.px < trap.x + 12 &&
        this.px + C.PLAYER_W > trap.x &&
        this.py < trap.y + 8 &&
        this.py + C.PLAYER_H > trap.y;
      if (overlap && now >= this.invulnUntil) {
        // เหยื่อเป็นคนตัดสิน + apply ผลเอง (victim-authoritative)
        this.traps.delete(trap.id);
        this.transport.send({ t: 'trapfire', id: trap.id, by: this.selfId, seed: this.roundSeed });
        this.takeDamage(now, { stun: true });
        return;
      }
      // กับดักที่หลุดขอบล่างจอถูกลบทิ้ง (ทุกเครื่องลบเองตรงกันเพราะกล้อง ratchet ขึ้น)
      if (trap.y > this.camY + C.VIEW_H + 40) this.traps.delete(trap.id);
    }
  }

  private checkWin() {
    if (this.py + C.PLAYER_H > this.level.goalY + 2) return;
    if (this.mode === 'speedrun') {
      if (this.finished) return;
      this.finished = true;
      const time = this.simTime - this.startedAt;
      this.finishOrder.set(this.selfId, time);
      this.transport.send({ t: 'finish', id: this.selfId, seed: this.roundSeed, time });
      this.maybeEndSpeedrun();
      return;
    }
    if (this.mode === 'survival' || this.mode === 'lava') return; // เส้นชัยไม่มีผลในโหมดนี้
    this.transport.send({ t: 'win', id: this.selfId, seed: this.roundSeed });
    this.finish(this.selfId);
  }

  // เช็คทุก tick — เฉพาะ client ที่ยังรอดจริงเท่านั้นที่จะเห็นเงื่อนไขนี้เป็นจริง
  // จึงไม่มีสอง client ประกาศชนะพร้อมกัน (ยกเว้นตกรอบพร้อมกันเป็นคู่สุดท้าย — ดู CONTEXT.md)
  private checkSurvivalWin() {
    if (this.mode !== 'survival' && this.mode !== 'lava') return;
    if (this.ended || this.eliminated) return;
    let alive = 1;
    for (const r of this.remotes.values()) if (!r.eliminated) alive++;
    if (alive <= 1) {
      this.transport.send({ t: 'win', id: this.selfId, seed: this.roundSeed });
      this.finish(this.selfId);
    }
  }

  private maybeEndSpeedrun() {
    if (this.finishOrder.size >= this.roster.length) this.finishSpeedrun();
  }

  private finishSpeedrun() {
    if (this.ended) return;
    this.ended = true;
    const rows: FinishRow[] = this.roster
      .map((r) => ({ name: r.name, time: this.finishOrder.get(r.id) ?? null }))
      .sort((a, b) => {
        if (a.time === null && b.time === null) return 0;
        if (a.time === null) return 1;
        if (b.time === null) return -1;
        return a.time - b.time;
      });
    this.onFinishBoard?.(rows);
  }

  private takeDamage(
    now: number,
    opts: { respawn?: boolean; stun?: boolean; knockDir?: 1 | -1; knockUp?: boolean },
  ) {
    if (this.ended || this.eliminated || now < this.invulnUntil) return;
    if (this.shield) {
      this.shield = false;
      this.invulnUntil = now + 0.3;
      this.sendState();
      return;
    }
    this.hp -= 1;
    this.invulnUntil = now + C.INVULN_TIME;
    if (opts.stun) this.stunUntil = now + C.STUN_TIME;
    if (opts.knockDir) {
      this.vx = opts.knockDir * C.SHOT_KNOCK_X;
      this.vy = -C.SHOT_KNOCK_Y;
      // knockback ต้องออกฤทธิ์แม้ผู้เล่นกดปุ่มค้าง — บังคับด้วย stun สั้นมาก
      this.stunUntil = Math.max(this.stunUntil, now + 0.25);
      this.moveX(this.vx * C.DT);
    }
    if (opts.knockUp) {
      // ลาวา: เด้งขึ้นตรง ๆ (CONTEXT.md — Rising Hazard: knockback ขึ้น + invuln สั้น)
      this.vy = -C.LAVA_KNOCK_Y;
      this.stunUntil = Math.max(this.stunUntil, now + 0.25);
    }
    if (this.hp <= 0) {
      if (this.mode === 'survival' || this.mode === 'lava') {
        this.eliminate();
        return;
      }
      // Race/Speed Run: HP เป็น penalty ไม่ใช่เงื่อนไขแพ้ — หมดแล้วรีเซ็ตเป็น 3 + respawn
      this.hp = C.START_HP;
      opts.respawn = true;
    }
    if (opts.respawn) this.respawnIntoView(now);
    this.sendState();
  }

  private eliminate() {
    if (this.eliminated) return;
    this.eliminated = true;
    this.vx = 0;
    this.vy = 0;
    this.transport.send({ t: 'eliminated', id: this.selfId, seed: this.roundSeed });
    this.sendState();
  }

  // เกิดใหม่บนแพลตฟอร์มครึ่งล่างของจอ — ต้องไม่อยู่เหนือกึ่งกลางจอ
  // ไม่งั้นกล้อง (ที่ ratchet ขึ้นอย่างเดียว) จะถูก respawn ลากขึ้นเรื่อยๆ
  private respawnIntoView(now: number) {
    const r1 = Math.min(
      this.level.rows - 1,
      Math.floor((this.camY + C.VIEW_H) / C.TILE) - 2,
    );
    let r0 = Math.max(0, Math.ceil((this.camY + C.VIEW_H * 0.5) / C.TILE));
    if (r0 > r1) r0 = Math.max(0, Math.ceil(this.camY / C.TILE) + 2); // fallback ทั้งจอ
    const targetY = this.camY + C.VIEW_H * 0.7;
    let best: { col: number; row: number; score: number } | null = null;
    for (let row = r0; row <= r1; row++) {
      for (let col = 1; col < this.level.cols - 1; col++) {
        if (
          isSolid(this.level, col, row) &&
          !isSolid(this.level, col, row - 1) &&
          !isSolid(this.level, col, row - 2)
        ) {
          const score =
            Math.abs(row * C.TILE - targetY) +
            Math.abs(col * C.TILE - C.VIEW_W / 2) * 0.3;
          if (!best || score < best.score) best = { col, row, score };
        }
      }
    }
    if (best) {
      this.px = best.col * C.TILE + (C.TILE - C.PLAYER_W) / 2;
      this.py = best.row * C.TILE - C.PLAYER_H;
    } else {
      this.px = C.VIEW_W / 2;
      this.py = this.camY + C.VIEW_H / 2;
    }
    this.vx = 0;
    this.vy = 0;
    this.invulnUntil = now + C.RESPAWN_INVULN;
  }

  // ---------- items ----------

  private useItem() {
    const now = this.simTime;
    if (
      this.ended || this.item === null || now < this.startedAt ||
      now < this.stunUntil || this.finished
    ) {
      return;
    }
    const item = this.item;
    this.item = null;
    switch (item) {
      case 'shot': {
        const x = this.px + C.PLAYER_W / 2 + this.face * 10;
        const y = this.py + C.PLAYER_H / 2;
        this.shots.push({ x, y, dir: this.face, owner: this.selfId, born: now });
        this.transport.send({
          t: 'shot', from: this.selfId, seed: this.roundSeed, x, y, dir: this.face,
        });
        break;
      }
      case 'shield':
        this.shield = true;
        break;
      case 'trap': {
        const id = `${this.selfId}-${this.trapCounter++}`;
        const x = this.px + C.PLAYER_W / 2 - 6;
        const y = this.py + C.PLAYER_H - 8;
        // วางได้คนละ 1 อัน — อันใหม่แทนที่อันเก่า (ทุกเครื่องลบตาม owner)
        for (const t of this.traps.values()) {
          if (t.owner === this.selfId) this.traps.delete(t.id);
        }
        this.traps.set(id, { id, owner: this.selfId, x, y, placed: now });
        this.transport.send({ t: 'trap', id, owner: this.selfId, seed: this.roundSeed, x, y });
        break;
      }
      case 'swap': {
        // สลับกับผู้เล่นที่อยู่สูงสุด ณ ขณะใช้ (Blue Shell) — เหยื่อ confirm ก่อน
        let target: RemotePlayer | null = null;
        for (const r of this.remotes.values()) {
          if (r.eliminated) continue;
          if (!target || r.y < target.y) target = r;
        }
        if (!target) break;
        this.transport.send({
          t: 'swapreq',
          from: this.selfId,
          to: target.id,
          seed: this.roundSeed,
          x: this.px,
          y: this.py,
        });
        break;
      }
    }
    this.sendState();
  }

  // ---------- network ----------

  private sendState() {
    this.transport.send({
      t: 'state',
      id: this.selfId,
      seed: this.roundSeed,
      x: this.px,
      y: this.py,
      vx: this.vx,
      vy: this.vy,
      face: this.face,
      hp: this.hp,
      shield: this.shield,
      item: this.item,
      ground: this.ground,
    });
  }

  handleMessage(msg: NetMsg) {
    // ทิ้ง msg ที่ยังค้างมาจากรอบก่อนหน้า (ไม่ใช่ hello/bye/start ซึ่งไม่ผ่านมาถึงตรงนี้อยู่แล้ว)
    if ('seed' in msg && msg.seed !== this.roundSeed) return;
    const now = this.simTime;
    switch (msg.t) {
      case 'state': {
        const r = this.remotes.get(msg.id);
        if (!r) return;
        // interpolation buffer ใช้เวลาจริง (คู่กับ sample() ใน render loop)
        r.push({ t: this.now(), x: msg.x, y: msg.y, face: msg.face });
        r.hp = msg.hp;
        r.shield = msg.shield;
        r.item = msg.item;
        break;
      }
      case 'shot':
        // กระสุนของคนอื่นเป็นแค่ภาพบนจอเรา — คนยิงเป็นคนตรวจ hit
        this.shots.push({ x: msg.x, y: msg.y, dir: msg.dir, owner: msg.from, born: now });
        break;
      case 'hit':
        if (msg.to === this.selfId) {
          this.takeDamage(now, { knockDir: msg.dir });
        }
        break;
      case 'swapreq': {
        if (msg.to !== this.selfId || this.eliminated) return;
        // เหยื่อเช็คเกราะบนเครื่องตัวเอง — ไม่มี timing dispute (CONTEXT.md — เกราะ)
        if (this.shield) {
          this.shield = false;
          this.transport.send({
            t: 'swapblock', from: this.selfId, to: msg.from, seed: this.roundSeed,
          });
          this.sendState();
          return;
        }
        const oldX = this.px;
        const oldY = this.py;
        this.px = msg.x;
        this.py = msg.y;
        this.vx = 0;
        this.vy = 0;
        this.invulnUntil = Math.max(this.invulnUntil, now + 0.5);
        this.transport.send({
          t: 'swapack', from: this.selfId, to: msg.from, seed: this.roundSeed, x: oldX, y: oldY,
        });
        this.sendState();
        break;
      }
      case 'swapack':
        if (msg.to === this.selfId) {
          this.px = msg.x;
          this.py = msg.y;
          this.vx = 0;
          this.vy = 0;
          this.invulnUntil = Math.max(this.invulnUntil, now + 0.5);
          this.sendState();
        }
        break;
      case 'swapblock':
        break; // ไอเทมเสียเปล่า — เกราะของเหยื่อกันไว้
      case 'trap':
        for (const t of this.traps.values()) {
          if (t.owner === msg.owner) this.traps.delete(t.id);
        }
        this.traps.set(msg.id, {
          id: msg.id,
          owner: msg.owner,
          x: msg.x,
          y: msg.y,
          placed: now,
        });
        break;
      case 'trapfire':
        this.traps.delete(msg.id);
        break;
      case 'box':
        this.boxTakenUntil.set(msg.id, now + C.BOX_RESPAWN);
        break;
      case 'win':
        this.finish(msg.id);
        break;
      case 'finish':
        if (!this.finishOrder.has(msg.id)) this.finishOrder.set(msg.id, msg.time);
        this.maybeEndSpeedrun();
        break;
      case 'eliminated': {
        const r = this.remotes.get(msg.id);
        if (r) r.eliminated = true;
        break;
      }
      case 'bye':
        this.removePlayer(msg.id);
        break;
      default:
        break;
    }
  }

  private finish(winnerId: string) {
    if (this.ended) return;
    this.ended = true;
    const winner = this.roster.find((r) => r.id === winnerId);
    this.winnerName = winner?.name ?? winnerId;
    this.onEnd?.(this.winnerName);
  }

  // อันดับปัจจุบันของเรา (1 = สูงสุด)
  rank(): { rank: number; total: number } {
    let rank = 1;
    for (const r of this.remotes.values()) {
      if (r.y < this.py) rank++;
    }
    return { rank, total: this.remotes.size + 1 };
  }
}
