import { Game, type RosterEntry } from './game/game';
import { PALETTE, VIEW_H, VIEW_W } from './game/constants';
import type { GameMode, NetMsg } from './net/protocol';
import { BroadcastTransport, SupabaseTransport, type Transport } from './net/transport';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const screenMenu = $('screen-menu');
const screenLobby = $('screen-lobby');
const resultOverlay = $('resultOverlay');
const nameInput = $<HTMLInputElement>('nameInput');
const roomInput = $<HTMLInputElement>('roomInput');
const transportSelect = $<HTMLSelectElement>('transportSelect');
const modeSelect = $<HTMLSelectElement>('modeSelect');
const menuErr = $('menuErr');
const roomCodeEl = $('roomCode');
const playerList = $<HTMLUListElement>('playerList');
const startBtn = $<HTMLButtonElement>('startBtn');
const resultText = $('resultText');
const resultBoard = $<HTMLOListElement>('resultBoard');

const MODE_LABEL: Record<GameMode, string> = {
  race: 'Race',
  speedrun: 'Speed Run',
  survival: 'Survival',
  lava: 'Lava Map',
};
function currentMode(): GameMode {
  return (modeSelect.value as GameMode) || 'race';
}
function updateStartBtnLabel() {
  startBtn.textContent = `เริ่มเกม! (${MODE_LABEL[currentMode()]})`;
}
modeSelect.addEventListener('change', updateStartBtnLabel);
updateStartBtnLabel();

const selfId = crypto.randomUUID().slice(0, 8);
let transport: Transport | null = null;
let game: Game | null = null;
const roster = new Map<string, { name: string }>();

nameInput.value = localStorage.getItem('wgw-name') ?? '';

function show(el: HTMLElement | null) {
  screenMenu.classList.add('hidden');
  screenLobby.classList.add('hidden');
  canvas.style.display = 'none';
  resultOverlay.style.display = 'none';
  if (el === canvas) canvas.style.display = 'block';
  else el?.classList.remove('hidden');
}

function fitCanvas() {
  const scale = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)),
  );
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function myName(): string {
  return nameInput.value.trim() || `P-${selfId.slice(0, 4)}`;
}

function renderPlayerList() {
  playerList.innerHTML = '';
  const entries = sortedRoster();
  entries.forEach(({ id, name }, i) => {
    const li = document.createElement('li');
    li.style.color = PALETTE[i % PALETTE.length];
    li.textContent = `● ${name}${id === selfId ? ' (คุณ)' : ''}`;
    playerList.appendChild(li);
  });
}

// เรียงตาม id ให้ทุกเครื่องได้ลำดับ (และสี) ตรงกันโดยไม่ต้อง sync เพิ่ม
function sortedRoster(): Array<{ id: string; name: string }> {
  return [...roster.entries()]
    .map(([id, v]) => ({ id, name: v.name }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function handleMessage(msg: NetMsg) {
  switch (msg.t) {
    case 'hello':
      if (!roster.has(msg.id)) {
        roster.set(msg.id, { name: msg.name });
        renderPlayerList();
      }
      if (msg.reply) {
        transport?.send({ t: 'hello', id: selfId, name: myName(), reply: false });
      }
      return;
    case 'bye':
      roster.delete(msg.id);
      renderPlayerList();
      game?.removePlayer(msg.id);
      return;
    case 'start':
      beginGame(msg.seed, msg.mode, msg.players);
      return;
    default:
      game?.handleMessage(msg);
  }
}

async function joinRoom(room: string) {
  menuErr.textContent = '';
  const name = myName();
  localStorage.setItem('wgw-name', nameInput.value.trim());
  const t: Transport =
    transportSelect.value === 'supabase' ? new SupabaseTransport() : new BroadcastTransport();
  try {
    await t.join(room);
  } catch (e) {
    menuErr.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  transport = t;
  t.onMessage(handleMessage);
  roster.clear();
  roster.set(selfId, { name });
  t.send({ t: 'hello', id: selfId, name, reply: true });
  roomCodeEl.textContent = room;
  renderPlayerList();
  show(screenLobby);
}

function beginGame(
  seed: number,
  mode: GameMode,
  players: Array<{ id: string; name: string }>,
) {
  if (!transport) return;
  if (!players.some((p) => p.id === selfId)) return; // เราไม่อยู่ในรอบนี้
  game?.destroy();
  const entries: RosterEntry[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: PALETTE[i % PALETTE.length],
  }));
  game = new Game(canvas, transport, selfId, entries, seed, mode);
  // dev handle สำหรับ debug/ทดสอบอัตโนมัติ
  (window as unknown as { __game?: Game }).__game = game;
  game.onEnd = (winnerName) => {
    resultBoard.classList.add('hidden');
    resultBoard.textContent = '';
    const verb = mode === 'survival' || mode === 'lava' ? 'รอดคนสุดท้าย' : 'ชนะ';
    resultText.textContent = `🏁 ${winnerName} ${verb}!`;
    resultOverlay.style.display = 'flex';
  };
  game.onFinishBoard = (rows) => {
    resultText.textContent = rows[0]?.time !== null ? `🏁 ${rows[0].name} เร็วที่สุด!` : 'จบรอบ';
    resultBoard.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      if (row.time === null) li.className = 'dnf';
      const nameSpan = document.createTextNode(row.name);
      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      if (row.time === null) {
        timeSpan.textContent = 'DNF';
      } else {
        const m = Math.floor(row.time / 60);
        const s = (row.time % 60).toFixed(1).padStart(4, '0');
        timeSpan.textContent = `${m}:${s}`;
      }
      li.appendChild(nameSpan);
      li.appendChild(timeSpan);
      resultBoard.appendChild(li);
    }
    resultBoard.classList.remove('hidden');
    resultOverlay.style.display = 'flex';
  };
  show(canvas);
  game.start();
}

function leaveRoom() {
  transport?.send({ t: 'bye', id: selfId });
  transport?.leave();
  transport = null;
  game?.destroy();
  game = null;
  roster.clear();
  show(screenMenu);
}

$('createBtn').addEventListener('click', () => {
  const code = Array.from({ length: 4 }, () =>
    'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)],
  ).join('');
  void joinRoom(code);
});

$('joinBtn').addEventListener('click', () => {
  const code = roomInput.value.trim().toUpperCase();
  if (code.length < 3) {
    menuErr.textContent = 'ใส่รหัสห้องก่อนนะ';
    return;
  }
  void joinRoom(code);
});

startBtn.addEventListener('click', () => {
  const players = sortedRoster();
  if (players.length < 1) return;
  const seed = Math.floor(Math.random() * 0xffffffff);
  const mode = currentMode();
  transport?.send({ t: 'start', seed, mode, players });
  beginGame(seed, mode, players); // BroadcastChannel/Supabase ไม่ echo หาตัวเอง
});

$('againBtn').addEventListener('click', () => {
  const players = sortedRoster();
  const seed = Math.floor(Math.random() * 0xffffffff);
  const mode = currentMode();
  transport?.send({ t: 'start', seed, mode, players });
  beginGame(seed, mode, players);
});

$('backBtn').addEventListener('click', () => {
  game?.destroy();
  game = null;
  renderPlayerList();
  show(screenLobby);
});

$('leaveBtn').addEventListener('click', leaveRoom);

window.addEventListener('beforeunload', () => {
  transport?.send({ t: 'bye', id: selfId });
});
