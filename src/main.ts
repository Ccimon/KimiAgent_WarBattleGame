import {
  assignAi,
  createGame,
  levelOf,
  sendUnits,
  towerAt,
  transformTower,
  update,
  SQUAD_SPEED,
  SEND_COST,
  TRANSFORM_COST_UNITS,
  TRANSFORM_COST_AP,
  type GameState,
  type Owner,
} from './game';
import { LEVELS, toPortrait } from './levels';
import { draw, type DragState } from './render';
import { hostRoom, joinRoom, type GuestHandle, type HostHandle, type Snapshot } from './net';
import { VERSION } from './version';

// 逻辑画布尺寸:横屏 960x600,竖屏 600x960(关卡按横版设计,竖屏由 toPortrait 转置)
let LOGICAL_W = 960;
let LOGICAL_H = 600;
const SNAP_INTERVAL = 0.1; // 房主快照广播间隔(秒)
const NET_LEVELS = [3, 4, 5]; // 联机可选关卡(三方会战)

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
const levelNameEl = document.querySelector<HTMLSpanElement>('#level-name')!;
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!;
const overlayTitleEl = document.querySelector<HTMLDivElement>('#overlay-title')!;
const overlayNextBtn = document.querySelector<HTMLButtonElement>('#btn-overlay-next')!;
const overlayRestartBtn = document.querySelector<HTMLButtonElement>('#btn-overlay-restart')!;
const tipEl = document.querySelector<HTMLDivElement>('#tip')!;
const hudEl = document.querySelector<HTMLDivElement>('#hud')!;
document.querySelector<HTMLSpanElement>('#app-version')!.textContent = `v${VERSION}`;

// 大厅元素
const lobbyEl = document.querySelector<HTMLDivElement>('#lobby')!;
const lobbyMenuEl = document.querySelector<HTMLDivElement>('#lobby-menu')!;
const lobbyRoomEl = document.querySelector<HTMLDivElement>('#lobby-room')!;
const lobbyStatusEl = document.querySelector<HTMLDivElement>('#lobby-status')!;
const lobbyErrorEl = document.querySelector<HTMLDivElement>('#lobby-error')!;
const roomCodeInput = document.querySelector<HTMLInputElement>('#room-code')!;
const roomCodeDisplay = document.querySelector<HTMLDivElement>('#room-code-display')!;
const lobbyLvlRow = document.querySelector<HTMLDivElement>('#lobby-lvl-row')!;
const lobbyLevelEl = document.querySelector<HTMLSpanElement>('#lobby-level')!;
const startBtn = document.querySelector<HTMLButtonElement>('#btn-start')!;

type Mode = 'solo' | 'host' | 'guest';

let mode: Mode = 'solo';
let myFaction: Owner = 'player';
let levelIndex = 0;
let state: GameState = createGame(0, LEVELS[0].towers, LEVELS[0].edges); // 开场背景
const drag: DragState = { fromId: null, x: 0, y: 0, moved: false };

let host: HostHandle | null = null;
let guest: GuestHandle | null = null;
let netLevelPos = 0; // NET_LEVELS 下标(房主大厅选关)
let snapTimer = 0;
let guestEliminated = false;

function loadLevel(index: number): GameState {
  levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
  const raw = LEVELS[levelIndex];
  const def = isPortrait() ? toPortrait(raw) : raw; // 竖屏时整体转置布局
  levelNameEl.textContent = raw.name;
  overlayEl.classList.remove('show');
  overlayShown = false;
  return createGame(levelIndex, def.towers, def.edges);
}

// 联机建房:摘掉红方(ai1)的 AI,留给真人客人
function loadNetLevel(index: number): GameState {
  const s = loadLevel(index);
  delete s.aiTraits.ai1;
  delete s.aiTimers.ai1;
  return s;
}

function resize(): void {
  // 横竖屏切换:更新逻辑尺寸并重载当前关(布局随朝向转置,对局会重置)
  const w = isPortrait() ? 600 : 960;
  const h = isPortrait() ? 960 : 600;
  if (w !== LOGICAL_W) {
    LOGICAL_W = w;
    LOGICAL_H = h;
    if (!lobbyEl.classList.contains('show')) {
      state = mode === 'host' ? loadNetLevel(levelIndex) : loadLevel(levelIndex);
      if (mode === 'host') host?.send({ t: 'start', levelIndex });
    }
  }
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}

function toLogical(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * LOGICAL_W,
    y: ((e.clientY - rect.top) / rect.height) * LOGICAL_H,
  };
}

function setTip(text: string): void {
  tipEl.textContent = text;
}

