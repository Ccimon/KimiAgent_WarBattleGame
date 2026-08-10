import type { TowerInit } from './game';

export interface LevelDef {
  name: string;
  towers: TowerInit[];
  edges: [number, number][]; // 道路:塔下标对(无向),只能沿边派兵
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
      [0, 3],
      [1, 3],
      [1, 5],
      [2, 4],
      [2, 5],
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
      [0, 3],
      [1, 3],
      [2, 4],
      [2, 5],
      [3, 4],
      [3, 5],
      [4, 5],
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
      [0, 3],
      [3, 4],
      [3, 5],
      [4, 1],
      [5, 2],
      [4, 5],
    ],
  },
];
