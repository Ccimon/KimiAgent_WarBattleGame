// 数值调参面板:schema 驱动自动生成滑杆,运行时改写 CONFIG 立即生效(设计见 docs/编辑器设计.md)
// 工作流:滑杆试调 -> 对局/模拟器验证 -> 「复制配置代码」贴回 config.ts 的 DEFAULT_CONFIG 定稿
import { CONFIG, applyConfig, resetConfig } from './config';

interface FieldDef {
  path: string; // CONFIG 内的点路径,如 'kindMods.mine.prodMul'
  label: string;
  min: number;
  max: number;
  step: number;
}

interface GroupDef {
  title: string;
  fields: FieldDef[];
  bools?: { path: string; label: string }[]; // 开关字段(AI 性格的 huntStrong)
}

const KIND_LABELS: Record<string, string> = {
  normal: '普通',
  fortress: '堡垒',
  barracks: '兵营',
  watch: '哨塔',
  mine: '矿塔',
};

function buildGroups(): GroupDef[] {
  const groups: GroupDef[] = [
    {
      title: '全局',
      fields: [
        { path: 'squadSpeed', label: '队伍速度', min: 40, max: 300, step: 5 },
        { path: 'sendRatio', label: '出兵比例', min: 0.1, max: 1, step: 0.05 },
        { path: 'sendCost', label: '出兵耗 AP', min: 0, max: 100, step: 1 },
        { path: 'apMax', label: 'AP 上限', min: 50, max: 200, step: 5 },
        { path: 'apRegen', label: 'AP 回复/秒', min: 1, max: 30, step: 0.5 },
        { path: 'transformCostUnits', label: '转型耗兵', min: 0, max: 60, step: 1 },
        { path: 'transformCostAp', label: '转型耗 AP', min: 0, max: 100, step: 5 },
        { path: 'contactRange', label: '遭遇判定距离', min: 4, max: 48, step: 2 },
        { path: 'fightRate', label: '遭遇耗兵/秒', min: 1, max: 30, step: 1 },
        { path: 'mineAura', label: '矿塔光环加成', min: 0, max: 2, step: 0.1 },
        { path: 'supportRich', label: 'AI 支援富裕线', min: 0, max: 60, step: 1 },
      ],
    },
  ];
  // 等级表
  for (const lv of [1, 2, 3]) {
    groups.push({
      title: `${lv} 级塔`,
      fields: [
        { path: `levelStats.${lv}.rate`, label: '产速/秒', min: 0, max: 3, step: 0.05 },
        { path: `levelStats.${lv}.cap`, label: '兵力上限', min: 5, max: 150, step: 5 },
      ],
    });
  }
  // 塔类型倍率
  for (const kind of Object.keys(KIND_LABELS)) {
    groups.push({
      title: `塔类型:${KIND_LABELS[kind]}`,
      fields: [
        { path: `kindMods.${kind}.prodMul`, label: '产速倍率', min: 0, max: 3, step: 0.05 },
        { path: `kindMods.${kind}.capMul`, label: '上限倍率', min: 0.2, max: 2, step: 0.05 },
        { path: `kindMods.${kind}.defMul`, label: '守方承伤倍率', min: 0.2, max: 1.5, step: 0.05 },
        { path: `kindMods.${kind}.apMul`, label: 'AP 回复倍率', min: 0.5, max: 3, step: 0.1 },
      ],
    });
  }
  // AI 性格(order 优先级数组不在面板编辑,改代码或导入 JSON)
  CONFIG.aiPersonalities.forEach((p, i) => {
    groups.push({
      title: `AI 性格:${p.name}`,
      fields: [
        { path: `aiPersonalities.${i}.interval`, label: '决策间隔(秒)', min: 0.2, max: 5, step: 0.1 },
        { path: `aiPersonalities.${i}.attackFull`, label: '进攻蓄力线', min: 0.1, max: 1, step: 0.05 },
        { path: `aiPersonalities.${i}.minUnits`, label: '进攻最低兵力', min: 1, max: 40, step: 1 },
        { path: `aiPersonalities.${i}.supportFactor`, label: '支援触发系数', min: 0.2, max: 5, step: 0.1 },
        { path: `aiPersonalities.${i}.expandSlack`, label: '扩张门槛', min: 0, max: 30, step: 1 },
      ],
      bools: [{ path: `aiPersonalities.${i}.huntStrong`, label: '专打最强势力' }],
    });
  });
  return groups;
}

function getPath(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], CONFIG);
}

function setPath(path: string, v: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const obj = keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], CONFIG);
  (obj as Record<string, unknown>)[last] = v;
}

// ---------- DOM ----------

const fieldsEl = document.querySelector<HTMLDivElement>('#tn-fields')!;
const msgEl = document.querySelector<HTMLDivElement>('#tn-msg')!;
const importTextEl = document.querySelector<HTMLTextAreaElement>('#tn-import-text')!;

// 按 schema 重建整个面板(初始化/恢复默认/导入 JSON 后调用)
function buildPanel(): void {
  fieldsEl.innerHTML = '';
  for (const g of buildGroups()) {
    const groupEl = document.createElement('div');
    groupEl.className = 'tn-group';
    const h = document.createElement('h4');
    h.textContent = g.title;
    groupEl.appendChild(h);
    for (const f of g.fields) {
      const row = document.createElement('label');
      row.className = 'tn-row';
      const name = document.createElement('span');
      name.textContent = f.label;
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(f.min);
      range.max = String(f.max);
      range.step = String(f.step);
      range.value = String(getPath(f.path));
      const num = document.createElement('input');
      num.type = 'number';
      num.min = String(f.min);
      num.max = String(f.max);
      num.step = String(f.step);
      num.value = String(getPath(f.path));
      const onInput = (v: number): void => {
        if (Number.isNaN(v)) return;
        setPath(f.path, v);
        range.value = String(v);
        num.value = String(v);
      };
      range.addEventListener('input', () => onInput(Number(range.value)));
      num.addEventListener('change', () => onInput(Number(num.value)));
      row.append(name, range, num);
      groupEl.appendChild(row);
    }
    for (const b of g.bools ?? []) {
      const row = document.createElement('label');
      row.className = 'tn-row';
      const name = document.createElement('span');
      name.textContent = b.label;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = Boolean(getPath(b.path));
      cb.addEventListener('change', () => setPath(b.path, cb.checked));
      row.append(name, cb);
      groupEl.appendChild(row);
    }
    fieldsEl.appendChild(groupEl);
  }
}

export function initTuning(): void {
  buildPanel();

  document.querySelector('#tn-reset')!.addEventListener('click', () => {
    resetConfig();
    buildPanel();
    msgEl.textContent = '已恢复默认配置';
  });

  // 复制当前配置(JSON 即合法 TS 对象字面量,整体替换 config.ts 的 DEFAULT_CONFIG 值)
  document.querySelector('#tn-copy')!.addEventListener('click', () => {
    const code = JSON.stringify(CONFIG, null, 2);
    void navigator.clipboard?.writeText(code).then(
      () => {
        msgEl.textContent = '已复制,贴回 config.ts 的 DEFAULT_CONFIG 即可定稿';
      },
      () => {
        msgEl.textContent = '复制失败,请检查浏览器剪贴板权限';
      },
    );
  });

  // 导入 JSON 覆盖(可只给部分字段,深合并)
  document.querySelector('#tn-import-apply')!.addEventListener('click', () => {
    try {
      applyConfig(JSON.parse(importTextEl.value));
      buildPanel();
      msgEl.textContent = '已导入并生效';
    } catch {
      msgEl.textContent = 'JSON 解析失败,请检查格式';
    }
  });
}
