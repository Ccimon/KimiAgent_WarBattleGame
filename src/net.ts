// P2P 联机层:PeerJS 公共云做信令,游戏数据走 WebRTC DataChannel 直连
// 房主权威:房主跑游戏逻辑并广播快照,客人只发出兵指令
import Peer, { type DataConnection } from 'peerjs';
import type { Owner, Phase, TowerKind } from './game';

export interface SnapSquad {
  id: number;
  owner: Owner;
  from: number;
  target: number;
  count: number;
  travelled: number;
  fighting: boolean; // 交战中:客人端不再本地推进
}

export interface Snapshot {
  t: 'snap';
  towers: { owner: Owner; units: number; ap: number; kind: TowerKind }[];
  squads: SnapSquad[];
  phase: Phase;
}

export type HostMsg = { t: 'start'; levelIndex: number } | Snapshot;
export type GuestMsg =
  | { t: 'cmd'; from: number; to: number }
  | { t: 'transform'; tower: number; kind: TowerKind };

const ID_PREFIX = 'tower-battle-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符

// ICE 服务器:国内可达 STUN(小米/B站,Google STUN 在国内被墙会导致打洞失败)
// + Google STUN + OpenRelay 免费 TURN 中继(含 TCP 443,对称 NAT/受限网络下走中继)
// 注意:直连失败时游戏流量会经过 Metered 的公共中继,介意隐私可换成自建 TURN
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.chat.bilibili.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export interface HostCallbacks {
  onReady: (code: string) => void; // 房间创建成功,展示房间码
  onGuestJoin: () => void;
  onCmd: (from: number, to: number) => void;
  onTransform: (tower: number, kind: TowerKind) => void;
  onGuestLeave: () => void;
  onError: (msg: string) => void;
}

export interface HostHandle {
  send(msg: HostMsg): void;
  hasGuest(): boolean;
  destroy(): void;
}

export function hostRoom(cbs: HostCallbacks): HostHandle {
  let conn: DataConnection | null = null;

  function listen(peer: Peer): void {
    peer.on('connection', (c) => {
      if (conn) {
        c.close(); // 只接待一个客人
        return;
      }
      conn = c;
      c.on('open', () => cbs.onGuestJoin());
      c.on('data', (data) => {
        const m = data as GuestMsg;
        if (m.t === 'cmd') cbs.onCmd(m.from, m.to);
        else if (m.t === 'transform') cbs.onTransform(m.tower, m.kind);
      });
      c.on('close', () => {
        conn = null;
        cbs.onGuestLeave();
      });
    });
  }

  function create(): void {
    const code = randomCode();
    const peer = new Peer(ID_PREFIX + code, { config: { iceServers: ICE_SERVERS } });
    peer.on('open', () => cbs.onReady(code));
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer.destroy();
        create(); // 房间码撞了,换一个重试
      } else {
        cbs.onError('连接信令服务器失败:' + err.type);
      }
    });
    listen(peer);
    handle._peer = peer;
  }

  const handle: HostHandle & { _peer?: Peer } = {
    send(msg) {
      if (conn?.open) conn.send(msg);
    },
    hasGuest() {
      return conn !== null && conn.open;
    },
    destroy() {
      this._peer?.destroy();
    },
  };
  create();
  return handle;
}

export interface GuestCallbacks {
  onConnected: () => void;
  onStart: (levelIndex: number) => void;
  onSnap: (snap: Snapshot) => void;
  onHostLeave: () => void;
  onError: (msg: string) => void;
}

export interface GuestHandle {
  sendCmd(from: number, to: number): void;
  sendTransform(tower: number, kind: TowerKind): void;
  destroy(): void;
}

export function joinRoom(code: string, cbs: GuestCallbacks): GuestHandle {
  const peer = new Peer({ config: { iceServers: ICE_SERVERS } });
  let conn: DataConnection | null = null;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  peer.on('open', () => {
    conn = peer.connect(ID_PREFIX + code.trim().toUpperCase());
    conn.on('open', () => {
      started = true;
      clearTimeout(timer);
      cbs.onConnected();
    });
    conn.on('data', (data) => {
      const m = data as HostMsg;
      if (m.t === 'start') cbs.onStart(m.levelIndex);
      else if (m.t === 'snap') cbs.onSnap(m);
    });
    conn.on('close', () => {
      if (started) cbs.onHostLeave();
    });
    conn.on('error', () => {
      clearTimeout(timer);
      if (!started) cbs.onError('P2P 直连失败,请双方检查网络(代理/防火墙)后重试');
    });
    // ICE 打洞超时兜底:避免一直卡在"连接中…"
    timer = setTimeout(() => {
      if (!started) {
        cbs.onError('连接超时,可能是 NAT 打洞失败,请重试或更换网络');
        peer.destroy();
      }
    }, 15000);
  });
  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') cbs.onError('找不到这个房间,请检查房间码');
    else cbs.onError('连接失败:' + err.type);
  });

  return {
    sendCmd(from, to) {
      if (conn?.open) conn.send({ t: 'cmd', from, to } satisfies GuestMsg);
    },
    sendTransform(tower, kind) {
      if (conn?.open) conn.send({ t: 'transform', tower, kind } satisfies GuestMsg);
    },
    destroy() {
      clearTimeout(timer);
      peer.destroy();
    },
  };
}
