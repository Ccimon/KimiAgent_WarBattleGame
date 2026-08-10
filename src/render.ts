import type { GameState, Owner } from './game';
import { TOWER_RADIUS, hasEdge, AP_MAX, SEND_COST } from './game';

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

  // 行动力条(塔下方,不足一次出兵时变暗)
  const apW = 40;
  const apY = t.y + TOWER_RADIUS + 6;
  ctx.fillStyle = '#334155';
  ctx.fillRect(t.x - apW / 2, apY, apW, 5);
  ctx.fillStyle = t.ap >= SEND_COST ? '#4ade80' : '#64748b';
  ctx.fillRect(t.x - apW / 2, apY, (apW * t.ap) / AP_MAX, 5);
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

  // 交战特效:闪烁的白色锯齿圈提示这里在打
  if (s.fighting) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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

  // 道路(塔间连线,只能沿边派兵)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 6]);
  for (const [a, b] of state.edges) {
    const ta = state.towers[a];
    const tb = state.towers[b];
    ctx.beginPath();
    ctx.moveTo(ta.x, ta.y);
    ctx.lineTo(tb.x, tb.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const s of state.squads) drawSquad(ctx, state, s);
  // 拖拽时高亮起点和所有邻接(合法目标)塔
  for (const t of state.towers)
    drawTower(
      ctx,
      state,
      t.id,
      drag.fromId !== null && (t.id === drag.fromId || hasEdge(state, drag.fromId, t.id)),
    );

  // 拖线预览(行动力不足时变灰提示)
  if (drag.fromId !== null) {
    const from = state.towers[drag.fromId];
    const usable = from.ap >= SEND_COST;
    const lineColor = usable ? '#facc15' : '#64748b';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(drag.x, drag.y);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);

    // 预览派出数量
    const count = Math.floor(from.units * 0.5);
    if (count > 0) {
      ctx.fillStyle = lineColor;
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(usable ? `-${count}` : '行动力不足', drag.x, drag.y - 12);
    }
  }
}
