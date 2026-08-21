import type { EdgeDef, TowerInit } from './game';

export interface LevelDef {
  name: string;
  towers: TowerInit[];
  edges: EdgeDef[]; // 道路:[a,b] 直线 或 [a,b,via] 过途经点的平滑曲线(无向,只能沿边派兵)
}

// 竖屏布局:坐标 x/y 互换(保距变换),关卡只需按横版 960x600 设计一次,竖屏自动转置
export function toPortrait(def: LevelDef): LevelDef {
  return {
    name: def.name,
    edges: def.edges.map((e) =>
      e.length === 3
        ? ([e[0], e[1], e[2].map(([x, y]) => [y, x] as [number, number])] as EdgeDef)
        : ([e[0], e[1]] as EdgeDef),
    ),
    towers: def.towers.map((t) => ({ ...t, x: t.y, y: t.x })),
  };
}

// 塔类型:普通(默认不标)/fortress 堡垒/barracks 兵营/watch 哨塔/mine 矿塔,设计见 docs/塔类型设计.md
// 逻辑画布 960x600
export const LEVELS: LevelDef[] = [
  {
    name: '第 1 关',
    towers: [
      { x: 140, y: 300, owner: 'player', units: 30 },
      { x: 480, y: 300, owner: 'neutral', units: 10, kind: 'mine' }, // 中立矿塔:先到先得的经济点
      { x: 820, y: 300, owner: 'ai1', units: 25 },
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    name: '第 2 关',
    towers: [
      { x: 130, y: 170, owner: 'player', units: 30 },
      { x: 130, y: 430, owner: 'player', units: 20, kind: 'barracks' },
      { x: 480, y: 300, owner: 'neutral', units: 15 },
      { x: 480, y: 110, owner: 'neutral', units: 8, kind: 'mine' },
      { x: 830, y: 170, owner: 'ai1', units: 30 },
      { x: 830, y: 430, owner: 'ai1', units: 25, kind: 'fortress' },
    ],
    edges: [
      [0, 1],
      [0, 3],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [4, 5],
    ],
  },
  {
    name: '第 3 关',
    towers: [
      { x: 120, y: 300, owner: 'player', units: 35 },
      { x: 360, y: 130, owner: 'neutral', units: 12, kind: 'watch' },
      { x: 360, y: 470, owner: 'neutral', units: 12, kind: 'mine' },
      { x: 600, y: 300, owner: 'neutral', units: 20, kind: 'barracks' },
      { x: 830, y: 140, owner: 'ai1', units: 35, kind: 'fortress' },
      { x: 830, y: 460, owner: 'ai1', units: 35 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 4],
      [3, 5],
      [4, 5],
    ],
  },
  // 三方会战:玩家(蓝)vs ai1(红)vs ai2(紫),中立塔作缓冲
  {
    name: '第 4 关',
    towers: [
      { x: 140, y: 460, owner: 'player', units: 30 },
      { x: 820, y: 460, owner: 'ai1', units: 30 },
      { x: 480, y: 110, owner: 'ai2', units: 30 },
      { x: 480, y: 400, owner: 'neutral', units: 12, kind: 'watch' },
      { x: 300, y: 250, owner: 'neutral', units: 10, kind: 'mine' },
      { x: 660, y: 250, owner: 'neutral', units: 10, kind: 'barracks' },
    ],
    edges: [
      [0, 4],
      [0, 3, [[280, 520]]], // 绕行南下的曲线道路
      [1, 3, [[680, 520]]],
      [1, 5],
      [2, 4, [[360, 120]]],
      [2, 5, [[600, 120]]],
      [3, 4],
      [3, 5],
    ],
  },
  {
    name: '第 5 关',
    towers: [
      { x: 120, y: 140, owner: 'player', units: 30 },
      { x: 840, y: 140, owner: 'ai1', units: 30, kind: 'fortress' },
      { x: 480, y: 500, owner: 'ai2', units: 35, kind: 'barracks' },
      { x: 480, y: 200, owner: 'neutral', units: 15, kind: 'watch' },
      { x: 250, y: 400, owner: 'neutral', units: 10, kind: 'mine' },
      { x: 710, y: 400, owner: 'neutral', units: 10, kind: 'mine' },
    ],
    edges: [
      [0, 3, [[280, 90]]], // 北侧绕行的曲线道路
      [1, 3, [[680, 90]]],
      [2, 4],
      [2, 5],
      [3, 4],
      [3, 5],
      [4, 5, [[480, 340]]],
      [0, 4],
      [1, 5],
    ],
  },
  {
    name: '第 6 关',
    towers: [
      { x: 140, y: 300, owner: 'player', units: 35 },
      { x: 820, y: 140, owner: 'ai1', units: 35, kind: 'barracks' },
      { x: 820, y: 460, owner: 'ai2', units: 35, kind: 'fortress' },
      { x: 480, y: 300, owner: 'neutral', units: 20, kind: 'mine' },
      { x: 480, y: 110, owner: 'neutral', units: 12, kind: 'watch' },
      { x: 480, y: 490, owner: 'neutral', units: 12, kind: 'barracks' },
    ],
    edges: [
      [0, 3, [[300, 210]]], // 绕开中路的曲线
      [3, 4],
      [3, 5],
      [4, 1, [[660, 80]]],
      [5, 2, [[660, 540]]],
      [4, 5, [[620, 300]]], // 原本穿过中央塔,改为东侧绕行
    ],
  },
  // 更多三方会战:据点加密(9~12 塔),道路成网,争夺点更多
  {
    name: '第 7 关',
    towers: [
      { x: 130, y: 300, owner: 'player', units: 35 },
      { x: 260, y: 300, owner: 'player', units: 20 },
      { x: 830, y: 130, owner: 'ai1', units: 35 },
      { x: 700, y: 200, owner: 'ai1', units: 20 },
      { x: 830, y: 470, owner: 'ai2', units: 35 },
      { x: 700, y: 400, owner: 'ai2', units: 20 },
      { x: 480, y: 300, owner: 'neutral', units: 12, kind: 'watch' }, // 中央哨塔:AP 中枢,无减伤不蹲坑
      { x: 480, y: 110, owner: 'neutral', units: 12, kind: 'barracks' },
      { x: 480, y: 490, owner: 'neutral', units: 12, kind: 'barracks' }, // 上下对称同类型,避免红紫争夺价值不对等
    ],
    edges: [
      [0, 1],
      [2, 3],
      [4, 5],
      [1, 6],
      [3, 6],
      [5, 6],
      [1, 7],
      [3, 7],
      [1, 8],
      [5, 8],
      [7, 6],
      [8, 6],
      [3, 5], // 红紫右翼直接相邻,开局即摩擦
    ],
  },
  {
    name: '第 8 关',
    towers: [
      { x: 100, y: 300, owner: 'player', units: 35 },
      { x: 240, y: 300, owner: 'player', units: 18 }, // 蓝方双塔都在中轴线上,上下对称
      { x: 860, y: 110, owner: 'ai1', units: 35 },
      { x: 720, y: 200, owner: 'ai1', units: 18 },
      { x: 860, y: 490, owner: 'ai2', units: 35 },
      { x: 720, y: 400, owner: 'ai2', units: 18 },
      { x: 480, y: 300, owner: 'neutral', units: 15, kind: 'mine' }, // 中央矿塔:三方光环争夺点
      { x: 480, y: 120, owner: 'neutral', units: 12, kind: 'barracks' },
      { x: 480, y: 480, owner: 'neutral', units: 12, kind: 'barracks' }, // 上下对称同类型
      { x: 360, y: 300, owner: 'neutral', units: 10 }, // 蓝方门前跳板,换进军中央慢半拍
    ],
    edges: [
      [0, 1],
      [2, 3],
      [4, 5],
      [1, 9],
      [9, 6],
      [1, 7, [[330, 180]]], // 北路弧线绕向兵营
      [1, 8, [[330, 420]]], // 南路弧线镜像对称
      [3, 7],
      [5, 8],
      [3, 6],
      [5, 6],
      [7, 6],
      [8, 6],
    ],
  },
  {
    name: '第 9 关',
    towers: [
      { x: 130, y: 140, owner: 'player', units: 32 },
      { x: 300, y: 200, owner: 'player', units: 16 },
      { x: 830, y: 140, owner: 'ai1', units: 32 },
      { x: 660, y: 200, owner: 'ai1', units: 16 },
      { x: 480, y: 520, owner: 'ai2', units: 32 },
      { x: 480, y: 400, owner: 'ai2', units: 16 },
      { x: 480, y: 160, owner: 'neutral', units: 12, kind: 'barracks' }, // 北兵营:蓝红对撞
      { x: 240, y: 420, owner: 'neutral', units: 12, kind: 'mine' }, // 西矿:蓝紫对撞
      { x: 720, y: 420, owner: 'neutral', units: 12, kind: 'mine' }, // 东矿:红紫对撞
      { x: 480, y: 300, owner: 'neutral', units: 10 }, // 中央普通塔:兵力薄,赢外圈者迅速捅穿中路滚雪球
    ],
    edges: [
      [0, 1],
      [2, 3],
      [4, 5],
      [1, 6],
      [3, 6], // 北兵营:蓝 vs 红
      [1, 7],
      [5, 7], // 西矿:蓝 vs 紫
      [3, 8],
      [5, 8], // 东矿:红 vs 紫
      [6, 9],
      [7, 9],
      [8, 9], // 三个外围据点都通中央堡垒,滚起雪球直捣黄龙
      [5, 9], // 紫方分塔离侧矿远,直通中央补偿扩张速度
    ],
  },
];
