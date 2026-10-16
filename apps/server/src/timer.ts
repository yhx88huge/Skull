import type { GameAction, GameState } from '@skull/core';
import type { Lobby } from './lobby';

/**
 * Turn timer (design §6.3): when a room enables turnTimerSeconds, the server
 * acts for stalling players —
 *   INITIAL_PLACEMENT / ACTION : place a random legal disc (open bid 1 if hand empty)
 *   BIDDING                    : pass
 *   REVEAL                     : reveal the first legal pile clockwise
 *   PENALTY                    : pick a random candidate
 * The timer is re-armed after every state change.
 */
export class TurnTimer {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private lobby: Lobby,
    private onTimeout: (code: string) => void,
  ) {}

  /** Re-arm the timer for a room based on its current game phase. */
  refresh(code: string): void {
    this.clear(code);
    const room = this.lobby.get(code);
    const g = room?.game;
    if (!room || !g) return;
    const secs = room.settings.turnTimerSeconds;
    if (!secs || secs <= 0) return;
    if (!autoAction(g)) return; // phase needs no timer
    const t = setTimeout(() => {
      this.timers.delete(code);
      this.onTimeout(code);
    }, secs * 1000);
    if (typeof t.unref === 'function') t.unref();
    this.timers.set(code, t);
  }

  clear(code: string): void {
    const t = this.timers.get(code);
    if (t) clearTimeout(t);
    this.timers.delete(code);
  }

  clearAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

/** Compute the server's automatic action for the current player, or null if none applies. */
export function autoAction(g: GameState): { playerId: string; action: GameAction } | null {
  const cur = g.round.currentPlayerId;
  switch (g.phase) {
    case 'INITIAL_PLACEMENT':
    case 'ACTION': {
      if (!cur) return null;
      const p = g.players.find((x) => x.id === cur);
      if (!p || !p.alive) return null;
      if (p.hand.length > 0) {
        const discId = p.hand[Math.floor(Math.random() * p.hand.length)];
        return { playerId: cur, action: { type: 'place', discId } };
      }
      // hand empty during ACTION: forced to open the bidding
      const total = Object.values(g.piles).reduce((a, pl) => a + pl.length, 0);
      if (g.phase === 'ACTION' && (g.piles[cur] ?? []).length > 0 && total >= 1) {
        return { playerId: cur, action: { type: 'open_bid', amount: 1 } };
      }
      return null;
    }
    case 'BIDDING':
      return cur ? { playerId: cur, action: { type: 'pass' } } : null;
    case 'REVEAL': {
      const c = g.round.challengerId;
      if (!c) return null;
      const hasOwn = (g.piles[c] ?? []).some((id) => !g.discs[id].revealed);
      if (hasOwn) return { playerId: c, action: { type: 'reveal', targetPlayerId: c } };
      const alive = g.players.filter((p) => p.alive).sort((a, b) => a.seat - b.seat);
      const startIdx = Math.max(0, alive.findIndex((p) => p.id === c));
      for (let i = 0; i < alive.length; i++) {
        const cand = alive[(startIdx + i) % alive.length];
        if ((g.piles[cand.id] ?? []).some((id) => !g.discs[id].revealed)) {
          return { playerId: c, action: { type: 'reveal', targetPlayerId: cand.id } };
        }
      }
      return null;
    }
    case 'PENALTY': {
      const ctx = g.penalty;
      if (!ctx || ctx.candidates.length === 0) return null;
      const pick = ctx.candidates[Math.floor(Math.random() * ctx.candidates.length)];
      return { playerId: ctx.pendingPlayerId, action: { type: 'choose_penalty_disc', discId: pick } };
    }
    default:
      return null;
  }
}
