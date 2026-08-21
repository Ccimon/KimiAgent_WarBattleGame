// 关卡编辑器:可视化编辑 LevelDef(放塔/标边/改属性)、试玩、导出代码贴回 levels.ts(设计见 docs/编辑器设计.md)
// 编辑永远基于横版 960x600 原始坐标;竖屏时显示层经 toPortrait 转置,指针坐标反向还原
import {
  createGame,
  towerAt,
  TOWER_RADIUS,
  type EdgeDef,
  type GameState,
  type Owner,
  type TowerInit,
  type TowerKind,
} from './game';
import { LEVELS, toPortrait, type LevelDef } from './levels';

type Tool = 'select' | 'add' | 'link' | 'delete';

interface EditDef {
  name: string;
  towers: TowerInit[];
  edges: EdgeDef[];
}

// 原始坐标画布固定为横版 960x600(关卡只按横版设计的既有约定)
const RAW_W = 960;
const RAW_H = 600;

let def: EditDef = { name: '新关卡', towers: [], edges: [] };
let tool: Tool = 'select';
let selected: number | null = null;
let dragging = false; // 选择工具下正在拖动移塔
let linkFrom: number | null = null; // 连线工具的起点塔
let bend: { edge: number; via: number } | null = null; // 正在拖动的弯折点(连线工具下按住道路拖出)
let bendMoved = false; // 弯折点是否拖动过(未拖动松开 = 删除该弯折点;新建的点未拖动即点空,顺带删除等于无操作)
let pointer = { x: 0, y: 0 }; // 最近一次指针位置(显示坐标,连线预览用)
let disp: GameState = createGame(-1, [], []); // 显示用状态(竖屏已转置,塔为副本)
let active = false;
let onPlaytestCb: (def: LevelDef) => void = () => {};
let onExitCb: () => void = () => {};

// ---------- DOM ----------

const panelEl = document.querySelector<HTMLDivElement>('#editor-panel')!;
const levelSelEl = document.querySelector<HTMLSelectElement>('#ed-level')!;
const nameInputEl = document.querySelector<HTMLInputElement>('#ed-name')!;
const propsEl = document.querySelector<HTMLDivElement>('#ed-props')!;
const ownerSelEl = document.querySelector<HTMLSelectElement>('#ed-owner')!;
const unitsInputEl = document.querySelector<HTMLInputElement>('#ed-units')!;
const posXInputEl = document.querySelector<HTMLInputElement>('#ed-pos-x')!;
const posYInputEl = document.querySelector<HTMLInputElement>('#ed-pos-y')!;
const kindSelEl = document.querySelector<HTMLSelectElement>('#ed-kind')!;
const exportAreaEl = document.querySelector<HTMLDivElement>('#ed-export-area')!;
const exportTextEl = document.querySelector<HTMLTextAreaElement>('#ed-export-text')!;
const warnEl = document.querySelector<HTMLDivElement>('#ed-warn')!;
const cursorEl = document.querySelector<HTMLSpanElement>('#ed-cursor')!;

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

// 显示坐标 -> 横版原始坐标(竖屏时 x/y 互换还原)
function toRaw(p: { x: number; y: number }): { x: number; y: number } {
  return isPortrait() ? { x: p.y, y: p.x } : p;
}

// 摆放吸附:对齐到 10px 网格(现有关卡坐标都是 10 的倍数);更精细的调整用属性面板的坐标输入
const SNAP = 10;
function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

function clampRound(v: number, max: number): number {
  return Math.min(Math.max(snap(v), TOWER_RADIUS), max - TOWER_RADIUS);
}

// 工具栏右侧的坐标读数:显示指针当前(吸附后)的横版原始坐标
function updateCursor(p: { x: number; y: number }): void {
  const r = toRaw(p);
  cursorEl.textContent = `(${clampRound(r.x, RAW_W)}, ${clampRound(r.y, RAW_H)})`;
}

// 每次改动后重建显示状态(塔很少,直接整体重建最简单)
function rebuild(): void {
  const raw: LevelDef = { name: def.name, towers: def.towers, edges: def.edges };
  const d = isPortrait() ? toPortrait(raw) : raw;
  disp = createGame(-1, d.towers, d.edges);
  renderProps();
}

// ---------- 面板 ----------

function renderProps(): void {
  const t = selected !== null ? def.towers[selected] : null;
  propsEl.style.display = t ? 'flex' : 'none';
  if (!t) return;
  ownerSelEl.value = t.owner;
  unitsInputEl.value = String(t.units);
  posXInputEl.value = String(t.x);
  posYInputEl.value = String(t.y);
  kindSelEl.value = t.kind ?? 'normal';
}

