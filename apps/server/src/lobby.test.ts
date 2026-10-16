import { describe, expect, it } from 'vitest';
import { Lobby } from './lobby';
import { MemoryStore } from './store';
import { autoAction } from './timer';
import type { GameState } from '@skull/core';

function mkLobby(): Lobby {
  return new Lobby(new MemoryStore());
}

function mkRoom(lobby: Lobby) {
  return lobby.createTestRoom(
    [
      { id: 'p0', name: 'A' },
      { id: 'p1', name: 'B' },
      { id: 'p2', name: 'C' },
    ],
    'TEST01',
  );
}

describe('lobby lifecycle', () => {
  it('create -> join -> ready -> start', async () => {
    const lobby = mkLobby();
    const room = await lobby.create('Host');
    await lobby.join(room.code, 'P2');
    await lobby.join(room.code, 'P3');
    const r = lobby.get(room.code)!;
    for (const p of r.players) await lobby.ready(room.code, p.id, true);
    const started = await lobby.start(room.code, r.hostId);
    expect(started.game).toBeTruthy();
    expect(started.game!.phase).toBe('INITIAL_PLACEMENT');
  });

  it('rejects start by non-host', async () => {
    const lobby = mkLobby();
    const room = await lobby.create('Host');
    await lobby.join(room.code, 'P2');
    await lobby.join(room.code, 'P3');
    const r = lobby.get(room.code)!;
    await expect(lobby.start(room.code, r.players[1].id)).rejects.toThrow();
  });

  it('join is rejected once the game started', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    await lobby.start(room.code, room.hostId);
    await expect(lobby.join(room.code, 'Late')).rejects.toThrow('GAME_IN_PROGRESS');
  });
});

describe('action idempotency', () => {
  it('same actionId twice produces no duplicate effect', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    await lobby.start(room.code, room.hostId);
    // first to act is p1 (first player p0 acts last in INITIAL_PLACEMENT)
    const g = room.game!;
    const actor = g.round.currentPlayerId!;
    const r1 = await lobby.action(room.code, actor, 'aid-1', { type: 'place' });
    expect(r1.ok).toBe(true);
    const versionAfter = lobby.get(room.code)!.game!.stateVersion;
    const r2 = await lobby.action(room.code, actor, 'aid-1', { type: 'place' });
    expect(r2.ok).toBe(true);
    expect(r2.events).toHaveLength(0);
    expect(lobby.get(room.code)!.game!.stateVersion).toBe(versionAfter);
  });
});

describe('leave & reconnect', () => {
  it('leaving in lobby removes the player and transfers host', async () => {
    const lobby = mkLobby();
    const room = await lobby.create('Host');
    await lobby.join(room.code, 'P2');
    const r = lobby.get(room.code)!;
    await lobby.leave(room.code, r.hostId);
    const after = lobby.get(room.code)!;
    expect(after.players).toHaveLength(1);
    expect(after.hostId).toBe(after.players[0].id);
  });

  it('leaving mid-game keeps the seat but marks disconnected', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    await lobby.start(room.code, room.hostId);
    await lobby.leave(room.code, 'p2');
    const after = lobby.get(room.code)!;
    expect(after.players).toHaveLength(3);
    expect(after.players.find((p) => p.id === 'p2')!.connected).toBe(false);
  });

  it('reconnect marks the player connected again', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    lobby.markDisconnected(room.code, 'p1');
    expect(lobby.get(room.code)!.players.find((p) => p.id === 'p1')!.connected).toBe(false);
    await lobby.reconnect(room.code, 'p1', 'B');
    expect(lobby.get(room.code)!.players.find((p) => p.id === 'p1')!.connected).toBe(true);
  });
});

