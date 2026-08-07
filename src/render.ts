import type { GameState, Owner } from './game';
import { TOWER_RADIUS } from './game';

export const COLORS: Record<Owner, string> = {
  player: '#3b82f6',
  ai1: '#ef4444',
  ai2: '#a855f7',
  neutral: '#9ca3af',
};

const COLORS_DARK: Record<Owner, string> = {
  player: '#1d4ed8',
  ai1: '#b91c1c',
  ai2: '#7e22ce',
  neutral: '#6b7280',
};

export interface DragState {
  fromId: number | null;
  x: number;
  y: number;
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  id: number,
  highlight: boolean,
): void {
  const t = state.towers[id];
  const color = COLORS[t.owner];

  // 底座
  ctx.beginPath();
  ctx.arc(t.x, t.y, TOWER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = COLORS_DARK[t.owner];
  ctx.fill();

  ctx.beginPath();
  ctx.arc(t.x, t.y, TOWER_RADIUS - 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (highlight) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, TOWER_RADIUS + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 等级标记(顶部小方块)
  for (let i = 0; i < t.level; i++) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(t.x - (t.level * 10) / 2 + i * 10 + 1, t.y - TOWER_RADIUS - 12, 8, 6);
  }

  // 兵力数字
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.floor(t.units)), t.x, t.y);
}

function drawSquad(ctx: CanvasRenderingContext2D, state: GameState, s: (typeof state.squads)[number]): void {
  const from = state.towers[s.from];
  const color = COLORS[s.owner];
  const r = 9 + Math.min(12, s.count * 0.25);

  // 行军轨迹
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(s.x, s.y);
  ctx.strokeStyle = color + '44';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(s.count), s.x, s.y);
}

export function draw(ctx: CanvasRenderingContext2D, state: GameState, drag: DragState): void {
  // 背景
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 960, 600);

  // 背景网格
  ctx.strokeStyle = '#33415555';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 960; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 600);
    ctx.stroke();
  }
  for (let y = 0; y <= 600; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
  }

  for (const s of state.squads) drawSquad(ctx, state, s);
  for (const t of state.towers) drawTower(ctx, state, t.id, drag.fromId === t.id);

  // 拖线预览
  if (drag.fromId !== null) {
    const from = state.towers[drag.fromId];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(drag.x, drag.y);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);

    // 预览派出数量
    const count = Math.floor(from.units * 0.5);
    if (count > 0) {
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`-${count}`, drag.x, drag.y - 12);
    }
  }
}