function updateWarn(): string {
  const hasPlayer = def.towers.some((t) => t.owner === 'player');
  const hasAi = def.towers.some((t) => t.owner === 'ai1' || t.owner === 'ai2');
  if (!hasPlayer || !hasAi) return '警告:关卡需要至少 1 座蓝方塔和 1 座 AI 塔';
  return '';
}

// ---------- 编辑操作 ----------

function toggleEdge(a: number, b: number): void {
  const i = def.edges.findIndex((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  if (i >= 0) def.edges.splice(i, 1);
  else def.edges.push([a, b]);
}

function deleteTower(id: number): void {
  def.towers.splice(id, 1);
  // 删除关联边,其余边下标前移
  const remap = (i: number): number => (i > id ? i - 1 : i);
  def.edges = def.edges
    .filter((e) => e[0] !== id && e[1] !== id)
    .map((e) => (e.length === 3 ? [remap(e[0]), remap(e[1]), e[2]] : [remap(e[0]), remap(e[1])]));
  if (selected === id) selected = null;
  else if (selected !== null && selected > id) selected -= 1;
  rebuild();
}

// ---------- 弯折点(曲线道路) ----------

// 横版原始坐标 -> 显示坐标(竖屏转置)
function toDisp(x: number, y: number): { x: number; y: number } {
  return isPortrait() ? { x: y, y: x } : { x, y };
}

// 一条边的显示坐标折线(塔心 + 弯折点)
function edgeDispPts(e: EdgeDef): { x: number; y: number }[] {
  const ta = disp.towers[e[0]];
  const tb = disp.towers[e[1]];
  const via = e.length === 3 ? e[2].map(([x, y]) => toDisp(x, y)) : [];
  return [{ x: ta.x, y: ta.y }, ...via, { x: tb.x, y: tb.y }];
}

function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0), 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

const BEND_HIT = 12; // 弯折点/道路的命中半径(显示坐标像素)

// 连线工具下点空白处:命中已有弯折点则抓起,命中道路中段则插入新弯折点并抓起
function grabBend(p: { x: number; y: number }): void {
  for (let ei = 0; ei < def.edges.length; ei++) {
    const e = def.edges[ei];
    const pts = edgeDispPts(e);
    // 先查已有弯折点(pts[1..n-2] 即 via)
    for (let vi = 1; vi < pts.length - 1; vi++) {
      if (Math.hypot(p.x - pts[vi].x, p.y - pts[vi].y) <= BEND_HIT) {
        bend = { edge: ei, via: vi - 1 };
        bendMoved = false;
        return;
      }
    }
  }
  for (let ei = 0; ei < def.edges.length; ei++) {
    const e = def.edges[ei];
    // 命中判定按平滑后的曲线(与画面一致,paths 与 def.edges 顺序对应)
    const path = disp.paths[ei];
    if (!path) continue;
    let hitCurve = false;
    for (let k = 0; k < path.pts.length - 1; k++) {
      if (distToSeg(p, path.pts[k], path.pts[k + 1]) <= BEND_HIT) {
        hitCurve = true;
        break;
      }
    }
    if (!hitCurve) continue;
    // 插入位置按控制点折线(塔心+弯折点)最近的段决定
    const pts = edgeDispPts(e);
    let bestK = 0;
    let bestD = Infinity;
    for (let k = 0; k < pts.length - 1; k++) {
      const d = distToSeg(p, pts[k], pts[k + 1]);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    // 在第 bestK 段处插入新弯折点,via 下标即段号
    const via = e.length === 3 ? [...e[2]] : [];
    const r = toRaw(p);
    via.splice(bestK, 0, [clampRound(r.x, RAW_W), clampRound(r.y, RAW_H)]);
    def.edges[ei] = [e[0], e[1], via];
    bend = { edge: ei, via: bestK };
    bendMoved = false;
    rebuild();
    return;
  }
}

// 拖动中的弯折点移到指针处(吸附网格)
function moveBend(p: { x: number; y: number }): void {
  if (!bend) return;
  const e = def.edges[bend.edge];
  if (e.length !== 3) return;
  const r = toRaw(p);
  e[2][bend.via] = [clampRound(r.x, RAW_W), clampRound(r.y, RAW_H)];
  bendMoved = true;
  rebuild();
}

// 松开:未拖动过 = 点击,删除该弯折点(新建的点没拖动也顺带删掉,即点一下道路无操作)
function releaseBend(): void {
  if (!bend) return;
  if (!bendMoved) {
    const e = def.edges[bend.edge];
    if (e.length === 3) {
      e[2].splice(bend.via, 1);
      if (e[2].length === 0) def.edges[bend.edge] = [e[0], e[1]]; // 没有弯折点了退回直线边
      rebuild();
    }
  }
  bend = null;
  bendMoved = false;
}

// ---------- 指针交互(main.ts 在编辑器模式下委托过来,坐标为显示逻辑坐标) ----------

export function editorPointerDown(p: { x: number; y: number }): void {
  pointer = p;
  updateCursor(p);
  const hit = towerAt(disp, p.x, p.y);
  if (tool === 'add') {
    if (hit) return; // 点在已有塔上不加
    const r = toRaw(p);
    def.towers.push({ x: clampRound(r.x, RAW_W), y: clampRound(r.y, RAW_H), owner: 'neutral', units: 10 });
    selected = def.towers.length - 1;
    rebuild();
    return;
  }
  if (tool === 'delete') {
    if (hit) deleteTower(hit.id);
    return;
  }
  if (tool === 'link') {
    if (hit) {
      linkFrom = hit.id;
    } else {
      grabBend(p); // 点在道路/弯折点上 = 掰弯道路
    }
    return;
  }
  selected = hit ? hit.id : null;
  dragging = hit !== null;
  renderProps();
}

export function editorPointerMove(p: { x: number; y: number }): void {
  pointer = p;
  updateCursor(p);
  if (bend) {
    moveBend(p);
    return;
  }
  if (tool === 'select' && dragging && selected !== null) {
    const r = toRaw(p);
    def.towers[selected].x = clampRound(r.x, RAW_W);
    def.towers[selected].y = clampRound(r.y, RAW_H);
    rebuild();
  }
}

export function editorPointerUp(p: { x: number; y: number }): void {
  pointer = p;
  if (bend) {
    releaseBend();
    return;
  }
  if (tool === 'link' && linkFrom !== null) {
    const hit = towerAt(disp, p.x, p.y);
    if (hit && hit.id !== linkFrom) toggleEdge(linkFrom, hit.id);
    linkFrom = null;
    rebuild();
  }
  dragging = false;
}

// ---------- 导出 ----------

// 生成与 levels.ts 手写风格一致的 LevelDef 代码片段
function exportCode(): string {
  const lines: string[] = [];
  lines.push('  {');
  lines.push(`    name: '${def.name.replace(/'/g, "\\'")}',`);
  lines.push('    towers: [');
  for (const t of def.towers) {
    const kind = t.kind && t.kind !== 'normal' ? `, kind: '${t.kind}'` : '';
    lines.push(`      { x: ${t.x}, y: ${t.y}, owner: '${t.owner}', units: ${t.units}${kind} },`);
  }
  lines.push('    ],');
  lines.push('    edges: [');
  for (const e of def.edges) {
    if (e.length === 3) {
      const via = e[2].map(([x, y]) => `[${x}, ${y}]`).join(', ');
      lines.push(`      [${e[0]}, ${e[1]}, [${via}]],`);
    } else {
      lines.push(`      [${e[0]}, ${e[1]}],`);
    }
  }
  lines.push('    ],');
  lines.push('  },');
  return lines.join('\n');
}

// ---------- 对 main.ts 的接口 ----------

export function enterEditor(): void {
  active = true;
  panelEl.classList.add('show');
  rebuild();
}

export function isEditorActive(): boolean {
  return active;
}

export function editorOnResize(): void {
  if (active) rebuild();
}

export function editorState(): GameState {
  return disp;
}

// 编辑器附加层:弯折点 + 选中塔高亮圈 + 连线预览(在主 draw() 之后叠加)
export function editorDraw(ctx: CanvasRenderingContext2D): void {
  // 弯折点(小圆点,连线工具下可拖动/点击删除)
  for (const e of def.edges) {
    if (e.length !== 3) continue;
    for (const [x, y] of e[2]) {
      const d = toDisp(x, y);
      ctx.beginPath();
      ctx.arc(d.x, d.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  if (selected !== null && disp.towers[selected]) {
    const t = disp.towers[selected];
    ctx.beginPath();
    ctx.arc(t.x, t.y, TOWER_RADIUS + 9, 0, Math.PI * 2);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (tool === 'link' && linkFrom !== null && disp.towers[linkFrom]) {
    const t = disp.towers[linkFrom];
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function initEditor(callbacks: {
  onPlaytest: (def: LevelDef) => void;
  onExit: () => void;
}): void {
  onPlaytestCb = callbacks.onPlaytest;
  onExitCb = callbacks.onExit;

  // 工具切换
  for (const btn of panelEl.querySelectorAll<HTMLButtonElement>('.ed-tools button')) {
    btn.addEventListener('click', () => {
      tool = btn.dataset.tool as Tool;
      linkFrom = null;
      for (const b of panelEl.querySelectorAll<HTMLButtonElement>('.ed-tools button')) {
        b.classList.toggle('active', b === btn);
      }
    });
  }

  // 关卡下拉:新建 / 载入现有关卡副本
  levelSelEl.innerHTML =
    '<option value="-1">新建关卡</option>' +
    LEVELS.map((l, i) => `<option value="${i}">编辑:${l.name}</option>`).join('');
  levelSelEl.addEventListener('change', () => {
    const i = Number(levelSelEl.value);
    if (i < 0) {
      def = { name: '新关卡', towers: [], edges: [] };
    } else {
      def = JSON.parse(JSON.stringify(LEVELS[i])) as EditDef;
    }
    selected = null;
    nameInputEl.value = def.name;
    rebuild();
  });
  nameInputEl.value = def.name;
  nameInputEl.addEventListener('input', () => {
    def.name = nameInputEl.value;
  });

  // 属性面板
  ownerSelEl.addEventListener('change', () => {
    if (selected === null) return;
    def.towers[selected].owner = ownerSelEl.value as Owner;
    rebuild();
  });
  unitsInputEl.addEventListener('change', () => {
    if (selected === null) return;
    def.towers[selected].units = Math.max(0, Math.round(Number(unitsInputEl.value) || 0));
    rebuild();
  });
  // 坐标直填:不吸附(用于精细微调),只夹在画布范围内
  const onPosInput = (): void => {
    if (selected === null) return;
    const t = def.towers[selected];
    t.x = Math.min(Math.max(Math.round(Number(posXInputEl.value) || 0), TOWER_RADIUS), RAW_W - TOWER_RADIUS);
    t.y = Math.min(Math.max(Math.round(Number(posYInputEl.value) || 0), TOWER_RADIUS), RAW_H - TOWER_RADIUS);
    rebuild();
  };
  posXInputEl.addEventListener('change', onPosInput);
  posYInputEl.addEventListener('change', onPosInput);
  kindSelEl.addEventListener('change', () => {
    if (selected === null) return;
    const k = kindSelEl.value as TowerKind;
    if (k === 'normal') delete def.towers[selected].kind;
    else def.towers[selected].kind = k;
    rebuild();
  });
  document.querySelector('#ed-del-tower')!.addEventListener('click', () => {
    if (selected !== null) deleteTower(selected);
  });

  // 试玩:隐藏面板但保留工作副本,对局中可经 HUD「返回编辑器」回来
  document.querySelector('#ed-playtest')!.addEventListener('click', () => {
    const warn = updateWarn();
    if (warn && !window.confirm(`${warn},仍要试玩吗?`)) return;
    active = false;
    panelEl.classList.remove('show');
    onPlaytestCb(JSON.parse(JSON.stringify({ ...def, towers: def.towers, edges: def.edges })) as LevelDef);
  });

  // 导出代码
  document.querySelector('#ed-export')!.addEventListener('click', () => {
    exportTextEl.value = exportCode();
    warnEl.textContent = updateWarn();
    exportAreaEl.classList.add('show');
  });
  document.querySelector('#ed-export-close')!.addEventListener('click', () => {
    exportAreaEl.classList.remove('show');
  });
  document.querySelector('#ed-copy')!.addEventListener('click', () => {
    exportTextEl.select();
    void navigator.clipboard?.writeText(exportTextEl.value).catch(() => {
      document.execCommand('copy'); // 剪贴板 API 不可用时退回选中原件手动复制
    });
  });

  // 数值调参页签开关(面板内容在 tuning.ts 生成)
  document.querySelector('#ed-tuning')!.addEventListener('click', () => {
    document.querySelector('#ed-tuning-area')!.classList.toggle('show');
  });

  document.querySelector('#ed-exit')!.addEventListener('click', () => {
    active = false;
    panelEl.classList.remove('show');
    onExitCb();
  });
}
