import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './engine';
import type { GameActionResult, GameAction, GameState, Player, Rng } from './types';
import type { Rng as EngineRng } from './engine';

type RngFn = EngineRng;

const RNG_F = (): number => 0.1; // hand order becomes [flower,flower,flower,skull]
const RNG_S = (): number => 0.9; // hand order becomes [skull,flower,flower,flower]

function mkPlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));
}

function start(n: number, rng: RngFn = RNG_F, roomId = 'room1'): GameState {
  const s = createGame(roomId, mkPlayers(n), undefined, rng);
  const r = applyAction(s, 'p0', { type: 'start' });
  if (!r.ok) throw new Error('start failed: ' + r.error);
  return r.state;
}

function act(s: GameState, id: string, action: GameAction, rng: RngFn = RNG_F): GameState {
  const r = applyAction(s, id, action, rng);
  if (!r.ok) throw new Error(`${action.type} by ${id} failed: ${r.error}`);
  return r.state;
}

function initialPlacementAll(s: GameState, rng: RngFn = RNG_F): GameState {
  let cur = s;
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
    const p = s.players.find((x) => x.id === id);
    if (!p) continue;
    cur = act(cur, id, { type: 'place' }, rng);
  }
  return act(cur, 'p0', { type: 'place' }, rng);
}

/** Drive one full round where p0 becomes challenger after everyone placed once. */
function p0ChallengerRound(s: GameState, bid: number, rng: RngFn = RNG_F): GameState {
  let cur = initialPlacementAll(s, rng);
  cur = act(cur, 'p0', { type: 'open_bid', amount: bid }, rng);
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
    const p = cur.players.find((x) => x.id === id);
    if (!p || !p.alive) continue;
    cur = act(cur, id, { type: 'pass' }, rng);
  }
  return cur;
}

describe('createGame', () => {
  it('rejects out-of-range player counts', () => {
    expect(() => createGame('r', mkPlayers(2))).toThrow();
    expect(() => createGame('r', mkPlayers(7))).toThrow();
  });

  it('gives each player 4 discs: 3 flower + 1 skull', () => {
    const s = createGame('r', mkPlayers(3));
    for (const p of s.players) {
      expect(p.hand).toHaveLength(4);
      const types = p.hand.map((id) => s.discs[id].type);
      expect(types.filter((t) => t === 'skull')).toHaveLength(1);
      expect(types.filter((t) => t === 'flower')).toHaveLength(3);
    }
  });
});

describe('round flow', () => {
  it('INITIAL_PLACEMENT: first player acts last; everyone places exactly one', () => {
    const s = start(3);
    expect(s.phase).toBe('INITIAL_PLACEMENT');
    expect(s.round.firstPlayerId).toBe('p0');
    expect(s.round.currentPlayerId).toBe('p1');
    const s2 = act(s, 'p1', { type: 'place' });
    expect(s2.round.currentPlayerId).toBe('p2');
    const s3 = act(s2, 'p2', { type: 'place' });
    expect(s3.round.currentPlayerId).toBe('p0');
    const s4 = act(s3, 'p0', { type: 'place' });
    expect(s4.phase).toBe('ACTION');
    expect(s4.round.currentPlayerId).toBe('p0');
    for (const p of s4.players) expect(s4.piles[p.id]).toHaveLength(1);
  });

  it('cannot place twice in INITIAL_PLACEMENT', () => {
    const s = start(3);
    const s2 = act(s, 'p1', { type: 'place' });
    const bad = applyAction(s2, 'p1', { type: 'place' }, RNG_F);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('NOT_YOUR_TURN');
  });

  it('open bid must be within total stashed', () => {
    const s = initialPlacementAll(start(3));
    const bad = applyAction(s, 'p0', { type: 'open_bid', amount: 4 }, RNG_F);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('BID_OUT_OF_RANGE');
    const good = applyAction(s, 'p0', { type: 'open_bid', amount: 3 }, RNG_F);
    expect(good.ok).toBe(true);
  });

  it('cannot place after bid is opened', () => {
    const s = act(initialPlacementAll(start(3)), 'p0', { type: 'open_bid', amount: 1 });
    expect(s.phase).toBe('BIDDING');
    const bad = applyAction(s, 'p0', { type: 'place' }, RNG_F);
    expect(bad.ok).toBe(false);
  });
});

describe('bidding', () => {
  it('bids must strictly increase', () => {
    let s = initialPlacementAll(start(3));
    s = act(s, 'p0', { type: 'open_bid', amount: 1 });
    const bad = applyAction(s, 'p1', { type: 'raise_bid', amount: 1 }, RNG_F);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('BID_NOT_INCREASING');
  });

  it('passed player cannot bid again', () => {
    let s = initialPlacementAll(start(3));
    s = act(s, 'p0', { type: 'open_bid', amount: 1 });
    s = act(s, 'p1', { type: 'pass' });
    expect(s.round.passedPlayerIds).toContain('p1');
    const bad = applyAction(s, 'p1', { type: 'raise_bid', amount: 2 }, RNG_F);
    expect(bad.ok).toBe(false);
  });

  it('bidding ends when only one player remains; that player is challenger', () => {
    let s = initialPlacementAll(start(3));
    s = act(s, 'p0', { type: 'open_bid', amount: 1 });
    s = act(s, 'p1', { type: 'pass' });
    s = act(s, 'p2', { type: 'raise_bid', amount: 2 });
    expect(s.phase).toBe('BIDDING');
    s = act(s, 'p0', { type: 'pass' });
    expect(s.phase).toBe('REVEAL');
    expect(s.round.challengerId).toBe('p2');
  });
});

