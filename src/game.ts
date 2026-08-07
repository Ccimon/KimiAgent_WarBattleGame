export type Owner = 'player' | 'ai1' | 'ai2' | 'neutral';

export interface Tower {
  id: number;
  x: number;
  y: number;
  owner: Owner;
  units: number;
  level: number; // 1-3,由兵力阈值推导
  prodAcc: number; // 产兵累积器
}

export interface Squad {
  id: number;
  owner: Owner;
  from: number; // 出发塔 id(用于绘制轨迹)
  target: number; // 目标塔 id
  count: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  dist: number;
  travelled: number;
}

export type Phase = 'playing' | 'won' | 'lost';

// AI 性格:出兵节奏与目标偏好
export interface Personality {
  name: string; // 中文名(调试/日后 UI 用)
  interval: number; // 决策间隔(秒)
  sendFull: number; // 蓄到兵力上限的该比例才出兵
  minUnits: number; // 低于此兵力不主动行动
  huntStrong: boolean; // true=专打最强对手的最弱塔,false=打全场最弱塔
}

export interface GameState {
  towers: Tower[];
  squads: Squad[];
  phase: Phase;
  levelIndex: number;
  time: number;
  aiTimers: Partial<Record<Owner, number>>; // 每个 AI 势力独立计时器
  aiTraits: Partial<Record<Owner, Personality>>; // 本局随机分配的性格
  nextSquadId: number;
}

export const TOWER_RADIUS = 34;
export const SEND_RATIO = 0.5;
export const SQUAD_SPEED = 110; // 像素/秒(导出供联机客人端平滑推进队伍)
const AI_FACTIONS: Owner[] = ['ai1', 'ai2'];

// AI 性格表:莽夫频繁出手,龟缩憋满再打,猎强专挑最强对手下手
const AI_PERSONALITIES: Personality[] = [
  { name: '莽夫', interval: 1.0, sendFull: 0.55, minUnits: 6, huntStrong: false },
  { name: '龟缩', interval: 2.2, sendFull: 0.95, minUnits: 12, huntStrong: false },
  { name: '猎强', interval: 1.5, sendFull: 0.8, minUnits: 8, huntStrong: true },
];

// 等级 -> 产兵速率(个/秒)与兵力上限(仅限制生产,增援可超出)
const LEVEL_STATS: Record<number, { rate: number; cap: number }> = {
  1: { rate: 0.6, cap: 20 },
  2: { rate: 1.0, cap: 40 },
  3: { rate: 1.6, cap: 60 },
};

const UPGRADE_AT = [35, 15]; // units >= 35 -> 3 级, >= 15 -> 2 级

export function levelOf(units: number): number {
  if (units >= UPGRADE_AT[0]) return 3;
  if (units >= UPGRADE_AT[1]) return 2;
  return 1;
}

export interface TowerInit {
  x: number;
  y: number;
  owner: Owner;
  units: number;
}

export function createGame(levelIndex: number, defs: TowerInit[]): GameState {
  // 每个 AI 势力独立随机抽性格(允许重复)
  const aiTimers: Partial<Record<Owner, number>> = {};
  const aiTraits: Partial<Record<Owner, Personality>> = {};
  for (const f of AI_FACTIONS) {
    const p = AI_PERSONALITIES[Math.floor(Math.random() * AI_PERSONALITIES.length)];
    aiTraits[f] = p;
    aiTimers[f] = p.interval;
  }
  return {    towers: defs.map((d, i) => ({
      id: i,
      x: d.x,
      y: d.y,
      owner: d.owner,
      units: d.units,
      level: levelOf(d.units),
      prodAcc: 0,
    })),
    squads: [],
    phase: 'playing',
    levelIndex,
    time: 0,
    aiTimers,
    aiTraits,
    nextSquadId: 1,
  };
}

// 联机中客人掉线后,把该势力交给 AI 接管;也可用于开局时摘除真人势力的 AI(先 delete 再按需调用)
export function assignAi(state: GameState, faction: Owner): void {
  const p = AI_PERSONALITIES[Math.floor(Math.random() * AI_PERSONALITIES.length)];
  state.aiTraits[faction] = p;
  state.aiTimers[faction] = p.interval;
}

export function towerAt(state: GameState, x: number, y: number): Tower | null {
  for (const t of state.towers) {
    if (Math.hypot(t.x - x, t.y - y) <= TOWER_RADIUS + 6) return t;
  }
  return null;
}

