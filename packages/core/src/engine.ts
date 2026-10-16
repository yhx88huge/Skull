import {
  type Disc,
  type DiscType,
  type GameAction,
  type GameActionResult,
  type GameEvent,
  type GameState,
  type Player,
  type RoomSettings,
  DISCS_PER_PLAYER,
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from './types';

export type Rng = () => number;

const clone = (s: GameState): GameState => ({
  ...s,
  players: s.players.map((p) => ({ ...p, hand: [...p.hand] })),
  discs: Object.fromEntries(Object.entries(s.discs).map(([k, d]) => [k, { ...d }])),
  piles: Object.fromEntries(Object.entries(s.piles).map(([k, v]) => [k, [...v]])),
  round: { ...s.round, passedPlayerIds: [...s.round.passedPlayerIds] },
  penalty: s.penalty ? { ...s.penalty, candidates: [...s.penalty.candidates] } : null,
  supplyDiscIds: { ...s.supplyDiscIds },
});

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeEvent(s: GameState, actorId: string, type: GameEvent['type'], payload: Record<string, unknown>): GameEvent {
  return {
    id: `ev${s.eventIdCounter++}`,
    stateVersion: s.stateVersion,
    actorId,
    type,
    payload,
  };
}

function fail(error: import('./types').ActionError): GameActionResult {
  return { ok: false, error };
}

function advanceState(prev: GameState, next: GameState, events: GameEvent[], privateEvents: Record<string, GameEvent[]> = {}): GameActionResult {
  next.stateVersion = prev.stateVersion + 1;
  return { ok: true, state: next, events, privateEvents };
}

export function createGame(roomId: string, players: { id: string; name: string; seat: number }[], settings: RoomSettings = DEFAULT_SETTINGS, rng: Rng = Math.random): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`player count must be ${MIN_PLAYERS}-${MAX_PLAYERS}`);
  }
  const discs: Record<string, Disc> = {};
  let discSeq = 0;
  const nextDiscId = (): string => `d${discSeq++}`;

  const state: GameState = {
    roomId,
    stateVersion: 0,
    phase: 'ROUND_SETUP',
    settings,
    players: [],
    nextDiscId: 0,
    discs,
    round: {
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
    piles: {},
    lastChanceDiscId: null,
    lastChanceLastRound: 0,
    supplyDiscIds: {},
    winnerId: null,
    penalty: null,
    eventIdCounter: 0,
  };

  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    const pl: Player = {
      id: p.id,
      name: p.name,
      seat: p.seat,
      connected: true,
      ready: true,
      alive: true,
      mat: 'blank',
      lastChanceGranted: false,
      lastChanceActive: false,
      hand: [],
    };
    state.players.push(pl);
    state.piles[p.id] = [];
    for (let i = 0; i < DISCS_PER_PLAYER; i++) {
      const type: DiscType = i === 0 ? 'skull' : 'flower';
      const id = nextDiscId();
      discs[id] = { id, ownerId: p.id, type, location: 'hand', roundId: 0, pileId: null, order: 0, revealed: false };
      pl.hand.push(id);
    }
    for (let i = pl.hand.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pl.hand[i], pl.hand[j]] = [pl.hand[j], pl.hand[i]];
    }
    const chanceId = nextDiscId();
    discs[chanceId] = {
      id: chanceId,
      ownerId: p.id,
      type: 'flower',
      location: 'supply',
      roundId: 0,
      pileId: null,
      order: 0,
      revealed: false,
    };
    state.supplyDiscIds[p.id] = chanceId;
  }
  return state;
}

function alivePlayers(s: GameState): Player[] {
  return s.players.filter((p) => p.alive);
}

function nextAliveAfter(s: GameState, id: string | null, skipPassed = false): string | null {
  const list = alivePlayers(s);
  if (list.length === 0) return null;
  const idx = id ? list.findIndex((p) => p.id === id) : -1;
  for (let i = 1; i <= list.length; i++) {
    const cand = list[(idx + i) % list.length];
    if (skipPassed && s.round.passedPlayerIds.includes(cand.id)) continue;
    return cand.id;
  }
  return null;
}

function totalStashed(s: GameState): number {
  return alivePlayers(s).reduce((sum, p) => sum + s.piles[p.id].length, 0);
}