describe('snapshot privacy & identity', () => {
  it('includes youPlayerId and never leaks other players\' hand types', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    await lobby.start(room.code, room.hostId);
    const snap = lobby.snapshot(room.code, 'p1')!;
    expect(snap.youPlayerId).toBe('p1');
    expect(snap.ownSecret).toBeTruthy();
    expect(snap.ownSecret!.hand).toHaveLength(4);
    // public player info carries counts only — no disc ids/types of hidden discs
    for (const p of snap.players) {
      expect(Object.keys(p)).not.toContain('hand');
      expect(Object.keys(p)).not.toContain('handTypes');
    }
    // serialized snapshot must not contain other players' hidden disc types:
    // the only secret block belongs to the viewer
    const raw = JSON.stringify(snap);
    const g = room.game!;
    const other = g.players.find((p) => p.id === 'p0')!;
    for (const discId of other.hand) {
      expect(raw).not.toContain(discId);
    }
  });

  it('penalty candidates are only disclosed to the pending picker', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    await lobby.start(room.code, room.hostId);
    const g = room.game!;
    // forge a penalty context directly
    g.phase = 'PENALTY';
    g.penalty = { challengerId: 'p0', pendingPlayerId: 'p1', skullOwnerId: 'p1', candidates: ['d1', 'd2'] };
    const snapPicker = lobby.snapshot(room.code, 'p1')!;
    expect(snapPicker.penalty!.candidates).toEqual(['d1', 'd2']);
    const snapOther = lobby.snapshot(room.code, 'p2')!;
    expect(snapOther.penalty!.candidates).toEqual([]);
    expect(snapOther.penalty!.pendingPlayerId).toBe('p1');
  });
});

describe('rematch', () => {
  it('start on a FINISHED game resets and deals again', async () => {
    const lobby = mkLobby();
    const room = mkRoom(lobby);
    await lobby.start(room.code, room.hostId);
    const g = room.game!;
    g.phase = 'FINISHED';
    g.winnerId = 'p1';
    const started = await lobby.start(room.code, room.hostId);
    expect(started.game!.phase).toBe('INITIAL_PLACEMENT');
    expect(started.game!.round.roundNumber).toBe(1);
    expect(started.game!.round.firstPlayerId).toBe('p1');
    expect(started.gameStartedAt).toBeTruthy();
  });
});

describe('turn timer auto actions', () => {
  const base: Partial<GameState> = {};

  it('passes on bidding timeout', () => {
    const g = {
      ...base,
      phase: 'BIDDING',
      round: { currentPlayerId: 'p1' },
      players: [{ id: 'p1', alive: true }],
      piles: {},
      discs: {},
    } as unknown as GameState;
    expect(autoAction(g)).toEqual({ playerId: 'p1', action: { type: 'pass' } });
  });

  it('places a random hand disc on placement timeout', () => {
    const g = {
      phase: 'INITIAL_PLACEMENT',
      round: { currentPlayerId: 'p1' },
      players: [{ id: 'p1', alive: true, hand: ['d1', 'd2'] }],
      piles: {},
      discs: {},
    } as unknown as GameState;
    const a = autoAction(g);
    expect(a!.playerId).toBe('p1');
    expect(a!.action.type).toBe('place');
  });

  it('reveals own pile first on reveal timeout', () => {
    const g = {
      phase: 'REVEAL',
      round: { currentPlayerId: 'p0', challengerId: 'p0' },
      players: [
        { id: 'p0', alive: true, seat: 0 },
        { id: 'p1', alive: true, seat: 1 },
      ],
      piles: { p0: ['d0'], p1: ['d1'] },
      discs: { d0: { revealed: false }, d1: { revealed: false } },
    } as unknown as GameState;
    expect(autoAction(g)).toEqual({ playerId: 'p0', action: { type: 'reveal', targetPlayerId: 'p0' } });
  });

  it('picks a candidate on penalty timeout', () => {
    const g = {
      phase: 'PENALTY',
      round: { currentPlayerId: 'p1' },
      penalty: { challengerId: 'p0', pendingPlayerId: 'p1', skullOwnerId: 'p1', candidates: ['d5'] },
      players: [],
      piles: {},
      discs: {},
    } as unknown as GameState;
    expect(autoAction(g)).toEqual({ playerId: 'p1', action: { type: 'choose_penalty_disc', discId: 'd5' } });
  });

  it('returns null when no timer applies', () => {
    const g = { phase: 'FINISHED', round: {}, players: [], piles: {}, discs: {} } as unknown as GameState;
    expect(autoAction(g)).toBeNull();
  });
});
