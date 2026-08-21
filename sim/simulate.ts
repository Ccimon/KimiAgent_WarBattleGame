// 无头模拟器:脱离浏览器批量跑 AI 对战,统计各势力胜率,用于验证数值调整(设计见 docs/编辑器设计.md)
// 用法:npm run sim -- [关卡号1-9] [局数] [配置JSON路径]   默认:第 4 关、100 局、默认配置
import { readFileSync } from 'node:fs';
import { assignAi, createGame, update, type GameState, type Owner } from '../src/game';
import { LEVELS } from '../src/levels';
import { applyConfig } from '../src/config';

const DT = 0.1; // 固定步长(秒)
const TIME_LIMIT = 900; // 单局时长上限(秒),超时记为平局
const FACTIONS: Owner[] = ['player', 'ai1', 'ai2'];
const FACTION_NAMES: Record<string, string> = { player: '蓝方', ai1: '红方', ai2: '紫方', draw: '超时平局' };

const levelNum = Number(process.argv[2] ?? 4);
const games = Math.max(1, Number(process.argv[3] ?? 100));
const configPath = process.argv[4];

if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > LEVELS.length) {
  console.error(`关卡号必须是 1-${LEVELS.length}`);
  process.exit(1);
}
if (configPath) {
  applyConfig(JSON.parse(readFileSync(configPath, 'utf-8')));
  console.log(`已加载配置覆盖:${configPath}`);
}

const def = LEVELS[levelNum - 1];

// 存活的非中立势力(有塔或有行军队伍)
function aliveFactions(state: GameState): Owner[] {
  return FACTIONS.filter(
    (f) => state.towers.some((t) => t.owner === f) || state.squads.some((s) => s.owner === f),
  );
}

function runOne(): { winner: Owner | 'draw'; time: number } {
  const state = createGame(levelNum - 1, def.towers, def.edges);
  for (const f of aliveFactions(state)) assignAi(state, f); // 所有参赛势力都交给 AI
  while (state.time < TIME_LIMIT) {
    if (aliveFactions(state).length <= 1) break;
    // phase 语义以真人蓝方为基准(蓝方全灭即 lost 并冻结 update);全员 AI 时强制续跑,让 AI 之间分出胜负
    state.phase = 'playing';
    update(state, DT);
  }
  const alive = aliveFactions(state);
  return { winner: alive.length === 1 ? alive[0] : 'draw', time: state.time };
}

console.log(`模拟:${def.name} × ${games} 局(步长 ${DT}s,上限 ${TIME_LIMIT}s)`);
const wins: Record<string, number> = {};
let totalTime = 0;
for (let i = 0; i < games; i++) {
  const r = runOne();
  wins[r.winner] = (wins[r.winner] ?? 0) + 1;
  totalTime += r.time;
}
for (const k of [...FACTIONS, 'draw']) {
  const n = wins[k] ?? 0;
  if (n > 0 || k !== 'draw') {
    console.log(`${FACTION_NAMES[k]}:${String(n).padStart(4)} 胜  ${((n / games) * 100).toFixed(1)}%`);
  }
}
console.log(`平均时长:${(totalTime / games).toFixed(1)}s`);