function pileTopDisc(s: GameState, playerId: string): Disc | null {
  const pile = s.piles[playerId];
  if (!pile || pile.length === 0) return null;
  for (let i = pile.length - 1; i >= 0; i--) {
    const d = s.discs[pile[i]];
    if (!d.revealed) return d;
  }
  return null;
}

function hasUnrevealedInPile(s: GameState, playerId: string): boolean {
  return (s.piles[playerId] || []).some((id) => !s.discs[id].revealed);
}

function placedThisRound(s: GameState, playerId: string): number {
  return (s.piles[playerId] || []).filter((id) => s.discs[id].roundId === s.round.roundNumber).length;
}

function removeDisc(s: GameState, discId: string): void {
  const d = s.discs[discId];
  if (!d) return;
  d.location = 'box';
  const p = s.players.find((x) => x.id === d.ownerId);
  if (p && p.hand.includes(discId)) {
    p.hand = p.hand.filter((id) => id !== discId);
  } else if (d.pileId && s.piles[d.pileId]) {
    s.piles[d.pileId] = s.piles[d.pileId].filter((id) => id !== discId);
  }
}

function beginRound(s: GameState, players: Player[], roundNumber: number, firstPlayerId: string): void {
  s.phase = 'INITIAL_PLACEMENT';
  s.round = {
    roundNumber,
    firstPlayerId,
    currentPlayerId: players.length === 1 ? firstPlayerId : nextAliveAfter(s, firstPlayerId)!,
    openerId: null,
    bidderId: null,
    currentBid: 0,
    challengerId: null,
    passedPlayerIds: [],
    revealProgress: 0,
  };
  s.winnerId = null;
  // last chance is valid for the round after it was granted, returned when that round ends
  if (s.lastChanceDiscId && s.round.roundNumber > s.lastChanceLastRound + 1) {
    const owner = s.players.find((p) => p.lastChanceActive);
    if (owner) {
      owner.lastChanceActive = false;
      owner.hand = owner.hand.filter((id) => id !== s.lastChanceDiscId);
    }
    const d = s.discs[s.lastChanceDiscId];
    if (d) d.location = 'supply';
    s.lastChanceDiscId = null;
  }
}

function firstPlayerActsLast(s: GameState): string {
  const lives = alivePlayers(s);
  const first = lives.find((p) => p.id === s.round.firstPlayerId)!;
  let next = first.id;
  for (let i = 0; i < lives.length; i++) {
    next = nextAliveAfter(s, next)!;
    if (next === first.id) break;
    if (placedThisRound(s, next) === 0) return next;
  }
  return first.id;
}

