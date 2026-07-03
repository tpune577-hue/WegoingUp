export const TILE = 16;
export const CHUNK_W = 20; // tiles
export const CHUNK_H = 15; // tiles
export const VIEW_W = TILE * CHUNK_W; // 320
export const VIEW_H = TILE * CHUNK_H; // 240

export const GRAVITY = 1500; // px/s^2
export const MOVE_SPEED = 130; // px/s
export const JUMP_VEL = 420; // px/s -> jump height ~3.6 tiles, reach ~4.5 tiles
export const MAX_FALL = 520;

export const PLAYER_W = 12;
export const PLAYER_H = 14;

export const DT = 1 / 60;
export const POS_SEND_HZ = 12;
export const INTERP_DELAY = 0.12; // s — render remotes slightly in the past

export const START_HP = 3;
export const INVULN_TIME = 1.2;
export const RESPAWN_INVULN = 2.0;
export const STUN_TIME = 1.0;

export const MIDDLE_CHUNKS = 10; // ระหว่าง start กับ goal

export const SHOT_SPEED = 260;
export const SHOT_LIFE = 1.2;
export const SHOT_HITBOX = 18; // generous ตาม ADR-0001 ชดเชย latency
export const SHOT_KNOCK_X = 300;
export const SHOT_KNOCK_Y = 220;

export const TRAP_FADE = 2.0; // วินาทีที่กับดักค่อยๆ จางจนมองไม่เห็น (แต่ยังทำงาน)
export const TRAP_ARM = 0.75; // เวลาก่อนกับดักเริ่มทำงาน

export const BOX_RESPAWN = 12; // Mystery Box เกิดใหม่หลังถูกเก็บ (วินาที)

export const SPEEDRUN_TIME_LIMIT = 180; // s — หมดเวลาแล้วคนที่ยังไม่ถึงเส้นชัยเป็น DNF

export const LAVA_START_DELAY = 6; // s หลัง countdown ก่อนลาวาเริ่มไหล
export const LAVA_RISE_SPEED = 8; // px/s — ต้อง playtest จูน
export const LAVA_KNOCK_Y = 260; // แรงกระเด็นขึ้นเมื่อโดนลาวา (px/s)

export const PALETTE = [
  '#e74c3c', '#3b9bff', '#2ecc71', '#f1c40f',
  '#b970ff', '#ff8c42', '#1abcb0', '#ff7bac',
];
