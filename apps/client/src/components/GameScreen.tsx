import type { Snapshot, RoomAction, GameEvent, GameEndedPayload, PlayerPublic } from '@skull/protocol';

import PlayerSeat from './PlayerSeat';
import CenterTable from './CenterTable';
import ActionBar from './ActionBar';
import { hueOf } from '../types';

interface Props {
  snapshot: Snapshot;
  lastEvent: GameEvent | null;
  ended: GameEndedPayload | null;
  onAction: (action: RoomAction) => void;
  onRematch: () => void;
  onLeave: () => void;
}

function eventText(ev: GameEvent | null, players: PlayerPublic[]): string {
  if (!ev) return '';
  const name = (id?: unknown) => players.find((p) => p.id === id)?.name ?? '??';
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case 'ROUND_STARTED':
      return `第 ${p.roundNumber} 轮开始`;
    case 'DISC_PLACED':
      return `${name(p.playerId)} 暗置了一枚圆片`;
    case 'BID_OPENED':
      return `${name(p.playerId)} 开价 ${p.amount} 枚`;
    case 'BID_RAISED':
      return `${name(p.playerId)} 加价到 ${p.amount} 枚`;
    case 'PLAYER_PASSED':
      return `${name(p.playerId)} 弃权`;
    case 'CHALLENGE_STARTED':
      return `${name(p.challengerId)} 成为挑战者，目标 ${p.target} 枚`;
    case 'DISC_REVEALED':
      return `翻开了 ${name(p.playerId)} 的圆片：${p.type === 'skull' ? '骷髅！' : '花'}`;
    case 'CHALLENGE_SUCCEEDED':
      return `${name(p.challengerId)} 挑战成功，垫子翻到花面`;
    case 'CHALLENGE_FAILED':
      return `${name(p.challengerId)} 翻到了骷髅 —— 挑战失败`;
    case 'DISC_REMOVED':
      return `${name(p.fromPlayerId)} 被移除一枚圆片`;
    case 'PLAYER_ELIMINATED':
      return `${name(p.playerId)} 淘汰出局`;
    case 'LAST_CHANCE_GRANTED':
      return `${name(p.playerId)} 获得最后机会圆片`;
    case 'ROUND_ENDED':
      return '本轮结束';
    case 'GAME_ENDED':
      return `${name(p.winnerId)} 获胜！`;
    default:
      return '';
  }
}

const END_REASON: Record<string, string> = {
  double_flower: '两次挑战成功',
  last_standing: '唯一存活',
  finished: '对局结束',
};

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

export default function GameScreen({ snapshot, lastEvent, ended, onAction, onRematch, onLeave }: Props) {
  const players = snapshot.players;
  const selfId = snapshot.youPlayerId;
  const self = players.find((p) => p.id === selfId);
  const isSelfTurn = selfId === snapshot.round.currentPlayerId;
  const isChallenger = selfId === snapshot.round.challengerId;
  const isHost = selfId === snapshot.hostId;
  const phase = snapshot.phase;
  const finished = phase === 'FINISHED';

  const gamePlayers = players.map((p) => ({
    id: p.id,
    name: p.name,
    mat: p.mat,
    handLeft: p.handCount,
    stash: p.pileCount,
    unrevealedCount: p.unrevealedCount,
    topRevealed: p.topRevealed,
    passed: p.passed,
    alive: p.alive,
    isSelf: p.id === selfId,
    hue: hueOf(p.id),
  }));

  // legal reveal targets: own pile first while it has unrevealed discs
  const revealTargets = new Set<string>();
  if (phase === 'REVEAL' && isChallenger && self?.alive) {
    if (self.unrevealedCount > 0) {
      revealTargets.add(selfId);
    } else {
      for (const p of players) {
        if (p.alive && p.unrevealedCount > 0) revealTargets.add(p.id);
      }
    }
  }

  const game = {
    stage: phase,
    round: snapshot.round.roundNumber,
    currentTurnId: snapshot.round.currentPlayerId ?? '',
    selfTurn: isSelfTurn,
    currentBid: snapshot.round.currentBid,
    totalStashed: snapshot.board.totalStashed,
    bossBidderId: snapshot.round.bidderId,
    challengerId: snapshot.round.challengerId,
    revealTarget: snapshot.round.currentBid,
    revealProgress: snapshot.round.revealProgress,
    settle: null,
    lastEvent: eventText(lastEvent, players),
    players: gamePlayers,
  };

  const winnerName = players.find((p) => p.id === snapshot.board.winnerId)?.name ?? '';

  return (
    <div className="game">
      <header className="game-bar">
        <span className="game-brand">SKULL</span>
        <span className="game-room">房间 {snapshot.roomCode}</span>
        <span className="game-event-line" aria-live="polite">
          {game.lastEvent}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          离开
        </button>
      </header>

      <div className="table-wrap">
        {gamePlayers.map((p) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isActive={snapshot.round.currentPlayerId === p.id && !finished}
            isRevealTarget={revealTargets.has(p.id)}
            onReveal={(id) => onAction({ type: 'reveal', targetPlayerId: id })}
          />
        ))}
        <CenterTable game={game} />
      </div>

      {finished ? (
        <div className="settle-panel" role="dialog" aria-label="对局结算">
          <h2>{winnerName ? `${winnerName} 获胜！` : '对局结束'}</h2>
          <p>
            胜利方式：{END_REASON[ended?.reason ?? 'finished'] ?? '对局结束'} · 共{' '}
            {ended?.rounds ?? snapshot.round.roundNumber} 轮 · 用时 {formatDuration(ended?.durationMs ?? null)}
          </p>
          <ul className="settle-stats">
            {players.map((p) => (
              <li key={p.id}>
                {p.name} — {p.alive ? '存活' : '出局'} · 垫子{p.mat === 'flower' ? '花面' : '空白面'} · 剩{' '}
                {p.handCount} 枚
              </li>
            ))}
          </ul>
          {isHost ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch}>
              再来一局
            </button>
          ) : (
            <p className="ab-hint">等待房主再开一局…</p>
          )}
        </div>
      ) : (
        <ActionBar
          game={game}
          meId={selfId}
          secret={snapshot.ownSecret}
          penalty={snapshot.penalty}
          onPlace={(discId) => onAction({ type: 'place', discId })}
          onOpenBid={(n) => onAction({ type: 'open_bid', amount: n })}
          onRaise={(n) => onAction({ type: 'raise_bid', amount: n })}
          onPass={() => onAction({ type: 'pass' })}
          onChoosePenalty={(discId) => onAction({ type: 'choose_penalty_disc', discId })}
        />
      )}
    </div>
  );
}
