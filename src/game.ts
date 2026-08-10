export type Owner = 'player' | 'ai1' | 'ai2' | 'neutral';

// 塔类型(设计见 docs/塔类型设计.md),类型是塔的固有属性,易主不改变
export type TowerKind = 'normal' | 'fortress' | 'barracks' | 'watch' | 'mine';

export interface Tower {
  id: number;
  x: number;
  y: number;
  owner: Owner;
  kind: TowerKind;
  units: number;
  level: number; // 1-3,由兵力阈值推导
  prodAcc: number; // 产兵累积器
  ap: number; // 行动力:出兵消耗,随时间回复
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
  fighting: boolean; // 遭遇战中:停驻并互相消减兵力
  dmgAcc: number; // 战斗损伤累积器(不满 1 不掉兵)
}

export type Phase = 'playing' | 'won' | 'lost';

// AI 行为:支援(己方塔互派)、扩张(抢中立塔)、进攻(打敌人塔)
export type Behavior = 'support' | 'expand' | 'attack';

// AI 性格:行为优先级与各行为的门槛参数
export interface Personality {
  name: string; // 中文名(调试/日后 UI 用)
  interval: number; // 决策间隔(秒)
  order: Behavior[]; // 行为优先级,从高到低
  attackFull: number; // 进攻门槛:蓄到兵力上限的该比例才出兵
  minUnits: number; // 进攻最低兵力
  huntStrong: boolean; // true=专打最强对手的最弱塔,false=打全场最弱塔
  supportFactor: number; // 支援触发:净威胁 > 塔兵力 × 该系数(越大越不爱救)
  expandSlack: number; // 扩张门槛:兵力 ≥ 灰塔兵力 + 该值(越小越爱抢地)
}

export interface GameState {
  towers: Tower[];
  squads: Squad[];
  edges: [number, number][]; // 道路:只能沿边派兵(无向)
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
export const AP_MAX = 100; // 行动力上限
export const SEND_COST = 34; // 每次出兵固定消耗(满 AP 约可连续出兵 3 次)
export const AP_REGEN = 8; // 行动力每秒回复(约 4.25 秒回够一次出兵)
export const TRANSFORM_COST_UNITS = 15; // 转型消耗兵力
export const TRANSFORM_COST_AP = 50; // 转型消耗行动力
const CONTACT_RANGE = 16; // 同一条边上位置差小于此值判定遭遇(像素)
const FIGHT_RATE = 8; // 遭遇战交换速度:每秒双方各掉 8 兵(1:1)
const AI_FACTIONS: Owner[] = ['ai1', 'ai2'];

// AI 性格表:莽夫快攻不救家,龟缩死守憋满再打,猎强专挑最强对手,农夫疯狂圈地
const AI_PERSONALITIES: Personality[] = [
  { name: '莽夫', interval: 1.0, order: ['attack', 'expand', 'support'], attackFull: 0.55, minUnits: 6, huntStrong: false, supportFactor: 2, expandSlack: 5 },
  { name: '龟缩', interval: 2.2, order: ['support', 'expand', 'attack'], attackFull: 0.95, minUnits: 12, huntStrong: false, supportFactor: 1, expandSlack: 5 },
  { name: '猎强', interval: 1.5, order: ['attack', 'support', 'expand'], attackFull: 0.8, minUnits: 8, huntStrong: true, supportFactor: 1, expandSlack: 5 },
  { name: '农夫', interval: 2.0, order: ['expand', 'support', 'attack'], attackFull: 0.95, minUnits: 12, huntStrong: false, supportFactor: 1, expandSlack: 2 },
];

const SUPPORT_RICH = 15; // 安全塔兵力达到此值才视为"富裕",可派兵支援

// 等级 -> 产兵速率(个/秒)与兵力上限(仅限制生产,增援可超出)
const LEVEL_STATS: Record<number, { rate: number; cap: number }> = {
  1: { rate: 0.6, cap: 20 },
  2: { rate: 1.0, cap: 40 },
  3: { rate: 1.6, cap: 60 },
};

// 塔类型修正:产速/上限倍率、守方减伤(来袭有效兵力折扣)、AP 回复倍率
const KIND_MODS: Record<TowerKind, { prodMul: number; capMul: number; defMul: number; apMul: number }> = {
  normal: { prodMul: 1, capMul: 1, defMul: 1, apMul: 1 },
  fortress: { prodMul: 0.5, capMul: 1, defMul: 0.75, apMul: 1 }, // 守战减伤 25%,产兵慢
  barracks: { prodMul: 2, capMul: 0.5, defMul: 1, apMul: 1 }, // 造血快但囤不住
  watch: { prodMul: 1, capMul: 1, defMul: 1, apMul: 2 }, // 指挥中枢,AP 回复快
  mine: { prodMul: 0, capMul: 1, defMul: 1, apMul: 1 }, // 不产兵,光环见 MINE_AURA
};
const MINE_AURA = 0.5; // 每座相邻己方矿塔为产速加成 +50%(可叠加)

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
  kind?: TowerKind; // 默认普通塔
}

