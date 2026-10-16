/**
 * Full-game simulator for the rules engine (design §7.1 / P0 acceptance):
 * plays many random but legal games and checks that every one terminates,
 * that discs are conserved, and that hidden information never leaks.
 *
 *   npm run sim            # 1000 games
 *   npm run sim -- 200     # custom count
 */
import { applyAction, createGame } from '../../packages/core/src/engine.ts';
import type { GameAction, GameState } from '../../packages/core/src/types.ts';

const GAMES = Math.max(1, Number(process.argv[2] ?? 1000));
const rng: () => number = Math.random;

function mkPlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));
}

function candidatesFor(s: GameState): { id: string; a: GameAction }[] {
  const out: { id: string; a: GameAction }[] = [];
  const live = s.players.filter((p) => p.alive);
  const total = Object.values(s.piles).reduce((n, pl) => n + pl.length, 0);

  switch (s.phase) {
    case 'ROUND_SETUP':
      out.push({ id: live[0].id, a: { type: 'start' } });
      break;
    case 'INITIAL_PLACEMENT':
    case 'ACTION': {
      const cur = s.round.currentPlayerId;
      if (!cur) break;
      const p = s.players.find((x) => x.id === cur)!;
      if (p.hand.length > 0) {
        for (const discId of p.hand) out.push({ id: cur, a: { type: 'place', discId } });
      }
      if (s.phase === 'ACTION') {
        for (let n = 1; n <= total; n++) out.push({ id: cur, a: { type: 'open_bid', amount: n } });
      }
      break;
    }
    case 'BIDDING': {
      const cur = s.round.currentPlayerId;
      if (!cur) break;
      out.push({ id: cur, a: { type: 'pass' } });
      for (let n = s.round.currentBid + 1; n <= total; n++) {
        out.push({ id: cur, a: { type: 'raise_bid', amount: n } });
      }
      break;
    }
    case 'REVEAL': {
      const c = s.round.challengerId;
      if (!c) break;
      const selfUnrevealed = (s.piles[c] ?? []).some((id) => !s.discs[id].revealed);
      if (selfUnrevealed) {
        out.push({ id: c, a: { type: 'reveal', targetPlayerId: c } });
      } else {
        for (const p of live) {
          if ((s.piles[p.id] ?? []).some((id) => !s.discs[id].revealed)) {
            out.push({ id: c, a: { type: 'reveal', targetPlayerId: p.id } });
          }
        }
      }
      break;
    }
    case 'PENALTY': {
      const ctx = s.penalty!;
      for (const discId of ctx.candidates) {
        out.push({ id: ctx.pendingPlayerId, a: { type: 'choose_penalty_disc', discId } });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

let finished = 0;
let stuck = 0;
let conservationErrors = 0;
let leakErrors = 0;
let totalRounds = 0;
let totalSteps = 0;
const reasons = new Map<string, number>();

for (let gi = 0; gi < GAMES; gi++) {
  const players = mkPlayers(3 + Math.floor(rng() * 4)); // 3..6 players
  let s = createGame(`sim_${gi}`, players, undefined, rng);
  const totalDiscs = Object.keys(s.discs).length;
  let steps = 0;

  while (steps++ < 20000) {
    if (s.phase === 'FINISHED') break;
    const cands = candidatesFor(s);
    if (cands.length === 0) break;
    const pick = cands[Math.floor(rng() * cands.length)];
    const r = applyAction(s, pick.id, pick.a, rng);
    if (r.ok) {
      s = r.state;
      // hidden information: an unrevealed disc's type must never appear in a public event
      for (const ev of r.events) {
        if (ev.type === 'DISC_PLACED' && 'type' in ev.payload) leakErrors++;
      }
    }
    // disc conservation
    const sum = Object.values(s.discs).reduce<Record<string, number>>((acc, d) => {
      acc[d.location] = (acc[d.location] ?? 0) + 1;
      return acc;
    }, {});
    const conserved = Object.values(sum).reduce((a, b) => a + b, 0) === totalDiscs;
    if (!conserved) conservationErrors++;
  }

  if (s.phase === 'FINISHED' && s.winnerId) {
    finished++;
    totalRounds += s.round.roundNumber;
    totalSteps += steps;
    const last = s.players.find((p) => p.id === s.winnerId)!;
    const reason = last.mat === 'flower' ? 'double_flower' : 'last_standing';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  } else {
    stuck++;
  }
}

console.log(`games          : ${GAMES}`);
console.log(`finished       : ${finished} (${((finished / GAMES) * 100).toFixed(1)}%)`);
console.log(`stuck/aborted  : ${stuck}`);
console.log(`avg rounds     : ${finished ? (totalRounds / finished).toFixed(2) : '-'}`);
console.log(`avg actions    : ${finished ? (totalSteps / finished).toFixed(1) : '-'}`);
console.log(`conservation   : ${conservationErrors === 0 ? 'OK' : `${conservationErrors} violation(s)`}`);
console.log(`hidden leaks   : ${leakErrors === 0 ? 'none' : `${leakErrors} leak(s)`}`);
for (const [r, n] of reasons) console.log(`  ${r.padEnd(14)}: ${n}`);

if (stuck > 0 || conservationErrors > 0 || leakErrors > 0) process.exit(1);
