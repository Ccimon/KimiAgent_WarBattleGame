# AGENTS.md

## 项目概览

Tower Battle(连线塔战):一个 2D 塔防策略小游戏,支持单机和 P2P 联机(房间码直连)。玩家从己方塔按住拖动到目标塔,松开时派出一半兵力;前 3 关为两方对抗(蓝 vs 红),第 4~6 关为三方混战(蓝 vs 红 ai1 vs 紫 ai2,两个 AI 也会互相攻击);消灭所有 AI 势力的塔即胜利。联机模式:房主创建房间得 6 位房间码,朋友输入房间码加入,房主选关(仅三方关卡)并开始;房主玩蓝方、客人玩红方(ai1 真人控制)、紫方为 AI;房主浏览器跑权威逻辑,每 100ms 广播快照,客人只发出兵指令;客人掉线后红方由 AI 接管。使用 TypeScript + Vite 开发,Canvas 2D 渲染,UI 文案和代码注释均为中文。

## 技术栈与目录结构

- TypeScript 5 + Vite 5(devDependencies);运行时依赖仅 `peerjs`(P2P 联机,用其公共云 broker 做 WebRTC 信令,游戏数据走 DataChannel 直连)。
- `index.html` —— 页面入口:内联全部 CSS,包含 `<canvas id="game">`、HUD 按钮(上一关/重开/下一关)、胜负 overlay、大厅 overlay(单机/创建房间/加入房间,房间码展示与选关)和操作提示文案。
- `src/main.ts` —— 入口:三种模式(solo/host/guest)、大厅接线、关卡加载、`requestAnimationFrame` 主循环、Pointer 事件(拖放出兵,guest 模式发指令而非本地出兵)、HUD/overlay 按钮绑定、canvas 按 devicePixelRatio 缩放。逻辑画布固定为 960x600。host 模式跑 `update` 主循环并每 100ms 广播快照;guest 模式不跑逻辑,按快照刷新、本地推进队伍位置做平滑。
- `src/net.ts` —— P2P 联机层:`hostRoom`/`joinRoom` 封装 PeerJS,房间码即 Peer ID(前缀 `tower-battle-`);ICE 配置含 Google STUN + OpenRelay 免费 TURN 中继(对称 NAT/受限网络直连失败时走 TCP 443 中继);消息协议:客→主 `{t:'cmd',from,to}`,主→客 `{t:'start',levelIndex}` 与 `{t:'snap',towers,squads,phase}` 快照(只带动态字段,几何由客人端按 levelIndex 本地重建)。
- `src/game.ts` —— 纯逻辑层(无 DOM 依赖):`Owner`('player'/'ai1'/'ai2'/'neutral')、`GameState`/`Tower`/`Squad` 类型,`createGame`、`sendUnits`、`towerAt`、`hasEdge`、`update(dt)`;**道路机制**(`GameState.edges`,只能沿边派兵,设计见 `docs/道路与行动力设计.md`)、**行动力机制**(每塔 `ap`,上限 100,出兵固定扣 34,每秒回 8,不足则 `sendUnits` 失败);内置产兵速率/上限表、等级推导(`levelOf`,兵力 >=35 为 3 级、>=15 为 2 级)、行为制 AI(设计见 `docs/AI行为设计.md`:每次 `aiTick` 按性格顺序评估 支援/扩张/进攻 三种行为,均受道路邻接约束——支援按净威胁一对一救援且有"援军到不了就放弃"判断,扩张低门槛抢中立塔并去重,进攻每塔打最弱邻接敌塔、猎强优先最强势力)、AI 性格表 `AI_PERSONALITIES`(莽夫/龟缩/猎强/农夫,`createGame` 时为每个 AI 势力随机分配)、每势力独立计时、胜负判定(玩家全灭判负,所有 AI 势力全灭判胜)。
- `src/levels.ts` —— 关卡数据 `LEVELS`(`LevelDef` = 名称 + 初始塔数组 + 道路边表 `edges`,6 关全部手工标边),目前共 6 关(前 3 关两方,后 3 关三方会战)。
- `src/render.ts` —— Canvas 绘制层:`draw(ctx, state, drag)`,只读 `GameState`,含道路连线、塔下行动力条、拖拽预览(高亮邻接合法目标,行动力不足时预览变灰)。
- `启动游戏.command` —— macOS 双击启动脚本:检测 5173 端口、首次运行自动 `npm install`,然后 `npm run dev` 并自动打开浏览器。

分层约定:`game.ts` 不 import 渲染/DOM,`render.ts` 只读不改游戏状态,`main.ts` 负责粘合两者。

## 构建与运行命令

- `npm run dev` —— 启动 Vite 开发服务器(默认 5173 端口);macOS 上也可双击 `启动游戏.command`。
- `npm run build` —— 先 `tsc`(类型检查,noEmit)再 `vite build`,产物输出到 `dist/`。
- `npm run preview` —— 预览构建产物。

## 代码风格

- 严格 TypeScript:`strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`(改代码后须能通过 `npm run build` 的类型检查)。
- `target` ES2020,ESM(`"type": "module"`),`moduleResolution: "bundler"`,允许 import 带 `.ts` 扩展名(项目内 import 均不带扩展名)。
- 函数短小、具名常量集中定义在文件顶部(如 `SQUAD_SPEED`、`AI_INTERVAL`、`LEVEL_STATS`),调数值优先改这些常量。
- 注释与 UI 文案使用简体中文,遵循现有注释密度(关键逻辑行内注释,不写冗余文档)。

## 测试

项目目前没有测试框架和测试脚本,验证方式即 `npm run build` 通过类型检查 + 开发服务器中手动试玩。如要加测试,`game.ts` 是纯函数/纯数据,最容易单测(如 `sendUnits`、`update`、AI 行为)。

## 部署

静态站点:`npm run build` 后将 `dist/` 部署到任意静态托管即可,无自建服务端、无环境变量。联机依赖 PeerJS 公共云 broker(0.peerjs.com)做信令,需联网;游戏数据为浏览器间 WebRTC 直连。

## 安全注意事项

单机无网络请求;联机模式会连接 PeerJS 公共云(仅交换 WebRTC 信令和房间码,房间码不保密,知道即可加入),直连失败时游戏流量会经 OpenRelay(Metered)公共 TURN 中继转发。无用户输入持久化(localStorage 未使用)、无密钥。注意 `package.json` 中 `"private": true`,不要误发布到 npm。