export function sendUnits(state: GameState, fromId: number, toId: number): boolean {
  if (fromId === toId) return false;
  const from = state.towers[fromId];
  const to = state.towers[toId];
  if (!from || !to) return false;
  const count = Math.floor(from.units * SEND_RATIO);
  if (count < 1) return false;
  from.units -= count;
  from.level = levelOf(from.units);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  state.squads.push({
    id: state.nextSquadId++,
    owner: from.owner,
    from: fromId,
    target: toId,
    count,
    x: from.x,
    y: from.y,
    dirX: (to.x - from.x) / dist,
    dirY: (to.y - from.y) / dist,
    dist,
    travelled: 0,
  });
  return true;
}

function arrive(state: GameState, squad: Squad): void {
  const t = state.towers[squad.target];
  if (!t) return;
  if (t.owner === squad.owner) {
    t.units += squad.count;
  } else {
    t.units -= squad.count;
    if (t.units < 0) {
      t.owner = squad.owner;
      t.units = -t.units;
      t.prodAcc = 0;
    }
  }
  t.level = levelOf(t.units);
}

// 某势力的总兵力(塔 + 行军队伍)
function factionPower(state: GameState, owner: Owner): number {
  let sum = 0;
  for (const t of state.towers) if (t.owner === owner) sum += t.units;
  for (const s of state.squads) if (s.owner === owner) sum += s.count;
  return sum;
}

function aiTick(state: GameState, faction: Owner): void {
  const trait = state.aiTraits[faction];
  if (!trait) return;
  const foes = state.towers.filter((o) => o.owner !== faction);
  if (foes.length === 0) return;

  // 选目标:默认打兵力最少的塔;猎强性格先锁定总兵力最强的对手势力
  let pool = foes;
  if (trait.huntStrong) {
    let strongest: Owner | null = null;
    let best = -1;
    for (const o of foes.map((t) => t.owner)) {
      if (o === 'neutral') continue; // 中立不算对手势力
      const p = factionPower(state, o);
      if (p > best) {
        best = p;
        strongest = o;
      }
    }
    const owned = strongest === null ? [] : foes.filter((t) => t.owner === strongest);
    if (owned.length > 0) pool = owned;
  }
  const target = pool.reduce((a, b) => (b.units < a.units ? b : a));

  for (const t of state.towers) {
    if (t.owner !== faction) continue;
    // 蓄到接近满员再倾巢进攻:多塔兵力叠加才能压过守方的生产恢复
    if (t.units < trait.minUnits) continue;
    if (t.units < LEVEL_STATS[t.level].cap * trait.sendFull) continue;
    sendUnits(state, t.id, target.id);
  }
}

function checkPhase(state: GameState): void {
  const playerAlive =
    state.towers.some((t) => t.owner === 'player') ||
    state.squads.some((s) => s.owner === 'player');
  const aiAlive = AI_FACTIONS.some(
    (f) =>
      state.towers.some((t) => t.owner === f) ||
      state.squads.some((s) => s.owner === f),
  );
  if (!aiAlive) state.phase = 'won';
  else if (!playerAlive) state.phase = 'lost';
}

export function update(state: GameState, dt: number): void {
  if (state.phase !== 'playing') return;
  state.time += dt;

  // 产兵(中立塔不产兵,到达上限后停止)
  for (const t of state.towers) {
    if (t.owner === 'neutral') continue;
    const stats = LEVEL_STATS[t.level];
    if (t.units >= stats.cap) continue;
    t.prodAcc += stats.rate * dt;
    const n = Math.floor(t.prodAcc);
    if (n > 0) {
      t.prodAcc -= n;
      t.units = Math.min(stats.cap, t.units + n);
      t.level = levelOf(t.units);
    }
  }

  // 队伍行军
  for (const s of state.squads) {
    s.travelled += SQUAD_SPEED * dt;
    s.x += s.dirX * SQUAD_SPEED * dt;
    s.y += s.dirY * SQUAD_SPEED * dt;
  }
  const arrived = state.squads.filter((s) => s.travelled >= s.dist);
  if (arrived.length > 0) {
    state.squads = state.squads.filter((s) => s.travelled < s.dist);
    for (const s of arrived) arrive(state, s);
  }

  // 敌方 AI:每个势力独立计时、独立性格
  for (const f of AI_FACTIONS) {
    const trait = state.aiTraits[f];
    if (!trait) continue;
    state.aiTimers[f] = (state.aiTimers[f] ?? trait.interval) - dt;
    if (state.aiTimers[f]! <= 0) {
      state.aiTimers[f] = trait.interval;
      aiTick(state, f);
    }
  }

  checkPhase(state);
}
