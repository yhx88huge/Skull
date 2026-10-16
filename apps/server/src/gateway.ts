import type { Server } from 'socket.io';
import { C2S, S2C } from '@skull/protocol';
import type { RoomAction } from '@skull/protocol';
import type { Lobby } from './lobby';
import type { Room } from './roomManager';

const id = () => Math.random().toString(36).slice(2, 12);

export function attachGateway(io: Server, lobby: Lobby): void {
  lobby.setOnChange((room) => emitRoomState(io, lobby, room));
  io.on('connection', (socket) => {
    const sdata = socket.data as { playerId?: string; roomCode?: string; roomId?: string };

    socket.on(C2S.roomCreate, async (payload: { name?: string; settings?: unknown } = {}) => {
      try {
        const name = String(payload.name ?? '旅人').trim().slice(0, 12) || '旅人';
        const settings = typeof payload.settings === 'object' && payload.settings ? (payload.settings as any) : {};
        const room = await lobby.create(name, settings);
        const host = room.players[0];
        sdata.playerId = host.id;
        sdata.roomCode = room.code;
        await socket.join(roomCodeName(room.code));
        socket.emit(S2C.roomCreated, { roomCode: room.code, playerId: host.id });
        emitRoomState(io, lobby, room);
      } catch (e) {
        socket.emit(S2C.roomError, { code: codeOf(e), message: msgOf(e) });
      }
    });

    socket.on(C2S.roomJoin, async (payload: { roomCode?: string; name?: string }) => {
      try {
        const code = String(payload.roomCode ?? '').trim().toUpperCase();
        const name = String(payload.name ?? '旅人').trim().slice(0, 12) || '旅人';
        const room = await lobby.join(code, name);
        const p = room.players[room.players.length - 1];
        sdata.playerId = p.id;
        sdata.roomCode = room.code;
        await socket.join(roomCodeName(room.code));
        socket.emit(S2C.roomJoined, { roomCode: room.code, playerId: p.id });
        emitRoomState(io, lobby, room);
      } catch (e) {
        socket.emit(S2C.roomError, { code: codeOf(e), message: msgOf(e) });
      }
    });

    socket.on(C2S.reconnect, async (payload: { roomCode?: string; playerId?: string; name?: string }) => {
      try {
        const code = String(payload.roomCode ?? '').trim().toUpperCase();
        const pid = String(payload.playerId ?? '');
        const name = String(payload.name ?? '旅人').trim().slice(0, 12) || '旅人';
        // verify membership
        const room = lobby.get(code);
        if (!room || !room.players.some((p) => p.id === pid)) throw new Error('NOT_IN_ROOM');
        await lobby.reconnect(code, pid, name);
        sdata.playerId = pid;
        sdata.roomCode = code;
        await socket.join(roomCodeName(code));
        socket.emit(S2C.roomJoined, { roomCode: code, playerId: pid });
        emitRoomState(io, lobby, room);
      } catch (e) {
        socket.emit(S2C.roomError, { code: codeOf(e), message: msgOf(e) });
      }
    });

    socket.on(C2S.roomReady, async (payload: { ready?: boolean }) => {
      await guard(async (code, pid) => {
        await lobby.ready(code, pid, !!payload.ready);
      });
    });

    socket.on(C2S.roomStart, async () => {
      await guard(async (code, pid) => {
        try {
          const room = await lobby.start(code, pid);
          emitGamestate(io, lobby, room);
        } catch (e) {
          socket.emit(S2C.roomError, { code: codeOf(e), message: msgOf(e) });
        }
      });
    });

    socket.on(C2S.gameAction, async (payload: { actionId?: string; action?: RoomAction }) => {
      await guard(async (code, pid) => {
        const actionId = String(payload.actionId ?? id());
        const result = await lobby.action(code, pid, actionId, payload.action as RoomAction);
        if (!result.ok) {
          socket.emit(S2C.roomError, { code: result.error, message: friendlyError(result.error), actionId });
          return;
        }
        const room = lobby.get(code);
        if (!room) return;
        // public engine events for everyone
        for (const ev of result.events) {
          io.to(roomCodeName(code)).emit(S2C.gameEvent, ev);
        }
        emitRoomState(io, lobby, room);
        if (room.game?.phase === 'FINISHED' && room.game.winnerId) {
          io.to(roomCodeName(code)).emit(S2C.gameEnded, {
            winnerId: room.game.winnerId,
            reason: 'finished',
            players: room.players,
          });
        }
      });
    });

    socket.on(C2S.snapshotRequest, () => {
      const code = sdata.roomCode;
      const pid = sdata.playerId;
      if (!code || !pid) return;
      const snap = lobby.snapshot(code, pid);
      if (snap) socket.emit(S2C.roomState, snap);
    });

    socket.on('disconnect', () => {
      const code = sdata.roomCode;
      const pid = sdata.playerId;
      if (code && pid) {
        lobby.markDisconnected(code, pid);
        setTimeout(() => {
          const room = lobby.get(code);
          if (room) emitRoomState(io, lobby, room);
        }, 20);
      }
    });

    async function guard(fn: (code: string, pid: string) => Promise<void>) {
      const code = sdata.roomCode;
      const pid = sdata.playerId;
      if (!code || !pid) {
        socket.emit(S2C.roomError, { code: 'NOT_IN_ROOM', message: '请先创建或加入房间' });
        return;
      }
      try {
        await fn(code, pid);
      } catch (e) {
        if (!io.sockets.sockets.has(socket.id)) return;
        socket.emit(S2C.roomError, { code: codeOf(e), message: msgOf(e) });
      }
    }
  });
}

