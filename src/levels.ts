import type { TowerInit } from './game';

export interface LevelDef {
  name: string;
  towers: TowerInit[];
}

// 逻辑画布 960x600
export const LEVELS: LevelDef[] = [
  {
    name: '第 1 关',
    towers: [
      { x: 140, y: 300, owner: 'player', units: 30 },
      { x: 480, y: 300, owner: 'neutral', units: 10 },
      { x: 820, y: 300, owner: 'ai1', units: 25 },
    ],
  },
  {
    name: '第 2 关',
    towers: [
      { x: 130, y: 170, owner: 'player', units: 30 },
      { x: 130, y: 430, owner: 'player', units: 20 },
      { x: 480, y: 300, owner: 'neutral', units: 15 },
      { x: 480, y: 110, owner: 'neutral', units: 8 },
      { x: 830, y: 170, owner: 'ai1', units: 30 },
      { x: 830, y: 430, owner: 'ai1', units: 25 },
    ],
  },
  {
    name: '第 3 关',
    towers: [
      { x: 120, y: 300, owner: 'player', units: 35 },
      { x: 360, y: 130, owner: 'neutral', units: 12 },
      { x: 360, y: 470, owner: 'neutral', units: 12 },
      { x: 600, y: 300, owner: 'neutral', units: 20 },
      { x: 830, y: 140, owner: 'ai1', units: 35 },
      { x: 830, y: 460, owner: 'ai1', units: 35 },
    ],
  },
  // 三方会战:玩家(蓝)vs ai1(红)vs ai2(紫),中立塔作缓冲
  {
    name: '第 4 关',
    towers: [
      { x: 140, y: 460, owner: 'player', units: 30 },
      { x: 820, y: 460, owner: 'ai1', units: 30 },
      { x: 480, y: 110, owner: 'ai2', units: 30 },
      { x: 480, y: 400, owner: 'neutral', units: 12 },
      { x: 300, y: 250, owner: 'neutral', units: 10 },
      { x: 660, y: 250, owner: 'neutral', units: 10 },
    ],
  },
  {
    name: '第 5 关',
    towers: [
      { x: 120, y: 140, owner: 'player', units: 30 },
      { x: 840, y: 140, owner: 'ai1', units: 30 },
      { x: 480, y: 500, owner: 'ai2', units: 35 },
      { x: 480, y: 200, owner: 'neutral', units: 15 },
      { x: 250, y: 400, owner: 'neutral', units: 10 },
      { x: 710, y: 400, owner: 'neutral', units: 10 },
    ],
  },
  {
    name: '第 6 关',
    towers: [
      { x: 140, y: 300, owner: 'player', units: 35 },
      { x: 820, y: 140, owner: 'ai1', units: 35 },
      { x: 820, y: 460, owner: 'ai2', units: 35 },
      { x: 480, y: 300, owner: 'neutral', units: 20 },
      { x: 480, y: 110, owner: 'neutral', units: 12 },
      { x: 480, y: 490, owner: 'neutral', units: 12 },
    ],
  },
];
