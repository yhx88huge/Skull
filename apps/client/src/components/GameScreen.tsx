import { useCallback, useEffect, useRef, useState } from 'react';
import { freshGame } from '../mock';
import type { GameState } from '../types';
import PlayerSeat from './PlayerSeat';
import CenterTable from './CenterTable';
import ActionBar from './ActionBar';

type Action =
  | { type: 'start-round' }
  | { type: 'place' }
  | { type: 'open-bid'; n: number }
  | { type: 'raise'; n: number }
  | { type: 'pass' }
  | { type: 'reveal'; id: string }
  | { type: 'next' };

interface Ctx {
  placed: Set<string>;
  budgets: Record<string, number>;
}

function nextAfter(g: GameState, fromId: string, skipPassed: boolean): string {
  const order = g.players.map((p) => p.id);
  const i = order.indexOf(fromId);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(i + k) % order.length];
    const p = g.players.find((x) => x.id === id)!;
    if (!p.alive) continue;
    if (skipPassed && p.passed) continue;
    return id;
  }
  return order[0];
}

function replayFor(round: number): { id: string; type: 'flower' | 'skull' }[] {
  if (round >= 2) return [{ id: 'p0', type: 'flower' }, { id: 'p3', type: 'flower' }];
  return [
    { id: 'p0', type: 'flower' },
    { id: 'p1', type: 'flower' },
    { id: 'p3', type: 'skull' },
  ];
}

function apply(g: GameState, action: Action, ctx: Ctx): { g: GameState | null; ctx: Ctx } {
  const clone = (): GameState => ({
    ...g,
    players: g.players.map((p) => ({ ...p })),
  });
  const setTurn = (s: GameState, id: string) => {
    s.currentTurnId = id;
    s.selfTurn = id === 'p0';
  };
  const beginRoundPlacing = (s: GameState): Ctx => {
    s.currentBid = 0;
    s.bossBidderId = null;
    s.challengerId = null;
    s.settle = null;
    s.revealTarget = 0;
    s.revealProgress = 0;
    s.totalStashed = 0;
    s.players.forEach((p) => {
      if (!p.alive) return;
      p.passed = false;
      p.topRevealed = null;
      p.stash = 0;
    });
    const placed = new Set<string>();
    const budgets: Record<string, number> = {};
    s.players.filter((p) => p.alive).forEach((p) => (budgets[p.id] = p.isSelf ? 0 : 1));
    setTurn(s, 'p0');
    return { placed, budgets };
  };

  let ctxNext: Ctx = ctx;
  switch (action.type) {
    case 'start-round': {
      if (g.stage !== 'SETUP') return { g: null, ctx };
      const s = clone();
      s.stage = 'PLACEMENT';
      ctxNext = beginRoundPlacing(s);
      s.lastEvent = '第 1 轮 · 先手由你开始暗置';
      return { g: s, ctx: ctxNext };
    }

    case 'place': {
      const actor = g.players.find((p) => p.id === g.currentTurnId);
      if (!actor || !actor.alive || ctx.placed.has(actor.id) || g.stage !== 'PLACEMENT')
        return { g: null, ctx };
      const s = clone();
      const me = s.players.find((p) => p.id === actor.id)!;
      me.stash += 1;
      if (me.handLeft > 0) me.handLeft -= 1;
      me.topRevealed = null;
      s.totalStashed += 1;
      const placed = new Set(ctx.placed);
      placed.add(actor.id);
      const aliveCount = s.players.filter((p) => p.alive).length;
      if (placed.size >= aliveCount) {
        s.stage = 'OPEN';
        setTurn(s, 'p0');
        s.lastEvent = '全部暗置完成 · 由你开价';
      } else {
        setTurn(s, nextAfter(s, actor.id, false));
        s.lastEvent = `${actor.name} 暗置了一枚圆片`;
      }
      return { g: s, ctx: { placed, budgets: ctx.budgets } };
    }

    case 'open-bid': {
      if (g.stage !== 'OPEN' || !g.selfTurn) return { g: null, ctx };
      const s = clone();
      s.currentBid = Math.max(1, Math.min(action.n, s.totalStashed));
      s.bossBidderId = 'p0';
      s.stage = 'BIDDING';
      s.lastEvent = `你开价 ${s.currentBid} 枚`;
      setTurn(s, nextAfter(s, 'p0', true));
      return { g: s, ctx };
    }

    case 'raise': {
      if (g.stage !== 'BIDDING' || !g.selfTurn) return { g: null, ctx };
      const s = clone();
      s.currentBid += action.n;
      s.lastEvent = `你加价到 ${s.currentBid}`;
      const next = nextAfter(s, 'p0', true);
      const left = s.players.filter((p) => p.alive && !p.passed);
      if (next === 'p0' || left.length === 1) {
        s.challengerId = 'p0';
        s.stage = 'REVEAL';
        s.revealTarget = s.currentBid;
        s.revealProgress = 0;
        s.lastEvent = `竞价结束 · 挑战者是你 (报价 ${s.currentBid})`;
      } else {
        setTurn(s, next);
      }
      s.bossBidderId = 'p0';
      return { g: s, ctx };
    }

    case 'pass': {
      if (g.stage !== 'BIDDING' || !g.selfTurn) return { g: null, ctx };
      const s = clone();
      const me = s.players.find((p) => p.id === 'p0')!;
      me.passed = true;
      s.lastEvent = '你弃权退出本轮竞价';
      const next = nextAfter(s, 'p0', true);
      const left = s.players.filter((p) => p.alive && !p.passed);
      if (next === 'p0' && left.length === 1) {
        s.challengerId = 'p0';
        s.stage = 'REVEAL';
        s.revealTarget = s.currentBid;
        s.revealProgress = 0;
        s.lastEvent = '竞价结束 · 挑战者是你';
        setTurn(s, 'p0');
      } else if (next === 'p0' || left.length === 1) {
        const c = left[0];
        s.challengerId = c.id;
        s.stage = 'REVEAL';
        s.revealTarget = s.currentBid;
        s.revealProgress = 0;
        s.lastEvent = `竞价结束 · 挑战者 ${c.name}`;
        setTurn(s, c.id);
      } else {
        setTurn(s, next);
      }
      return { g: s, ctx };
    }

    case 'reveal': {
      if (g.stage !== 'REVEAL' || !g.selfTurn) return { g: null, ctx };
      const step = replayFor(g.round)[g.revealProgress];
      if (!step || step.id !== action.id) return { g: null, ctx };
      const s = clone();
      const target = s.players.find((p) => p.id === step.id)!;
      target.topRevealed = step.type;
      s.revealProgress += 1;
      if (step.type === 'skull') {
        s.stage = 'SETTLED';
        s.settle = 'lose';
        s.lastEvent = `翻到 ${target.name} 的骷髅 —— 挑战失败，你被扣掉一枚圆片`;
      } else if (s.revealProgress >= s.revealTarget) {
        const c = s.players.find((p) => p.id === s.challengerId);
        if (c?.mat === 'flower') {
          s.stage = 'FINISHED';
          s.settle = 'win';
          s.lastEvent = '第二次翻花成功 —— 本局你赢了！';
        } else {
          if (c) c.mat = 'flower';
          s.stage = 'SETTLED';
          s.settle = 'win';
          s.lastEvent = '挑战成功 · 你的垫子翻到花面';
        }
      } else {
        s.lastEvent = `揭示 ${target.name} · 是花，安全继续`;
        setTurn(s, 'p0');
      }
      return { g: s, ctx };
    }

    case 'next': {
      if (g.stage === 'SETTLED') {
        const s = clone();
        s.round += 1;
        s.stage = 'PLACEMENT';
        ctxNext = beginRoundPlacing(s);
        s.lastEvent = `第 ${s.round} 轮开始 · 先手依然是挑战者（你）`;
        return { g: s, ctx: ctxNext };
      }
      if (g.stage === 'FINISHED') {
        return { g: freshGame(), ctx: { placed: new Set(), budgets: {} } };
      }
      return { g: null, ctx };
    }
  }
  return { g: null, ctx };
}