function defaultTip(): void {
  const color = myFaction === 'player' ? '蓝色' : '红色';
  setTip(`你是${color}方,从己方塔按住拖动到目标塔,松开派出一半兵力`);
}

// ---------- 大厅 ----------

function lobbyError(msg: string): void {
  lobbyErrorEl.textContent = msg;
}

document.querySelector('#btn-solo')!.addEventListener('click', () => {
  mode = 'solo';
  myFaction = 'player';
  lobbyEl.classList.remove('show');
  hudEl.classList.remove('hidden');
  state = loadLevel(0);
  defaultTip();
});

document.querySelector('#btn-host')!.addEventListener('click', () => {
  lobbyError('');
  lobbyMenuEl.style.display = 'none';
  lobbyRoomEl.style.display = 'flex';
  lobbyLvlRow.style.display = 'flex';
  lobbyStatusEl.textContent = '创建房间中…';
  lobbyLevelEl.textContent = LEVELS[NET_LEVELS[netLevelPos]].name;
  host = hostRoom({
    onReady(code) {
      roomCodeDisplay.textContent = code;
      lobbyStatusEl.textContent = '把房间码告诉朋友,等待加入…';
    },
    onGuestJoin() {
      lobbyStatusEl.textContent = '朋友已加入!选好关卡后开始';
      startBtn.style.display = '';
    },
    onCmd(from, to) {
      // 客人指令:校验出发塔属于红方再执行
      if (mode !== 'host' || state.phase !== 'playing') return;
      if (state.towers[from]?.owner === 'ai1') sendUnits(state, from, to);
    },
    onTransform(tower, kind) {
      // 客人转型指令:校验塔属于红方再执行(资源/类型校验在 transformTower 内)
      if (mode !== 'host' || state.phase !== 'playing') return;
      if (state.towers[tower]?.owner === 'ai1') transformTower(state, tower, kind);
    },
    onGuestLeave() {
      if (mode === 'host' && state.phase === 'playing') {
        assignAi(state, 'ai1'); // 客人掉线,AI 接管红方
        setTip('对方已离开,红方由 AI 接管');
      } else if (mode !== 'guest') {
        lobbyStatusEl.textContent = '对方已离开,等待重新加入…';
        startBtn.style.display = 'none';
      }
    },
    onError(msg) {
      lobbyError(msg);
    },
  });
});

document.querySelector('#btn-join')!.addEventListener('click', () => {
  const code = roomCodeInput.value.trim();
  if (code.length !== 6) {
    lobbyError('请输入 6 位房间码');
    return;
  }
  lobbyError('');
  lobbyMenuEl.style.display = 'none';
  lobbyRoomEl.style.display = 'flex';
  roomCodeDisplay.textContent = code.toUpperCase();
  lobbyStatusEl.textContent = '连接中…';
  guest = joinRoom(code, {
    onConnected() {
      lobbyStatusEl.textContent = '已连接,等待房主开始…';
    },
    onStart(li) {
      mode = 'guest';
      myFaction = 'ai1';
      guestEliminated = false;
      lobbyEl.classList.remove('show');
      hudEl.classList.remove('hidden');
      setHudForMode();
      state = loadLevel(li);
      defaultTip();
    },
    onSnap(snap) {
      applySnapshot(snap);
    },
    onHostLeave() {
      overlayTitleEl.textContent = '房主已离开';
      overlayTitleEl.style.color = '#f87171';
      overlayNextBtn.style.display = 'none';
      overlayRestartBtn.style.display = 'none';
      overlayEl.classList.add('show');
    },
    onError(msg) {
      lobbyError(msg);
      lobbyStatusEl.textContent = '加入失败';
    },
  });
});

function setHudForMode(): void {
  const isGuest = mode === 'guest';
  document.querySelector<HTMLButtonElement>('#btn-prev')!.style.display = isGuest ? 'none' : '';
  document.querySelector<HTMLButtonElement>('#btn-next')!.style.display = isGuest ? 'none' : '';
  document.querySelector<HTMLButtonElement>('#btn-restart')!.style.display = isGuest ? 'none' : '';
}

// 房主大厅选关(仅三方关卡)
document.querySelector('#btn-lvl-prev')!.addEventListener('click', () => {
  netLevelPos = (netLevelPos + NET_LEVELS.length - 1) % NET_LEVELS.length;
  lobbyLevelEl.textContent = LEVELS[NET_LEVELS[netLevelPos]].name;
});
document.querySelector('#btn-lvl-next')!.addEventListener('click', () => {
  netLevelPos = (netLevelPos + 1) % NET_LEVELS.length;
  lobbyLevelEl.textContent = LEVELS[NET_LEVELS[netLevelPos]].name;
});