function resolveFailure(s: GameState, challengerId: string, skullOwnerId: string | null, actorId: string): GameEvent[] {
  const events: GameEvent[] = [];
  const c = s.players.find((p) => p.id === challengerId)!;
  s.round.challengerId = challengerId;
  s.phase = 'ROUND_CLEANUP';

  if (c.lastChanceActive && s.lastChanceDiscId) {
    removeDisc(s, s.lastChanceDiscId);
    s.lastChanceDiscId = null;
    c.lastChanceActive = false;
    s.lastChanceLastRound = 0;
    const real = [...c.hand, ...(s.piles[c.id] || [])][0];
    if (real) removeDisc(s, real);
  }

  const kept = c.hand.length + (s.piles[c.id] || []).length;
  if (kept === 0) {
    c.alive = false;
    events.push(makeEvent(s, challengerId, 'PLAYER_ELIMINATED', { playerId: c.id }));
    const survivors = alivePlayers(s);
    if (survivors.length <= 1) {
      const w = survivors[0];
      if (w) {
        s.winnerId = w.id;
        s.phase = 'FINISHED';
        events.push(makeEvent(s, challengerId, 'GAME_ENDED', { winnerId: w.id, reason: 'last_standing' }));
      }
      return events;
    }
    // challenger eliminated; next first player by rule
    let nextFirst: Player;
    if (skullOwnerId && skullOwnerId !== challengerId) {
      nextFirst = s.players.find((p) => p.id === skullOwnerId)!;
    } else if (skullOwnerId === challengerId) {
      // chose their own skull: pick previous alive (seat order)
      const order = [...survivors].sort((a, b) => a.seat - b.seat);
      const idx = order.findIndex((p) => p.id === challengerId);
      nextFirst = order[(idx - 1 + order.length) % order.length];
    } else {
      nextFirst = survivors[0];
    }
    s.phase = 'ROUND_SETUP';
    cleanupRound(s);
    beginRound(s, survivors, s.round.roundNumber + 1, nextFirst.id);
    events.push(
      makeEvent(s, actorId, 'ROUND_ENDED', {
        roundNumber: s.round.roundNumber,
        nextFirstPlayerId: s.round.firstPlayerId,
      }),
      makeEvent(s, actorId, 'ROUND_STARTED', {
        roundNumber: s.round.roundNumber,
        firstPlayerId: s.round.firstPlayerId,
        players: alivePlayers(s).map((p) => ({ id: p.id, name: p.name, seat: p.seat })),
      }),
    );
    return events;
  }

  if (kept === 1 && !c.lastChanceGranted) {
    c.lastChanceGranted = true;
    c.lastChanceActive = true;
    // reuse the publicly known flower disc from the supply
    const supplyDisc = Object.values(s.discs).find((d) => d.ownerId === c.id && d.location === 'supply');
    if (!supplyDisc) return events;
    supplyDisc.location = 'hand';
    if (!c.hand.includes(supplyDisc.id)) c.hand.push(supplyDisc.id);
    s.lastChanceDiscId = supplyDisc.id;
    s.lastChanceLastRound = s.round.roundNumber;
    events.push(makeEvent(s, challengerId, 'LAST_CHANCE_GRANTED', { playerId: c.id }));
  }

  // challenger survived the failure; they lead the next round
  cleanupRound(s);
  const survivors = alivePlayers(s);
  s.phase = 'ROUND_SETUP';
  beginRound(s, survivors, s.round.roundNumber + 1, challengerId);
  events.push(
    makeEvent(s, actorId, 'ROUND_ENDED', {
      roundNumber: s.round.roundNumber,
      nextFirstPlayerId: s.round.firstPlayerId,
    }),
    makeEvent(s, actorId, 'ROUND_STARTED', {
      roundNumber: s.round.roundNumber,
      firstPlayerId: s.round.firstPlayerId,
      players: alivePlayers(s).map((p) => ({ id: p.id, name: p.name, seat: p.seat })),
    }),
  );
  return events;
}

/** Reset a finished game back to a fresh deal so the room can play again ("再开一局"). */
function resetGame(s: GameState): void {
  for (const p of s.players) {
    p.alive = true;
    p.mat = 'blank';
    p.ready = true;
    p.lastChanceGranted = false;
    p.lastChanceActive = false;
    p.hand = [];
    s.piles[p.id] = [];
  }
  for (const d of Object.values(s.discs)) {
    d.pileId = null;
    d.order = 0;
    d.revealed = false;
    d.roundId = 0;
    if (s.supplyDiscIds[d.ownerId] === d.id) {
      d.location = 'supply';
    } else {
      d.location = 'hand';
      const owner = s.players.find((p) => p.id === d.ownerId);
      if (owner && !owner.hand.includes(d.id)) owner.hand.push(d.id);
    }
  }
  s.lastChanceDiscId = null;
  s.lastChanceLastRound = 0;
  s.winnerId = null;
  s.penalty = null;
  s.round = {
    roundNumber: 0,
    firstPlayerId: null,
    currentPlayerId: null,
    openerId: null,
    bidderId: null,
    currentBid: 0,
    challengerId: null,
    passedPlayerIds: [],
    revealProgress: 0,
  };
  s.phase = 'ROUND_SETUP';
}

function cleanupRound(s: GameState): void {
  for (const pid of Object.keys(s.piles)) {
    const pile = s.piles[pid];
    for (const discId of pile) {
      const d = s.discs[discId];
      const owner = s.players.find((p) => p.id === d.ownerId);
      d.location = 'hand';
      d.pileId = null;
      d.order = 0;
      d.revealed = false;
      if (owner && owner.alive && !owner.hand.includes(discId)) owner.hand.push(discId);
      else if (owner && !owner.alive) d.location = 'box';
    }
    s.piles[pid] = [];
  }
}

