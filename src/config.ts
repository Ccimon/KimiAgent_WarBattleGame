// 游戏数值配置:原 game.ts 顶部常量抽取为运行时可调的单例,供调参面板/模拟器覆盖(设计见 docs/编辑器设计.md)
// game.ts 在函数内实时读 CONFIG.xxx,改动立即生效;定稿后把调好的值贴回 DEFAULT_CONFIG
import type { Personality, TowerKind } from './game';

export interface GameConfig {
  squadSpeed: number; // 队伍行军速度(像素/秒)
  sendRatio: number; // 出兵比例(派出兵力的该比例)
  sendCost: number; // 每次出兵固定消耗行动力
  apMax: number; // 行动力上限
  apRegen: number; // 行动力每秒回复
  transformCostUnits: number; // 转型消耗兵力
  transformCostAp: number; // 转型消耗行动力
  contactRange: number; // 遭遇判定:同边位置差小于此值交战(像素)
  fightRate: number; // 遭遇战交换速度:每秒双方各掉该值兵力(1:1)
  mineAura: number; // 每座相邻己方矿塔的产速加成(可叠加)
  supportRich: number; // AI 支援:安全塔兵力达到此值才视为"富裕"
  levelStats: Record<number, { rate: number; cap: number }>; // 等级 -> 产兵速率/上限
  kindMods: Record<TowerKind, { prodMul: number; capMul: number; defMul: number; apMul: number }>; // 塔类型修正
  aiPersonalities: Personality[]; // AI 性格表
}

// 默认值即原 game.ts 硬编码常量(注释保留设计意图)
export const DEFAULT_CONFIG: GameConfig = {
  squadSpeed: 110,
  sendRatio: 0.5,
  sendCost: 34, // 满 AP 约可连续出兵 3 次
  apMax: 100,
  apRegen: 8, // 约 4.25 秒回够一次出兵
  transformCostUnits: 15,
  transformCostAp: 50,
  contactRange: 16,
  fightRate: 8,
  mineAura: 0.5, // 每座相邻己方矿塔为产速加成 +50%
  supportRich: 15,
  levelStats: {
    1: { rate: 0.7, cap: 20 },
    2: { rate: 1.1, cap: 40 },
    3: { rate: 1.3, cap: 60 },
  },
  kindMods: {
    normal: { prodMul: 1, capMul: 1, defMul: 1, apMul: 1 },
    fortress: { prodMul: 0.5, capMul: 1, defMul: 0.75, apMul: 1 }, // 守战减伤 25%,产兵慢
    barracks: { prodMul: 2, capMul: 0.75, defMul: 1, apMul: 1 }, // 造血快但囤不住
    watch: { prodMul: 1, capMul: 1, defMul: 1, apMul: 2 }, // 指挥中枢,AP 回复快
    mine: { prodMul: 0, capMul: 1, defMul: 1, apMul: 1 }, // 不产兵,光环见 mineAura
  },
  aiPersonalities: [
    // 莽夫快攻不救家,龟缩死守憋满再打,猎强专挑最强对手,农夫疯狂圈地
    { name: '莽夫', interval: 1.0, order: ['attack', 'expand', 'support'], attackFull: 0.55, minUnits: 6, huntStrong: false, supportFactor: 2, expandSlack: 5 },
    { name: '龟缩', interval: 2.2, order: ['support', 'expand', 'attack'], attackFull: 0.95, minUnits: 12, huntStrong: false, supportFactor: 1, expandSlack: 5 },
    { name: '猎强', interval: 1.5, order: ['attack', 'support', 'expand'], attackFull: 0.8, minUnits: 8, huntStrong: true, supportFactor: 1, expandSlack: 5 },
    { name: '农夫', interval: 2.0, order: ['expand', 'support', 'attack'], attackFull: 0.95, minUnits: 12, huntStrong: false, supportFactor: 1, expandSlack: 2 },
  ],
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// 深合并 plain object(数组/基础类型直接覆盖),供 applyConfig/resetConfig 用
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const tv = target[k];
    if (
      pv !== null && typeof pv === 'object' && !Array.isArray(pv) &&
      tv !== null && typeof tv === 'object' && !Array.isArray(tv)
    ) {
      deepMerge(tv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      target[k] = clone(pv);
    }
  }
}

// 可变单例:游戏逻辑运行时读取;保持引用稳定,reset/apply 均为原地修改
export const CONFIG: GameConfig = clone(DEFAULT_CONFIG);

export function resetConfig(): void {
  deepMerge(CONFIG as unknown as Record<string, unknown>, clone(DEFAULT_CONFIG) as unknown as Record<string, unknown>);
}

// 用部分/完整 JSON 覆盖当前配置(调参面板导入、模拟器加载配置文件)
export function applyConfig(patch: Partial<GameConfig>): void {
  deepMerge(CONFIG as unknown as Record<string, unknown>, patch as Record<string, unknown>);
}