startBtn.addEventListener('click', () => {
  if (!host?.hasGuest()) {
    lobbyError('还没有玩家加入');
    return;
  }
  mode = 'host';
  myFaction = 'player';
  const li = NET_LEVELS[netLevelPos];
  lobbyEl.classList.remove('show');
  hudEl.classList.remove('hidden');
  setHudForMode();
  state = loadNetLevel(li);
  host.send({ t: 'start', levelIndex: li });
  snapTimer = 0;
  defaultTip();
});

// ---------- 联机同步 ----------

function buildSnapshot(): Snapshot {
  return {
    t: 'snap',
    towers: state.towers.map((t) => ({ owner: t.owner, units: t.units, ap: t.ap, kind: t.kind })),
    squads: state.squads.map((s) => ({
      id: s.id,
      owner: s.owner,
      from: s.from,
      target: s.target,
      count: s.count,
      travelled: s.travelled,
      fighting: s.fighting,
    })),
    phase: state.phase,
  };
}

function applySnapshot(snap: Snapshot): void {
  if (mode !== 'guest') return;
  for (let i = 0; i < snap.towers.length && i < state.towers.length; i++) {
    const t = state.towers[i];
    t.owner = snap.towers[i].owner;
    t.units = snap.towers[i].units;
    t.ap = snap.towers[i].ap;
    t.kind = snap.towers[i].kind; // 转型会改类型,同步给客人端
    t.level = levelOf(t.units, t.kind);
  }
  // 队伍按快照重建位置;本地已推进的取较大值避免回跳
  const local = new Map(state.squads.map((s) => [s.id, s.travelled]));
  state.squads = snap.squads.map((ss) => {
    const from = state.towers[ss.from];
    const to = state.towers[ss.target];
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    // 交战中的队伍位置以快照为准(不回跳保护),其余取较大值避免回跳
    const travelled = ss.fighting ? ss.travelled : Math.max(ss.travelled, local.get(ss.id) ?? 0);
    const dirX = (to.x - from.x) / dist;
    const dirY = (to.y - from.y) / dist;
    return {
      id: ss.id,
      owner: ss.owner,
      from: ss.from,
      target: ss.target,
      count: ss.count,
      x: from.x + dirX * travelled,
      y: from.y + dirY * travelled,
      dirX,
      dirY,
      dist,
      travelled,
      fighting: ss.fighting,
      dmgAcc: 0,
    };
  });
  state.phase = snap.phase;
  // 红方(客人)被淘汰但游戏仍在继续 -> 观战提示
  if (
    state.phase === 'playing' &&
    !guestEliminated &&
    !snap.towers.some((t) => t.owner === 'ai1') &&
    !snap.squads.some((s) => s.owner === 'ai1')
  ) {
    guestEliminated = true;
    setTip('你已被淘汰,观战中…');
  }
}

// ---------- 输入 ----------

