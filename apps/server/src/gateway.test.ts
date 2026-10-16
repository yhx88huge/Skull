import http from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { attachGateway } from './gateway';
import { Lobby } from './lobby';
import { MemoryStore } from './store';
import { C2S, S2C } from '@skull/protocol';
import type { Snapshot, GameEndedPayload } from '@skull/protocol';

interface Harness {
  port: number;
  close: () => Promise<void>;
}

async function startServer(): Promise<Harness> {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  const lobby = new Lobby(new MemoryStore());
  attachGateway(io, lobby);
  await new Promise<void>((res) => httpServer.listen(0, () => res()));
  const addr = httpServer.address() as { port: number };
  return {
    port: addr.port,
    close: async () => {
      io.close();
      await new Promise<void>((res) => httpServer.close(() => res()));
    },
  };
}

function connect(port: number): ClientSocket {
  return ioc(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
}

function once<T>(socket: ClientSocket, event: string, timeout = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data as T);
    });
  });
}

interface Seat {
  socket: ClientSocket;
  playerId: string;
  snap: Snapshot;
}

function track(seat: Seat): void {
  seat.socket.on(S2C.roomState, (d: Snapshot) => {
    seat.snap = d;
  });
}

function waitPhase(seat: Seat, phase: string, timeout = 4000): Promise<Snapshot> {
  if (seat.snap?.phase === phase) return Promise.resolve(seat.snap);
  return new Promise<Snapshot>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting phase ${phase}`)), timeout);
    const h = (d: Snapshot) => {
      if (d.phase === phase) {
        clearTimeout(t);
        seat.socket.off(S2C.roomState, h);
        resolve(d);
      }
    };
    seat.socket.on(S2C.roomState, h);
  });
}

/** Perform the next legal action for whoever's turn it is; returns false if nothing applied. */
function act(seats: Seat[]): boolean {
  const s = seats[0].snap; // same round info for everyone
  if (!s || s.phase === 'FINISHED') return false;
  const turnId = s.round.currentPlayerId ?? s.penalty?.pendingPlayerId;
  if (!turnId) return false;
  const seat = seats.find((x) => x.playerId === turnId);
  if (!seat) return false;
  const type = s.phase === 'PENALTY' ? 'choose_penalty_disc' : null;
  if (type) {
    const discId = seat.snap.penalty?.candidates?.[0];
    if (!discId) return false;
    seat.socket.emit(C2S.gameAction, { actionId: `a_${Math.random()}`, action: { type, discId } });
    return true;
  }
  switch (s.phase) {
    case 'INITIAL_PLACEMENT':
      seat.socket.emit(C2S.gameAction, { actionId: `a_${Math.random()}`, action: { type: 'place' } });
      return true;
    case 'ACTION':
      // place while holding discs, otherwise open a bid of 1
      if ((seat.snap.ownSecret?.hand.length ?? 0) > 0) {
        seat.socket.emit(C2S.gameAction, { actionId: `a_${Math.random()}`, action: { type: 'place' } });
      } else {
        seat.socket.emit(C2S.gameAction, {
          actionId: `a_${Math.random()}`,
          action: { type: 'open_bid', amount: 1 },
        });
      }
      return true;
    case 'BIDDING':
      seat.socket.emit(C2S.gameAction, { actionId: `a_${Math.random()}`, action: { type: 'pass' } });
      return true;
    case 'REVEAL': {
      const self = s.players.find((p) => p.id === turnId)!;
      const target = self.unrevealedCount > 0 ? self.id : s.players.find((p) => p.alive && p.unrevealedCount > 0)!.id;
      seat.socket.emit(C2S.gameAction, {
        actionId: `a_${Math.random()}`,
        action: { type: 'reveal', targetPlayerId: target },
      });
      return true;
    }
    default:
      return false;
  }
}

describe('websocket gateway', () => {
  it('plays a full game and supports leaving and rematch', async () => {
    const h = await startServer();
    try {
      const hostSock = connect(h.port);
      const created = once<{ roomCode: string; playerId: string }>(hostSock, S2C.roomCreated);
      hostSock.connect();
      hostSock.emit(C2S.roomCreate, { name: 'Host' });
      const { roomCode, playerId: hostId } = await created;

      const seats: Seat[] = [{ socket: hostSock, playerId: hostId, snap: null as unknown as Snapshot }];
      track(seats[0]);

      for (const name of ['B', 'C']) {
        const sock = connect(h.port);
        const joined = once<{ roomCode: string; playerId: string }>(sock, S2C.roomJoined);
        sock.connect();
        sock.emit(C2S.roomJoin, { roomCode, name });
        const j = await joined;
        const seat: Seat = { socket: sock, playerId: j.playerId, snap: null as unknown as Snapshot };
        track(seat);
        seats.push(seat);
        sock.emit(C2S.roomReady, { ready: true });
      }

      // wait until everyone shows up, then start
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && (seats[0].snap?.players.length ?? 0) < 3) {
        await new Promise((r) => setTimeout(r, 30));
      }
      expect(seats[0].snap.players).toHaveLength(3);

      const hostSeat = seats[0];
      hostSeat.socket.emit(C2S.roomStart);
      await waitPhase(hostSeat, 'INITIAL_PLACEMENT');
      // every member receives the game snapshot
      await waitPhase(seats[1], 'INITIAL_PLACEMENT');
      await waitPhase(seats[2], 'INITIAL_PLACEMENT');
      expect(seats[2].snap.phase).not.toBe('LOBBY');

      // subscribe before the game can end so no event is missed
      const endedPromise = once<GameEndedPayload>(hostSock, S2C.gameEnded, 30000);

      // drive the game to the end
      let guard = 0;
      while (seats[0].snap.phase !== 'FINISHED' && guard++ < 400) {
        if (!act(seats)) break;
        await new Promise((r) => setTimeout(r, 6));
      }
      expect(seats[0].snap.phase).toBe('FINISHED');
      expect(seats[0].snap.board.winnerId).toBeTruthy();

      const endPayload = await endedPromise;
      expect(endPayload.winnerId).toBe(seats[0].snap.board.winnerId);
      expect(endPayload.rounds).toBeGreaterThan(0);
      expect(['double_flower', 'last_standing', 'finished']).toContain(endPayload.reason);

      // rematch: host starts again -> fresh round 1
      hostSeat.socket.emit(C2S.roomStart);
      await waitPhase(hostSeat, 'INITIAL_PLACEMENT');
      expect(hostSeat.snap.round.roundNumber).toBe(1);
      expect(hostSeat.snap.phase).toBe('INITIAL_PLACEMENT');

      // leaving mid-game keeps the seat but marks disconnected
      const leaver = seats[2];
      const kicked = once<{ reason: string }>(leaver.socket, S2C.kicked, 3000);
      leaver.socket.emit(C2S.roomLeave);
      await kicked;
      const deadline2 = Date.now() + 3000;
      while (Date.now() < deadline2 && (hostSeat.snap.players.find((p) => p.id === leaver.playerId)?.connected ?? true)) {
        await new Promise((r) => setTimeout(r, 30));
      }
      expect(hostSeat.snap.players.find((p) => p.id === leaver.playerId)!.connected).toBe(false);

      for (const s of seats) s.socket.close();
    } finally {
      await h.close();
    }
  }, 40000);

  it('reconnect restores the seat with the same player id', async () => {
    const h = await startServer();
    try {
      const a = connect(h.port);
      const created = once<{ roomCode: string; playerId: string }>(a, S2C.roomCreated);
      a.connect();
      a.emit(C2S.roomCreate, { name: 'Host' });
      const info = await created;

      const b = connect(h.port);
      const joined = once<{ roomCode: string; playerId: string }>(b, S2C.roomJoined);
      b.connect();
      b.emit(C2S.roomJoin, { roomCode: info.roomCode, name: 'B' });
      const jb = await joined;
      b.close();

      // same player reconnects with stored identity
      const b2 = connect(h.port);
      const rejoined = once<{ roomCode: string; playerId: string }>(b2, S2C.roomJoined);
      b2.connect();
      b2.emit(C2S.reconnect, { roomCode: info.roomCode, playerId: jb.playerId, name: 'B' });
      const again = await rejoined;
      expect(again.playerId).toBe(jb.playerId);

      a.close();
      b2.close();
    } finally {
      await h.close();
    }
  }, 20000);
});
