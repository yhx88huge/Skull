import { useState } from 'react';
import type { GameState } from '../types';

interface Props {
  game: GameState;
  onPlace: () => void;
  onOpenBid: (n: number) => void;
  onRaise: (n: number) => void;
  onPass: () => void;
}

export default function ActionBar({ game, onPlace, onOpenBid, onRaise, onPass }: Props) {
  const [bid, setBid] = useState(1);
  const { stage, selfTurn, currentBid, totalStashed, currentTurnId } = game;
  const acting = game.players.find((p) => p.id === currentTurnId);
  const maxBid = Math.max(1, totalStashed - (currentBid || 0));

  if (!selfTurn) {
    return (
      <div className="actionbar waiting">
        <span className="wait-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        等待 <b>{acting?.name}</b>
        {(stage === 'BIDDING' || stage === 'ACTION') && ' 行动…'}
        {(stage === 'INITIAL_PLACEMENT') && ' 暗置圆片…'}
      </div>
    );
  }

  return (
    <div className="actionbar">
      {stage === 'INITIAL_PLACEMENT' && (
        <>
          <div className="ab-hint">暗置一枚圆片 — 背面朝上放入你的牌堆</div>
          <button className="btn btn-primary btn-lg" onClick={onPlace} disabled={totalStashed >= 4}>
            暗置一枚
          </button>
        </>
      )}

      {stage === 'ACTION' && (
        <>
          <div className="ab-hint">
            报出你能安全翻开的圆片数，上限 {totalStashed}
          </div>
          <div className="ab-bid">
            <input
              type="number"
              min={1}
              max={totalStashed}
              value={bid}
              onChange={(e) => setBid(Math.max(1, Math.min(totalStashed, Number(e.target.value) || 1)))}
            />
            <button className="btn btn-primary btn-lg" onClick={() => onOpenBid(bid)}>
              开价 {bid} 枚
            </button>
          </div>
        </>
      )}

      {stage === 'BIDDING' && (
        <>
          <div className="ab-hint">
            当前报价 {currentBid}，场上共 {totalStashed}
          </div>
          <div className="ab-buttons">
            <button className="btn btn-primary" onClick={() => onRaise(1)} disabled={maxBid < 1}>
              加价 +1
            </button>
            <button className="btn btn-primary" onClick={() => onRaise(2)} disabled={maxBid < 2}>
              加价 +2
            </button>
            <button className="btn btn-ghost btn-danger" onClick={onPass}>
              弃权
            </button>
          </div>
        </>
      )}

      {stage === 'REVEAL' && (
        <div className="ab-hint reveal-tip">
          点击场上高亮发光的目标牌堆，逐张揭示圆片
        </div>
      )}
      {(stage === 'ROUND_CLEANUP' || stage === 'FINISHED') && (
        <div className="ab-hint">{game.lastEvent}</div>
      )}
    </div>
  );
}