export function createGame(levelIndex: number, defs: TowerInit[], edges: [number, number][]): GameState {
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
      kind: d.kind ?? 'normal',
      units: d.units,
      level: levelOf(d.units),
      prodAcc: 0,
      ap: AP_MAX,
    })),
    squads: [],
    edges,
    phase: 'playing',
    levelIndex,
    time: 0,
    aiTimers,
    aiTraits,
    nextSquadId: 1,
  };
}

// 两塔之间是否有道路(无向)
export function hasEdge(state: GameState, a: number, b: number): boolean {
  return state.edges.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

// 联机中客人掉线后,把该势力交给 AI 接管;也可用于开局时摘除真人势力的 AI(先 delete 再按需调用)
export function assignAi(state: GameState, faction: Owner): void {
  const p = AI_PERSONALITIES[Math.floor(Math.random() * AI_PERSONALITIES.length)];
  state.aiTraits[faction] = p;
  state.aiTimers[faction] = p.interval;
}

// 塔转型:己方普通塔消耗兵力+AP 变为指定类型(单向);资源不足或已转型则失败
export function transformTower(state: GameState, id: number, kind: TowerKind): boolean {
  const t = state.towers[id];
  if (!t || t.kind !== 'normal' || kind === 'normal') return false;
  if (!['fortress', 'barracks', 'watch', 'mine'].includes(kind)) return false;
  if (t.units < TRANSFORM_COST_UNITS || t.ap < TRANSFORM_COST_AP) return false;
  t.units -= TRANSFORM_COST_UNITS;
  t.ap -= TRANSFORM_COST_AP;
  t.kind = kind;
  t.level = levelOf(t.units);
  return true;
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
  if (!hasEdge(state, fromId, toId)) return false; // 只能沿道路派兵
  if (from.ap < SEND_COST) return false; // 行动力不足无法出兵
  const count = Math.floor(from.units * SEND_RATIO);
  if (count < 1) return false;
  from.units -= count;
  from.ap -= SEND_COST;
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
    fighting: false,
    dmgAcc: 0,
  });
  return true;
}