describe('reveal', () => {
  it('challenger must reveal self first', () => {
    const s = p0ChallengerRound(start(3), 2);
    expect(s.phase).toBe('REVEAL');
    const bad = applyAction(s, 'p0', { type: 'reveal', targetPlayerId: 'p1' }, RNG_F);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('MUST_REVEAL_SELF_FIRST');
  });

  it('reveals one disc at a time; reaching the bid succeeds the challenge', () => {
    let s = p0ChallengerRound(start(3), 2);
    s = act(s, 'p0', { type: 'reveal', targetPlayerId: 'p0' });
    expect(s.round.revealProgress).toBe(1);
    // bid = 2 not yet reached, challenger keeps acting
    expect(s.phase).toBe('REVEAL');
    // p0 pile has only one disc; own discs fully revealed -> may reveal p1
    s = act(s, 'p0', { type: 'reveal', targetPlayerId: 'p1' });
    // challenge succeeded => new round starts
    const p0 = s.players.find((p) => p.id === 'p0')!;
    expect(p0.mat).toBe('flower');
    expect(s.phase).toBe('INITIAL_PLACEMENT');
    expect(s.round.roundNumber).toBe(2);
  });

  it('cannot reveal a pile that has no unrevealed disc', () => {
    const s = p0ChallengerRound(start(3), 1);
    const s2 = act(s, 'p0', { type: 'reveal', targetPlayerId: 'p0' });
    // p0 pile now empty; nothing left to reveal there
    const bad = applyAction(s2, 'p0', { type: 'reveal', targetPlayerId: 'p0' }, RNG_F);
    expect(bad.ok).toBe(false);
  });

  it('second successful challenge wins the game', () => {
    let s = start(3);
    const winAsP0 = (cur: GameState): GameState => {
      let c = initialPlacementAll(cur);
      c = act(c, 'p0', { type: 'open_bid', amount: 1 });
      c = act(c, 'p1', { type: 'pass' });
      c = act(c, 'p2', { type: 'pass' });
      c = act(c, 'p0', { type: 'reveal', targetPlayerId: 'p0' });
      return c;
    };
    s = winAsP0(s);
    expect(s.players.find((p) => p.id === 'p0')!.mat).toBe('flower');
    expect(s.round.roundNumber).toBe(2);
    s = winAsP0(s);
    expect(s.phase).toBe('FINISHED');
    expect(s.winnerId).toBe('p0');
  });

  it('own skull sends challenger to PENALTY and disc removal works', () => {
    // RNG_S: everyone's first disc is a skull
    let s = start(3, RNG_S);
    s = initialPlacementAll(s, RNG_S);
    // p0's first placed disc is a skull
    s = act(s, 'p0', { type: 'open_bid', amount: 1 }, RNG_S);
    s = act(s, 'p1', { type: 'pass' }, RNG_S);
    s = act(s, 'p2', { type: 'pass' }, RNG_S);
    expect(s.phase).toBe('REVEAL');
    s = act(s, 'p0', { type: 'reveal', targetPlayerId: 'p0' }, RNG_S);
    expect(s.phase).toBe('PENALTY');
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const candidates = [...p0.hand, ...s.piles['p0']];
    const pick = candidates[0];
    const before = totalOwned(s, 'p0');
    s = act(s, 'p0', { type: 'choose_penalty_disc', discId: pick }, RNG_S);
    expect(s.phase).toBe('INITIAL_PLACEMENT');
    expect(s.round.roundNumber).toBe(2);
    expect(totalOwned(s, 'p0')).toBe(before - 1);
  });
});

