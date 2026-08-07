// P2P 联机层:PeerJS 公共云做信令,游戏数据走 WebRTC DataChannel 直连
// 房主权威:房主跑游戏逻辑并广播快照,客人只发出兵指令
import Peer, { type DataConnection } from 'peerjs';
import type { Owner, Phase } from './game';

export interface SnapSquad {
  id: number;
  owner: Owner;
  from: number;
  target: number;
  count: number;
  travelled: number;
}

export interface Snapshot {
  t: 'snap';
  towers: { owner: Owner; units: number }[];
  squads: SnapSquad[];
  phase: Phase;
}

export type HostMsg = { t: 'start'; levelIndex: number } | Snapshot;
export type GuestMsg = { t: 'cmd'; from: number; to: number };

const ID_PREFIX = 'tower-battle-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export interface HostCallbacks {
  onReady: (code: string) => void; // 房间创建成功,展示房间码
  onGuestJoin: () => void;
  onCmd: (from: number, to: number) => void;
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
      });
      c.on('close', () => {
        conn = null;
        cbs.onGuestLeave();
      });
    });
  }

  function create(): void {
    const code = randomCode();
    const peer = new Peer(ID_PREFIX + code);
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
  destroy(): void;
}

export function joinRoom(code: string, cbs: GuestCallbacks): GuestHandle {
  const peer = new Peer();
  let conn: DataConnection | null = null;
  let started = false;

  peer.on('open', () => {
    conn = peer.connect(ID_PREFIX + code.trim().toUpperCase());
    conn.on('open', () => {
      started = true;
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
  });
  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') cbs.onError('找不到这个房间,请检查房间码');
    else cbs.onError('连接失败:' + err.type);
  });

  return {
    sendCmd(from, to) {
      if (conn?.open) conn.send({ t: 'cmd', from, to } satisfies GuestMsg);
    },
    destroy() {
      peer.destroy();
    },
  };
}
