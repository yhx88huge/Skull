import { useEffect, useRef } from 'react';
import type { Snapshot, RoomAction } from '@skull/protocol';

import PlayerSeat from './PlayerSeat';
import CenterTable from './CenterTable';
import ActionBar from './ActionBar';

interface Props {
  snapshot: Snapshot;
  nickname: string;
  onAction: (action: RoomAction) => void;
  onLeave: () => void;
}

export default function GameScreen({ snapshot, nickname, onAction, onLeave }: Props) {
  const prevPhase = useRef(snapshot.phase);

  useEffect(() => {
    if (snapshot.phase !== prevPhase.current) {
      prevPhase.current = snapshot.phase;
    }
  }, [snapshot.phase]);

  const players = snapshot.players;
  const selfId = players.find((p) => p.name === nickname)?.id ?? '';
  const isSelfTurn = selfId === snapshot.round.currentPlayerId;
  const isChallenger = selfId === snapshot.round.challengerId;
  const totalStashed = snapshot.board.totalStashed;
  const currentBid = snapshot.round.currentBid;
  const phase = snapshot.phase;

  const buildPlayer = (p: (typeof players)[0]) => {
    return {
      id: p.id,
      name: p.name,
      mat: p.mat,
      handLeft: p.handCount,
      stash: p.pileCount,
      topRevealed: p.topRevealed,
      passed: p.passed,
      alive: p.alive,
      isSelf: p.id === selfId,
      hue: (Number(p.id.slice(1)) % 6) + 1,
    };
  };

  const gamePlayers = players.map(buildPlayer);

  const handlePlace = () => {
    onAction({ type: 'place' });
  };

  const handleOpenBid = (n: number) => {
    onAction({ type: 'open_bid', amount: n });
  };

  const handleRaise = (n: number) => {
    onAction({ type: 'raise_bid', amount: n });
  };

  const handlePass = () => {
    onAction({ type: 'pass' });
  };

  const handleReveal = (targetPlayerId: string) => {
    onAction({ type: 'reveal', targetPlayerId });
  };

  const handleNextStage = () => {
    // handled by server
  };

  return (
    <div className="game">
      <header className="game-bar">
        <span className="game-brand">SKULL</span>
        <span className="game-room">房间 {snapshot.roomCode}</span>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          离开
        </button>
      </header>

      <div className="table-wrap">
        {gamePlayers.map((p) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isActive={snapshot.round.currentPlayerId === p.id && !isSelfTurn}
            isRevealTarget={
              phase === 'REVEAL' &&
              isSelfTurn &&
              isChallenger &&
              p.id === snapshot.round.currentPlayerId
            }
            onReveal={handleReveal}
          />
        ))}
        <CenterTable
          game={{
            stage: phase,
            round: snapshot.round.roundNumber,
            currentTurnId: snapshot.round.currentPlayerId ?? '',
            selfTurn: isSelfTurn,
            currentBid,
            totalStashed,
            bossBidderId: snapshot.round.bidderId,
            challengerId: snapshot.round.challengerId,
            revealTarget: currentBid,
            revealProgress: snapshot.round.revealProgress,
            settle: snapshot.board.winnerId ? 'win' : null,
            lastEvent: '',
            players: gamePlayers,
          }}
          onNextStage={handleNextStage}
        />
      </div>

      <ActionBar
        game={{
          stage: phase,
          round: snapshot.round.roundNumber,
          currentTurnId: snapshot.round.currentPlayerId ?? '',
          selfTurn: isSelfTurn,
          currentBid,
          totalStashed,
          bossBidderId: snapshot.round.bidderId,
          challengerId: snapshot.round.challengerId,
          revealTarget: currentBid,
          revealProgress: snapshot.round.revealProgress,
          settle: snapshot.board.winnerId ? 'win' : null,
          lastEvent: '',
          players: gamePlayers,
        }}
        onPlace={handlePlace}
        onOpenBid={handleOpenBid}
        onRaise={handleRaise}
        onPass={handlePass}
      />
    </div>
  );
}