describe('last chance', () => {
  it('granted when a failing challenger is left with exactly one disc', () => {
    // Craft a deterministic layout: p0 keeps only 2 flower discs (places 1, keeps 1),
    // p1 keeps only its skull (so its first placed disc is a skull).
    const g = createGame('r', mkPlayers(3), undefined, RNG_F);
    const p = (id: string) => g.players.find((x) => x.id === id)!;
    const p0id = [...p('p0').hand];
    p('p0').hand = [p0id[0], p0id[1]];
    for (const id of p0id.slice(2)) g.discs[id].location = 'box';
    const p1id = [...p('p1').hand];
    const skull = p1id.map((id) => g.discs[id]).find((d) => d.type === 'skull')!.id;
    p('p1').hand = [skull];
    for (const id of p1id) if (id !== skull) g.discs[id].location = 'box';

    let s = g;
    const r = applyAction(s, 'p0', { type: 'start' });
    if (r.ok) s = r.state;
    // INITIAL_PLACEMENT: p1 first (skull pile), p2, then p0
    s = act(s, 'p1', { type: 'place' });
    s = act(s, 'p2', { type: 'place' });
    s = act(act(s, 'p0', { type: 'place' }), 'p0', { type: 'open_bid', amount: 2 });
    s = act(s, 'p1', { type: 'pass' });
    s = act(s, 'p2', { type: 'pass' });
    s = act(s, 'p0', { type: 'reveal', targetPlayerId: 'p0' });
    // reveal p1's skull -> fail; blind pick removes one of p0's discs -> kept exactly one
    s = act(s, 'p0', { type: 'reveal', targetPlayerId: 'p1' });

    const p0b = s.players.find((x) => x.id === 'p0')!;
    expect(p0b.alive).toBe(true);
    expect(p0b.lastChanceGranted).toBe(true);
    expect(p0b.lastChanceActive).toBe(true);
    // one real disc + the public last-chance flower
    expect(p0b.hand).toHaveLength(2);
    expect(s.lastChanceDiscId).toBeTruthy();
    expect(s.discs[s.lastChanceDiscId!].ownerId).toBe('p0');
    expect(s.discs[s.lastChanceDiscId!].type).toBe('flower');
    expect(s.phase).toBe('INITIAL_PLACEMENT'); // next round begins, disc still valid
    expect(s.round.roundNumber).toBe(2);
  });
});

function totalOwned(s: GameState, playerId: string): number {
  return Object.values(s.discs).filter((d) => d.ownerId === playerId && (d.location === 'hand' || d.location === 'stack')).length;
}

/** Random play simulation as a property test: disc conservation + game always terminates. */
describe('property: random full games', () => {
  it('conserves discs and terminates', () => {
    const g = createGame('game', mkPlayers(3), undefined, () => Math.random());
    const TOTAL = Object.keys(g.discs).length;

    const liveIds = (s: GameState) => s.players.filter((p) => p.alive).map((p) => p.id);
    let s: GameState = g;
    let steps = 0;
    while (steps++ < 20000) {
      if (s.phase === 'FINISHED') break;
      const candidates: { id: string; a: GameAction }[] = [];

      const list = liveIds(s);
      if (s.phase === 'ROUND_SETUP') {
        candidates.push({ id: list[0], a: { type: 'start' } });
      } else if (s.phase === 'INITIAL_PLACEMENT') {
        if (s.round.currentPlayerId) candidates.push({ id: s.round.currentPlayerId, a: { type: 'place' } });
      } else if (s.phase === 'ACTION') {
        if (s.round.currentPlayerId) {
          candidates.push({ id: s.round.currentPlayerId, a: { type: 'place' } });
          const total = Object.values(s.piles).reduce((a, p) => a + p.length, 0);
          for (let n = 1; n <= total; n++) candidates.push({ id: s.round.currentPlayerId, a: { type: 'open_bid', amount: n } });
        }
      } else if (s.phase === 'BIDDING') {
        if (s.round.currentPlayerId) {
          candidates.push({ id: s.round.currentPlayerId, a: { type: 'pass' } });
          const total = Object.values(s.piles).reduce((a, p) => a + p.length, 0);
          for (let n = s.round.currentBid + 1; n <= Math.min(total, s.round.currentBid + 3); n++) {
            candidates.push({ id: s.round.currentPlayerId, a: { type: 'raise_bid', amount: n } });
          }
        }
      } else if (s.phase === 'REVEAL') {
        const c = s.round.challengerId!;
        const alive = s.players.filter((p) => p.alive);
        if (s.piles[c].some((id) => !s.discs[id].revealed)) {
          candidates.push({ id: c, a: { type: 'reveal', targetPlayerId: c } });
        }
        for (const p of alive) {
          if (s.piles[p.id].some((id) => !s.discs[id].revealed)) {
            candidates.push({ id: c, a: { type: 'reveal', targetPlayerId: p.id } });
          }
        }
      } else if (s.phase === 'PENALTY') {
        const p = s.penalty!;
        const owner = s.players.find((x) => x.id === p.challengerId)!;
        const own = [...owner.hand, ...s.piles[owner.id]];
        for (const did of own) candidates.push({ id: p.pendingPlayerId, a: { type: 'choose_penalty_disc', discId: did } });
      } else {
        break;
      }

      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const r = applyAction(s, pick.id, pick.a, () => Math.random());
      if (r.ok) s = r.state;

      // conservation invariant
      const sum = Object.values(s.discs).reduce(
        (acc: Record<string, number>, d) => {
          acc[d.location] = (acc[d.location] ?? 0) + 1;
          return acc;
        },
        {},
      );
      expect(Object.values(sum).reduce((a, b) => a + b, 0)).toBe(TOTAL);
      // last chance invariant
      for (const p of s.players) {
        if (p.lastChanceActive) {
          expect(s.lastChanceDiscId).toBeTruthy();
          expect(s.discs[s.lastChanceDiscId!].ownerId).toBe(p.id);
        }
      }
    }

    expect(s.phase).toBe('FINISHED');
    expect(s.winnerId).toBeTruthy();
  }, 30000);
});

export type { GameActionResult, Player, Rng };