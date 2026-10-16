import type { GameState, GameEvent, Player } from '@skull/core';
import type { PlayerPublic, PlayerSecret, PenaltyView, RoomView, RoundView, BoardView, Snapshot } from '@skull/protocol';
import type { Room } from './roomManager';

function playerPublic(room: Room, p: Room['players'][number]): PlayerPublic {
  const g = room.game;
  const cp: Player | undefined = g?.players.find((x) => x.id === p.id);
  const pile = g?.piles[p.id] ?? [];
  let topRevealed: PlayerPublic['topRevealed'] = null;
  let unrevealedCount = 0;
  if (cp && pile.length > 0) {
    for (let i = pile.length - 1; i >= 0; i--) {
      const d = g!.discs[pile[i]];
      if (d.revealed) {
        if (topRevealed === null) topRevealed = d.type;
      } else {
        unrevealedCount += 1;
      }
    }
  }
  return {
    id: p.id,
    name: p.name,
    seat: p.seat,
    connected: p.connected,
    ready: p.ready,
    alive: cp?.alive ?? true,
    mat: cp?.mat ?? 'blank',
    lastChanceGranted: cp?.lastChanceGranted ?? false,
    lastChanceActive: cp?.lastChanceActive ?? false,
    handCount: cp ? cp.hand.length : 0,
    pileCount: pile.length,
    topRevealed,
    unrevealedCount,
    passed: g ? g.round.passedPlayerIds.includes(p.id) : false,
    isChallenger: g ? g.round.challengerId === p.id : false,
    isFirst: g ? g.round.firstPlayerId === p.id : false,
    isCurrentTurn: g ? g.round.currentPlayerId === p.id : false,
  };
}

export function buildRoundView(g: GameState): RoundView {
  return {
    roundNumber: g.round.roundNumber,
    firstPlayerId: g.round.firstPlayerId,
    currentPlayerId: g.round.currentPlayerId,
    openerId: g.round.openerId,
    bidderId: g.round.bidderId,
    currentBid: g.round.currentBid,
    challengerId: g.round.challengerId,
    passedPlayerIds: g.round.passedPlayerIds,
    revealProgress: g.round.revealProgress,
  };
}

export function buildBoardView(g: GameState): BoardView {
  const piles = g.piles as Record<string, string[]>;
  const totalStashed = Object.values(piles).reduce((a: number, p: string[]) => a + p.length, 0);
  return {
    phase: g.phase,
    totalStashed,
    revealTarget: g.round.currentBid,
    revealProgress: g.round.revealProgress,
    winnerId: g.winnerId,
    lastChanceHolderId: g.lastChanceDiscId ? g.discs[g.lastChanceDiscId]?.ownerId ?? null : null,
  };
}

export function buildRoomView(room: Room): RoomView {
  const g = room.game;
  return {
    roomId: room.id,
    roomCode: room.code,
    hostId: room.hostId,
    stateVersion: room.stateVersion,
    gameStarted: !!g,
    phase: g ? g.phase : 'LOBBY',
    settings: room.settings,
    board: g ? buildBoardView(g) : {
      phase: 'LOBBY',
      totalStashed: 0,
      revealTarget: 0,
      revealProgress: 0,
      winnerId: null,
      lastChanceHolderId: null,
    },
    round: g ? buildRoundView(g) : {
      roundNumber: 0,
      firstPlayerId: null,
      currentPlayerId: null,
      openerId: null,
      bidderId: null,
      currentBid: 0,
      challengerId: null,
      passedPlayerIds: [],
      revealProgress: 0,
    },
    players: room.players.map((p) => playerPublic(room, p)),
    createdAt: room.createdAt,
  };
}

export function buildSecret(room: Room, playerId: string): PlayerSecret | null {
  const g = room.game;
  if (!g) return null;
  const cp = g.players.find((x: { id: string }) => x.id === playerId);
  if (!cp) return null;
  const pile = g.piles[playerId] ?? [];
  return {
    handTypes: cp.hand.map((id: string) => g.discs[id].type),
    hand: cp.hand.map((id: string) => ({ id, type: g.discs[id].type })),
    pile: pile.map((id: string) => ({ id, type: g.discs[id].type })),
    hasLastChanceDisc: g.lastChanceDiscId !== null,
    lastChanceDiscInHand: cp.hand.includes(g.lastChanceDiscId ?? ''),
  };
}

export function buildPenaltyView(room: Room, viewerId: string): PenaltyView | null {
  const g = room.game;
  if (!g || !g.penalty) return null;
  const ctx = g.penalty;
  return {
    challengerId: ctx.challengerId,
    pendingPlayerId: ctx.pendingPlayerId,
    skullOwnerId: ctx.skullOwnerId,
    // candidate disc ids are only disclosed to the player who must pick;
    // for a blind pick the ids carry no type information on the wire.
    candidates: ctx.pendingPlayerId === viewerId ? [...ctx.candidates] : [],
  };
}

export function buildSnapshot(room: Room, playerId: string): Snapshot {
  return {
    ...buildRoomView(room),
    youPlayerId: playerId,
    ownSecret: buildSecret(room, playerId),
    penalty: buildPenaltyView(room, playerId),
  };
}

export function gameEventsToWire(events: GameEvent[]): GameEvent[] {
  return events;
}

export type { GameEvent };