canvas.addEventListener('pointerdown', (e) => {
  closeTransformMenu();
  if (lobbyEl.classList.contains('show') || state.phase !== 'playing') return;
  if (guestEliminated) return;
  const p = toLogical(e);
  const t = towerAt(state, p.x, p.y);
  if (t && t.owner === myFaction) {
    drag.fromId = t.id;
    drag.x = p.x;
    drag.y = p.y;
    drag.moved = false;
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (drag.fromId === null) return;
  const p = toLogical(e);
  if (Math.hypot(p.x - drag.x, p.y - drag.y) > 8) drag.moved = true; // 拖出死区才算出兵
  drag.x = p.x;
  drag.y = p.y;
});

canvas.addEventListener('pointerup', (e) => {
  if (drag.fromId === null) return;
  const p = toLogical(e);
  const target = towerAt(state, p.x, p.y);
  if (target && target.id !== drag.fromId) {
    if (mode === 'guest') {
      // 本地预判行动力,不足就不发(房主端仍会最终校验)
      if (state.towers[drag.fromId].ap >= SEND_COST) guest?.sendCmd(drag.fromId, target.id);
    } else {
      sendUnits(state, drag.fromId, target.id);
    }
  } else if (!drag.moved) {
    // 原地松开(未拖动)= 打开转型菜单
    const from = state.towers[drag.fromId];
    if (from.kind === 'normal') openTransformMenu(from.id);
  }
  drag.fromId = null;
  drag.moved = false;
});

// ---------- 塔转型菜单 ----------

const transformMenuEl = document.querySelector<HTMLDivElement>('#transform-menu')!;
let transformTarget: number | null = null;

function openTransformMenu(towerId: number): void {
  const t = state.towers[towerId];
  transformTarget = towerId;
  // 逻辑坐标 -> #app 内百分比定位,放在塔上方并防止越界
  const left = Math.min(Math.max((t.x / LOGICAL_W) * 100, 8), 70);
  const top = Math.min(Math.max(((t.y - 70) / LOGICAL_H) * 100, 2), 80);
  transformMenuEl.style.left = `${left}%`;
  transformMenuEl.style.top = `${top}%`;
  // 资源不足的类型禁用
  for (const btn of transformMenuEl.querySelectorAll<HTMLButtonElement>('button')) {
    btn.disabled = t.units < TRANSFORM_COST_UNITS || t.ap < TRANSFORM_COST_AP;
  }
  transformMenuEl.classList.add('show');
}

function closeTransformMenu(): void {
  transformMenuEl.classList.remove('show');
  transformTarget = null;
}

for (const btn of transformMenuEl.querySelectorAll<HTMLButtonElement>('button')) {
  btn.addEventListener('click', () => {
    if (transformTarget === null) return;
    const kind = btn.dataset.kind as 'fortress' | 'barracks' | 'watch' | 'mine';
    if (mode === 'guest') guest?.sendTransform(transformTarget, kind);
    else transformTower(state, transformTarget, kind);
    closeTransformMenu();
  });
}

canvas.addEventListener('pointercancel', () => {
  drag.fromId = null;
});

// ---------- HUD / overlay 按钮 ----------

document.querySelector('#btn-restart')!.addEventListener('click', () => {
  if (mode === 'guest') return;
  state = mode === 'host' ? loadNetLevel(levelIndex) : loadLevel(levelIndex);
  if (mode === 'host') host?.send({ t: 'start', levelIndex });
});
document.querySelector('#btn-prev')!.addEventListener('click', () => {
  if (mode === 'guest') return;
  state = loadLevel(levelIndex - 1);
  if (mode === 'host') host?.send({ t: 'start', levelIndex });
});
document.querySelector('#btn-next')!.addEventListener('click', () => {
  if (mode === 'guest') return;
  state = loadLevel(levelIndex + 1);
  if (mode === 'host') host?.send({ t: 'start', levelIndex });
});
overlayRestartBtn.addEventListener('click', () => {
  if (mode === 'guest') return;
  state = mode === 'host' ? loadNetLevel(levelIndex) : loadLevel(levelIndex);
  if (mode === 'host') host?.send({ t: 'start', levelIndex });
});
overlayNextBtn.addEventListener('click', () => {
  if (mode === 'guest') return;
  state = loadLevel(levelIndex + 1);
  if (mode === 'host') host?.send({ t: 'start', levelIndex });
});

function showOverlay(): void {
  // phase 语义以蓝方为基准,客人(红方)视角要反过来
  const iWon = myFaction === 'player' ? state.phase === 'won' : state.phase === 'lost';
  if (iWon) {
    overlayTitleEl.textContent = '胜利!';
    overlayTitleEl.style.color = '#4ade80';
  } else {
    overlayTitleEl.textContent = '战败…';
    overlayTitleEl.style.color = '#f87171';
  }
  const guestWaiting = mode === 'guest';
  overlayNextBtn.style.display = !guestWaiting && state.phase === 'won' ? '' : 'none';
  overlayRestartBtn.style.display = guestWaiting ? 'none' : '';
  overlayEl.classList.add('show');
}

// ---------- 主循环 ----------

let last = performance.now();
let overlayShown = false;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (mode === 'guest') {
    // 客人端:不跑游戏逻辑,只本地推进队伍位置等下一帧快照(交战中的队伍停驻)
    for (const s of state.squads) {
      if (s.fighting) continue;
      s.travelled = Math.min(s.travelled + SQUAD_SPEED * dt, s.dist);
      s.x = state.towers[s.from].x + s.dirX * s.travelled;
      s.y = state.towers[s.from].y + s.dirY * s.travelled;
    }
  } else if (!lobbyEl.classList.contains('show')) {
    update(state, dt);
    if (mode === 'host' && host?.hasGuest()) {
      snapTimer -= dt;
      if (snapTimer <= 0) {
        snapTimer = SNAP_INTERVAL;
        host.send(buildSnapshot());
      }
    }
  }

  if (state.phase !== 'playing' && !overlayShown) {
    overlayShown = true;
    setTimeout(showOverlay, 600); // 让最后一波战斗动画播完
  } else if (state.phase === 'playing') {
    overlayShown = false;
  }

  const scale = Math.min(canvas.width / LOGICAL_W, canvas.height / LOGICAL_H);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw(ctx, state, drag, LOGICAL_W, LOGICAL_H);

  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