export function applyAction(state: GameState, actorId: string, action: GameAction, rng: Rng = Math.random): GameActionResult {
  const s = clone(state);
  const actor = s.players.find((p) => p.id === actorId);
  if (!actor) return fail('NOT_IN_ROOM');

  switch (action.type) {
    case 'start': {
      if (s.phase !== 'ROUND_SETUP' && s.phase !== 'FINISHED') return fail('WRONG_PHASE');
      const restarting = s.phase === 'FINISHED';
      if (restarting) resetGame(s);
      const lives = alivePlayers(s);
      if (lives.length < s.settings.minPlayers) return fail('INSUFFICIENT_PLAYERS');
      for (const p of lives) if (!p.ready) return fail('NOT_READY');
      const first = restarting && state.winnerId && lives.some((p) => p.id === state.winnerId)
        ? state.winnerId!
        : lives[0].id;
      beginRound(s, lives, 1, first);
      const ev = makeEvent(s, actorId, 'ROUND_STARTED', {
        roundNumber: s.round.roundNumber,
        firstPlayerId: s.round.firstPlayerId,
        players: lives.map((p) => ({ id: p.id, name: p.name, seat: p.seat })),
      });
      return advanceState(state, s, [ev]);
    }

    case 'place': {
      if (s.phase !== 'INITIAL_PLACEMENT' && s.phase !== 'ACTION') return fail('WRONG_PHASE');
      if (actor.id !== s.round.currentPlayerId) return fail('NOT_YOUR_TURN');
      if (!actor.alive) return fail('PLAYER_NOT_ALIVE');
      if (s.phase === 'INITIAL_PLACEMENT' && placedThisRound(s, actor.id) >= 1) return fail('PLACE_ALREADY_DONE');
      const discId = action.discId ?? actor.hand[0];
      if (!discId) return fail('NO_DISC_TO_PLACE');
      if (!actor.hand.includes(discId)) return fail('INVALID_DISC');
      const disc = s.discs[discId];
      actor.hand = actor.hand.filter((id) => id !== discId);
      disc.location = 'stack';
      disc.pileId = actor.id;
      disc.roundId = s.round.roundNumber;
      disc.order = s.piles[actor.id].length;
      disc.revealed = false;
      s.piles[actor.id].push(discId);

      const ev = makeEvent(s, actorId, 'DISC_PLACED', {
        playerId: actor.id,
        pileSize: s.piles[actor.id].length,
        order: disc.order,
      });

      if (s.phase === 'INITIAL_PLACEMENT') {
        const lives = alivePlayers(s);
        const first = lives.find((p) => p.id === s.round.firstPlayerId)!;
        const nonFirstDone = lives.filter((p) => p.id !== first.id).every((p) => placedThisRound(s, p.id) >= 1);
        if (nonFirstDone) {
          s.round.currentPlayerId = first.id;
          if (actor.id === first.id) {
            s.phase = 'ACTION';
          }
          return advanceState(state, s, [ev]);
        }
        s.round.currentPlayerId = firstPlayerActsLast(s);
        return advanceState(state, s, [ev]);
      }

      // ACTION phase
      const nextAct = nextAliveAfter(s, actor.id);
      s.round.currentPlayerId = nextAct;
      const evTurn = makeEvent(s, actorId, 'TURN_ADVANCED', { currentPlayerId: nextAct, phase: 'ACTION' });
      return advanceState(state, s, [ev, evTurn]);
    }

    case 'open_bid': {
      if (s.phase !== 'ACTION') return fail('WRONG_PHASE');
      if (actor.id !== s.round.currentPlayerId) return fail('NOT_YOUR_TURN');
      if (s.piles[actor.id].length === 0) return fail('NO_DISC_TO_PLACE');
      const total = totalStashed(s);
      if (action.amount < 1 || action.amount > total) return fail('BID_OUT_OF_RANGE');
      s.round.openerId = actor.id;
      s.round.bidderId = actor.id;
      s.round.currentBid = action.amount;
      s.phase = 'BIDDING';
      s.round.currentPlayerId = nextAliveAfter(s, actor.id, true);
      const ev = makeEvent(s, actorId, 'BID_OPENED', {
        playerId: actor.id,
        amount: action.amount,
        totalStashed: total,
      });
      return advanceState(state, s, [ev]);
    }

    case 'raise_bid': {
      if (s.phase !== 'BIDDING') return fail('WRONG_PHASE');
      if (actor.id !== s.round.currentPlayerId) return fail('NOT_YOUR_TURN');
      if (s.round.passedPlayerIds.includes(actor.id)) return fail('ALREADY_PASSED');
      const total = totalStashed(s);
      if (action.amount <= s.round.currentBid) return fail('BID_NOT_INCREASING');
      if (action.amount > total) return fail('BID_OUT_OF_RANGE');
      s.round.currentBid = action.amount;
      s.round.bidderId = actor.id;
      const ev = makeEvent(s, actorId, 'BID_RAISED', { playerId: actor.id, amount: action.amount, totalStashed: total });
      const remaining = alivePlayers(s).filter((p) => !s.round.passedPlayerIds.includes(p.id));
      if (remaining.length === 1) {
        return endBidding(s, actor.id, remaining[0].id, [ev]);
      }
      s.round.currentPlayerId = nextAliveAfter(s, actor.id, true);
      const evTurn = makeEvent(s, actorId, 'TURN_ADVANCED', { currentPlayerId: s.round.currentPlayerId, phase: 'BIDDING' });
      return advanceState(state, s, [ev, evTurn]);
    }

    case 'pass': {
      if (s.phase !== 'BIDDING') return fail('WRONG_PHASE');
      if (actor.id !== s.round.currentPlayerId) return fail('NOT_YOUR_TURN');
      if (s.round.passedPlayerIds.includes(actor.id)) return fail('ALREADY_PASSED');
      s.round.passedPlayerIds.push(actor.id);
      const ev = makeEvent(s, actorId, 'PLAYER_PASSED', { playerId: actor.id });
      const remaining = alivePlayers(s).filter((p) => !s.round.passedPlayerIds.includes(p.id));
      if (remaining.length === 1) {
        return endBidding(s, actor.id, remaining[0].id, [ev]);
      }
      s.round.currentPlayerId = nextAliveAfter(s, actor.id, true);
      const evTurn = makeEvent(s, actorId, 'TURN_ADVANCED', { currentPlayerId: s.round.currentPlayerId, phase: 'BIDDING' });
      return advanceState(state, s, [ev, evTurn]);
    }

    case 'reveal': {
      if (s.phase !== 'REVEAL') return fail('WRONG_PHASE');
      if (actor.id !== s.round.challengerId) return fail('NOT_CHALLENGER');
      if (actor.id !== s.round.currentPlayerId) return fail('NOT_YOUR_TURN');
      const target = s.players.find((p) => p.id === action.targetPlayerId);
      if (!target || !target.alive) return fail('INVALID_TARGET');
      if (hasUnrevealedInPile(s, actor.id) && action.targetPlayerId !== actor.id) {
        return fail('MUST_REVEAL_SELF_FIRST');
      }
      const top = pileTopDisc(s, action.targetPlayerId);
      if (!top) return fail('INVALID_TARGET');
      top.revealed = true;
      s.round.revealProgress += 1;
      const idx = s.piles[action.targetPlayerId].indexOf(top.id);

      const ev = makeEvent(s, actorId, 'DISC_REVEALED', {
        discId: top.id,
        ownerId: top.ownerId,
        playerId: action.targetPlayerId,
        type: top.type,
        pileIndex: idx,
        revealProgress: s.round.revealProgress,
      });

      if (top.type === 'skull') {
        const evFail = makeEvent(s, actorId, 'CHALLENGE_FAILED', {
          challengerId: actor.id,
          skullOwnerId: top.ownerId,
          revealed: s.round.revealProgress,
        });
        if (top.ownerId !== actor.id) {
          // facing another player's skull: the skull owner blind-picks one of the challenger's discs
          const victim = s.players.find((p) => p.id === actor.id)!;
          const merged = [...victim.hand, ...s.piles[actor.id]];
          if (merged.length === 0) {
            // nothing to take; resolve immediately
            const extra = resolveFailure(s, actor.id, top.ownerId, actor.id);
            return advanceState(state, s, [ev, evFail, ...extra]);
          }
          s.phase = 'PENALTY';
          s.penalty = {
            challengerId: actor.id,
            pendingPlayerId: top.ownerId,
            skullOwnerId: top.ownerId,
            candidates: shuffle(merged, rng),
          };
          s.round.currentPlayerId = top.ownerId;
          return advanceState(state, s, [ev, evFail]);
        }
        // own skull: challenger secretly chooses one of his discs to remove
        s.phase = 'PENALTY';
        const ownMerged = [...actor.hand, ...s.piles[actor.id]];
        s.penalty = {
          challengerId: actor.id,
          pendingPlayerId: actor.id,
          skullOwnerId: actor.id,
          candidates: shuffle(ownMerged, rng),
        };
        s.round.currentPlayerId = actor.id;
        return advanceState(state, s, [ev, evFail]);
      }

      if (s.round.revealProgress >= s.round.currentBid) {
        const evWin = makeEvent(s, actorId, 'CHALLENGE_SUCCEEDED', { challengerId: actor.id });
        const c = s.players.find((p) => p.id === actor.id)!;
        if (c.mat === 'flower') {
          s.winnerId = c.id;
          s.phase = 'FINISHED';
          const evGame = makeEvent(s, actorId, 'GAME_ENDED', { winnerId: c.id, reason: 'double_flower' });
          return advanceState(state, s, [ev, evWin, evGame]);
        }
        c.mat = 'flower';
        cleanupRound(s);
        const survivors = alivePlayers(s);
        if (survivors.length <= 1) {
          s.winnerId = survivors[0].id;
          s.phase = 'FINISHED';
          const evGame = makeEvent(s, actorId, 'GAME_ENDED', { winnerId: survivors[0].id, reason: 'last_standing' });
          return advanceState(state, s, [ev, evWin, evGame]);
        }
        s.phase = 'ROUND_SETUP';
        beginRound(s, survivors, s.round.roundNumber + 1, actor.id);
        const evEnd = makeEvent(s, actorId, 'ROUND_ENDED', {
          roundNumber: s.round.roundNumber,
          nextFirstPlayerId: s.round.firstPlayerId,
        });
        const evRound = makeEvent(s, actorId, 'ROUND_STARTED', {
          roundNumber: s.round.roundNumber,
          firstPlayerId: s.round.firstPlayerId,
          players: alivePlayers(s).map((p) => ({ id: p.id, name: p.name, seat: p.seat })),
        });
        return advanceState(state, s, [ev, evWin, evEnd, evRound]);
      }
      s.round.currentPlayerId = actor.id;
      return advanceState(state, s, [ev]);
    }

    case 'choose_penalty_disc': {
      if (s.phase !== 'PENALTY') return fail('WRONG_PHASE');
      const ctx = s.penalty;
      if (!ctx) return fail('WRONG_PHASE');
      if (ctx.pendingPlayerId !== actor.id) return fail('NOT_PENALTY_PLAYER');
      if (!ctx.candidates.includes(action.discId)) return fail('INVALID_DISC');
      const disc = s.discs[action.discId];
      if (!disc || disc.ownerId !== ctx.challengerId) return fail('INVALID_DISC');
      const blind = ctx.pendingPlayerId !== ctx.challengerId;
      removeDisc(s, action.discId);
      const ev = makeEvent(s, actor.id, 'DISC_REMOVED', {
        removedBy: actor.id,
        fromPlayerId: ctx.challengerId,
        blind,
      });
      s.penalty = null;
      const extra = resolveFailure(s, ctx.challengerId, ctx.skullOwnerId, actor.id);
      return advanceState(state, s, [ev, ...extra]);
    }
  }
  return fail('WRONG_PHASE');
}

function endBidding(s: GameState, actorId: string, challengerId: string, events: GameEvent[]): GameActionResult {
  s.round.challengerId = challengerId;
  s.round.revealProgress = 0;
  s.phase = 'REVEAL';
  s.round.currentPlayerId = challengerId;
  const total = totalStashed(s);
  const evCh = makeEvent(s, actorId, 'CHALLENGE_STARTED', {
    challengerId,
    target: s.round.currentBid,
    totalStashed: total,
  });
  return advanceState(s, s, [...events, evCh]);
}

export function nextLineup(state: GameState): Player[] {
  return [...alivePlayers(state)].sort((a, b) => a.seat - b.seat);
}

export type { GameState, GameEvent, GameAction, GameActionResult, Player, RoomSettings } from './types';
export { DEFAULT_SETTINGS, DISCS_PER_PLAYER, MAX_PLAYERS, MIN_PLAYERS };
export * from './types';