function roomCodeName(code: string) {
  return `room:${code}`;
}

/** Broadcast updated room state (with private secrets) to every member socket. */
function emitRoomState(io: Server, lobby: Lobby, room: Room): void {
  const socketIds = io.sockets.adapter.rooms.get(roomCodeName(room.code));
  if (!socketIds) return;
  for (const sid of socketIds) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    const pid = (s.data as { playerId?: string }).playerId ?? '';
    const snap = lobby.snapshot(room.code, pid);
    if (snap) s.emit(S2C.roomState, snap);
  }
}

function emitGamestate(io: Server, lobby: Lobby, room: Room): void {
  emitRoomState(io, lobby, room);
  if (room.game?.phase === 'FINISHED' && room.game.winnerId) {
    io.to(roomCodeName(room.code)).emit(S2C.gameEnded, { winnerId: room.game.winnerId, reason: 'finished' });
  }
}

function codeOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function msgOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const friendly: Record<string, string> = {
  ROOM_NOT_FOUND: '房间不存在或已解散',
  ROOM_FULL: '房间已满',
  GAME_IN_PROGRESS: '对局已开始，无法加入',
  NOT_IN_ROOM: '你不在该房间中',
  NOT_HOST: '只有房主可以开始',
  NOT_READY: '有玩家尚未准备',
  NOT_YOUR_TURN: '还没轮到你',
  WRONG_PHASE: '当前阶段不允许该操作',
  NO_DISC_TO_PLACE: '没有可放置的圆片',
  BID_OUT_OF_RANGE: '报价超出范围',
  BID_NOT_INCREASING: '报价必须更高',
  ALREADY_PASSED: '你已经弃权',
  NOT_CHALLENGER: '只有挑战者可以揭示',
  MUST_REVEAL_SELF_FIRST: '必须先揭示自己的全部圆片',
  INVALID_TARGET: '无法揭示该牌堆',
  NOT_PENALTY_PLAYER: '现在不是你的惩罚选择',
  INVALID_DISC: '选择的圆片无效',
  INSUFFICIENT_PLAYERS: '人数不足',
};

function friendlyError(code?: string): string {
  return (code && friendly[code]) || code || '操作失败';
}