export default function GameScreen({ nickname }: { nickname: string }) {
  const [game, setGame] = useState<GameState>(() => {
    const g = freshGame();
    g.players[0].name = nickname;
    return g;
  });
  const ctxRef = useRef<Ctx>({ placed: new Set(), budgets: {} });

  const dispatch = useCallback((action: Action) => {
    setGame((prev) => {
      const res = apply(prev, action, ctxRef.current);
      if (res.g) ctxRef.current = res.ctx;
      return res.g ?? prev;
    });
  }, []);

  const botAct = useCallback(() => {
    setGame((prev) => {
      const actor = prev.players.find((p) => p.id === prev.currentTurnId);
      if (!actor || actor.isSelf) return prev;
      if (prev.stage === 'PLACEMENT') {
        const res = apply(prev, { type: 'place' }, ctxRef.current);
        if (res.g) ctxRef.current = res.ctx;
        return res.g ?? prev;
      }
      if (prev.stage === 'BIDDING') {
        const budget = ctxRef.current.budgets[actor.id] ?? 0;
        const action: Action =
          budget > 0
            ? { type: 'raise', n: 1 }
            : { type: 'pass' };
        const nextCtx =
          budget > 0
            ? { ...ctxRef.current, budgets: { ...ctxRef.current.budgets, [actor.id]: budget - 1 } }
            : ctxRef.current;
        const res = apply(prev, action, nextCtx);
        if (res.g) ctxRef.current = res.ctx;
        return res.g ?? prev;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (game.selfTurn) return;
    const t = window.setTimeout(() => botAct(), 950);
    return () => window.clearTimeout(t);
  }, [game.stage, game.currentTurnId, game.selfTurn, game.lastEvent, botAct]);

  const revealStep = replayFor(game.round)[game.revealProgress];

  return (
    <div className="game">
      <header className="game-bar">
        <span className="game-brand">SKULL</span>
        <span className="game-room">房间 K7M2X9</span>
        <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
          离开
        </button>
      </header>

      <div className="table-wrap">
        {game.players.map((p) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isActive={game.currentTurnId === p.id && !game.selfTurn}
            isRevealTarget={
              game.stage === 'REVEAL' && game.selfTurn && !!revealStep && revealStep.id === p.id
            }
            onReveal={(id) => dispatch({ type: 'reveal', id })}
          />
        ))}
        <CenterTable
          game={game}
          onNextStage={() =>
            dispatch(game.stage === 'SETUP' ? { type: 'start-round' } : { type: 'next' })
          }
        />
      </div>

      <ActionBar
        game={game}
        onPlace={() => dispatch({ type: 'place' })}
        onOpenBid={(n) => dispatch({ type: 'open-bid', n })}
        onRaise={(n) => dispatch({ type: 'raise', n })}
        onPass={() => dispatch({ type: 'pass' })}
      />
    </div>
  );
}