function arrive(state: GameState, squad: Squad): void {
  const t = state.towers[squad.target];
  if (!t) return;
  if (t.owner === squad.owner) {
    t.units += squad.count;
  } else {
    // 堡垒类守方减伤:来袭队伍有效兵力打折(只作用于到达结算,路上遭遇战不受影响)
    t.units -= squad.count * KIND_MODS[t.kind].defMul;
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

// 威胁评估:每座己方塔的净威胁(在路上敌军 - 在路上己方援军)与最近敌军到达时间(秒)
function assessThreats(
  state: GameState,
  faction: Owner,
): { threat: Map<number, number>; enemyEta: Map<number, number> } {
  const threat = new Map<number, number>();
  const enemyEta = new Map<number, number>();
  for (const s of state.squads) {
    const target = state.towers[s.target];
    if (!target || target.owner !== faction) continue;
    const v = threat.get(s.target) ?? 0;
    if (s.owner === faction) {
      threat.set(s.target, v - s.count); // 己方援军抵消威胁
    } else {
      threat.set(s.target, v + s.count);
      const eta = (s.dist - s.travelled) / SQUAD_SPEED;
      const cur = enemyEta.get(s.target);
      if (cur === undefined || eta < cur) enemyEta.set(s.target, eta);
    }
  }
  return { threat, enemyEta };
}

// 支援:威胁超标的塔,由最近的安全富裕塔派一半兵力去救;援军到不了就放弃
function doSupport(
  state: GameState,
  faction: Owner,
  trait: Personality,
  threat: Map<number, number>,
  enemyEta: Map<number, number>,
  busy: Set<number>,
): void {
  const mine = state.towers.filter((t) => t.owner === faction);
  const inDanger = mine
    .filter((t) => (threat.get(t.id) ?? 0) > t.units * trait.supportFactor)
    .sort((a, b) => (threat.get(b.id) ?? 0) - (threat.get(a.id) ?? 0));
  for (const weak of inDanger) {
    // 最近的可用安全塔(邻接、无敌军在路上、兵力富裕、本 tick 未出兵、不是自己)
    let best: Tower | null = null;
    let bestDist = Infinity;
    for (const o of mine) {
      if (o.id === weak.id || busy.has(o.id)) continue;
      if (!hasEdge(state, o.id, weak.id)) continue; // 道路约束:只能邻接支援
      if ((threat.get(o.id) ?? 0) > 0 || o.units < SUPPORT_RICH) continue;
      const d = Math.hypot(o.x - weak.x, o.y - weak.y);
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    if (!best) continue;
    const eta = enemyEta.get(weak.id);
    if (eta !== undefined && bestDist / SQUAD_SPEED >= eta) continue; // 援军到不了,不白送
    if (sendUnits(state, best.id, weak.id)) busy.add(best.id);
  }
}

// 扩张:低门槛抢邻接灰塔,按"兵力 + 距离×0.02"挑目标;路上兵力够了就顺延下一座
function doExpand(state: GameState, faction: Owner, trait: Personality, busy: Set<number>): void {
  const mine = state.towers.filter((t) => t.owner === faction);
  const neutrals = state.towers
    .filter((t) => t.owner === 'neutral' && mine.some((o) => hasEdge(state, o.id, t.id)))
    .map((t) => {
      const near = mine
        .filter((o) => hasEdge(state, o.id, t.id))
        .reduce((m, o) => Math.min(m, Math.hypot(o.x - t.x, o.y - t.y)), Infinity);
      return { t, score: t.units + near * 0.02 };
    })
    .sort((a, b) => a.score - b.score);
  for (const { t } of neutrals) {
    let inbound = state.squads
      .filter((s) => s.owner === faction && s.target === t.id)
      .reduce((sum, s) => sum + s.count, 0);
    if (inbound >= t.units) continue; // 已有足够队伍在路上,去重
    // 就近派出满足低门槛的邻接塔
    const candidates = mine
      .filter((o) => !busy.has(o.id) && hasEdge(state, o.id, t.id) && o.units >= t.units + trait.expandSlack)
      .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
    for (const o of candidates) {
      if (inbound >= t.units) break;
      const sent = Math.floor(o.units * SEND_RATIO);
      if (sendUnits(state, o.id, t.id)) {
        busy.add(o.id);
        inbound += sent;
      }
    }
  }
}

// 进攻:全势力集火同一目标,蓄到高门槛才出兵
function doAttack(state: GameState, faction: Owner, trait: Personality, busy: Set<number>): void {
  const foes = state.towers.filter((o) => o.owner !== faction && o.owner !== 'neutral');
  if (foes.length === 0) return;

  // 猎强性格先锁定总兵力最强的对手势力,在目标选择时优先它的塔
  let strongest: Owner | null = null;
  if (trait.huntStrong) {
    let best = -1;
    for (const o of foes.map((t) => t.owner)) {
      const p = factionPower(state, o);
      if (p > best) {
        best = p;
        strongest = o;
      }
    }
  }

  // 道路约束下每座塔独立选目标:优先打邻接的"目标势力"塔,否则打最弱的邻接敌塔
  for (const t of state.towers) {
    if (t.owner !== faction || busy.has(t.id)) continue;
    // 蓄到接近满员再倾巢进攻:多塔兵力叠加才能压过守方的生产恢复(上限按塔类型修正)
    if (t.units < trait.minUnits) continue;
    if (t.units < LEVEL_STATS[t.level].cap * KIND_MODS[t.kind].capMul * trait.attackFull) continue;
    const adjacent = foes.filter((f) => hasEdge(state, t.id, f.id));
    if (adjacent.length === 0) continue;
    const preferred =
      strongest === null ? [] : adjacent.filter((f) => f.owner === strongest);
    const pool = preferred.length > 0 ? preferred : adjacent;
    const target = pool.reduce((a, b) => (b.units < a.units ? b : a));
    if (sendUnits(state, t.id, target.id)) busy.add(t.id);
  }
}

function aiTick(state: GameState, faction: Owner): void {
  const trait = state.aiTraits[faction];
  if (!trait) return;
  const { threat, enemyEta } = assessThreats(state, faction);
  const busy = new Set<number>(); // 本 tick 已出兵的塔,避免一座塔重复行动
  for (const b of trait.order) {
    if (b === 'support') doSupport(state, faction, trait, threat, enemyEta, busy);
    else if (b === 'expand') doExpand(state, faction, trait, busy);
    else doAttack(state, faction, trait, busy);
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

  // 行动力回复(中立塔也回,简化逻辑;哨塔回复更快;只有主动出兵才消耗)
  for (const t of state.towers) {
    t.ap = Math.min(AP_MAX, t.ap + AP_REGEN * KIND_MODS[t.kind].apMul * dt);
  }

  // 产兵(中立塔与矿塔不产兵,到达上限后停止;矿塔为相邻己方塔提供产速光环)
  for (const t of state.towers) {
    if (t.owner === 'neutral') continue;
    const mods = KIND_MODS[t.kind];
    if (mods.prodMul === 0) continue;
    const stats = LEVEL_STATS[t.level];
    const cap = stats.cap * mods.capMul;
    if (t.units >= cap) continue;
    let mines = 0;
    for (const o of state.towers) {
      if (o.kind === 'mine' && o.owner === t.owner && hasEdge(state, o.id, t.id)) mines++;
    }
    t.prodAcc += stats.rate * mods.prodMul * (1 + mines * MINE_AURA) * dt;
    const n = Math.floor(t.prodAcc);
    if (n > 0) {
      t.prodAcc -= n;
      t.units = Math.min(cap, t.units + n);
      t.level = levelOf(t.units);
    }
  }

  // 遭遇判定:不同势力、同一条边(含对向)、沿边位置足够近 -> 双方停下交战
  // 边上位置统一换算为"距 from 端点的距离",对向队伍用 dist - travelled
  const battles: [Squad, Squad][] = [];
  for (const s of state.squads) s.fighting = false;
  for (let i = 0; i < state.squads.length; i++) {
    for (let j = i + 1; j < state.squads.length; j++) {
      const a = state.squads[i];
      const b = state.squads[j];
      if (a.owner === b.owner) continue;
      let pa: number, pb: number;
      if (a.from === b.from && a.target === b.target) {
        pa = a.travelled;
        pb = b.travelled;
      } else if (a.from === b.target && a.target === b.from) {
        pa = a.travelled;
        pb = b.dist - b.travelled;
      } else {
        continue; // 不在同一条边上(跨边空中交叉不算相遇)
      }
      if (Math.abs(pa - pb) < CONTACT_RANGE) {
        a.fighting = true;
        b.fighting = true;
        battles.push([a, b]);
      }
    }
  }

  // 队伍行军(交战中的队伍停驻)
  for (const s of state.squads) {
    if (s.fighting) continue;
    s.travelled += SQUAD_SPEED * dt;
    s.x += s.dirX * SQUAD_SPEED * dt;
    s.y += s.dirY * SQUAD_SPEED * dt;
  }
  const arrived = state.squads.filter((s) => !s.fighting && s.travelled >= s.dist);
  if (arrived.length > 0) {
    const arrivedIds = new Set(arrived.map((s) => s.id));
    state.squads = state.squads.filter((s) => !arrivedIds.has(s.id));
    for (const s of arrived) arrive(state, s);
  }

  // 遭遇战结算:1:1 互相消减,清零的队伍移除(幸存方下一 tick 继续行军)
  for (const [a, b] of battles) {
    a.dmgAcc += FIGHT_RATE * dt;
    b.dmgAcc += FIGHT_RATE * dt;
  }
  let anyDead = false;
  for (const s of state.squads) {
    if (!s.fighting || s.dmgAcc < 1) continue;
    const dead = Math.floor(s.dmgAcc);
    s.dmgAcc -= dead;
    s.count -= dead;
    if (s.count <= 0) anyDead = true;
  }
  if (anyDead) state.squads = state.squads.filter((s) => s.count > 0);

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
