import { useEffect, useState } from 'react';
import type { GameState } from '../types';
import type { PenaltyView, PlayerSecret, SecretDisc } from '@skull/protocol';
import { Flower, Skull } from './PlayerSeat';

interface Props {
  game: GameState;
  meId: string;
  secret: PlayerSecret | null;
  penalty: PenaltyView | null;
  onPlace: (discId?: string) => void;
  onOpenBid: (n: number) => void;
  onRaise: (n: number) => void;
  onPass: () => void;
  onChoosePenalty: (discId: string) => void;
}

function DiscIcon({ type }: { type: 'flower' | 'skull' }) {
  return type === 'flower' ? <Flower /> : <Skull />;
}

/** Own-hand strip; selectable while placing. */
function HandStrip({
  hand,
  selectable,
  selectedId,
  onSelect,
}: {
  hand: SecretDisc[];
  selectable: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (hand.length === 0) return null;
  return (
    <div className="hand-strip">
      <span className="hand-strip-label">你的手牌</span>
      {hand.map((d) => (
        <button
          key={d.id}
          type="button"
          className={`hand-disc hand-disc-${d.type} ${selectedId === d.id ? 'hand-disc-sel' : ''}`}
          disabled={!selectable}
          onClick={() => onSelect(d.id)}
          aria-label={d.type === 'skull' ? '骷髅' : '花'}
        >
          <DiscIcon type={d.type} />
        </button>
      ))}
    </div>
  );
}

export default function ActionBar({
  game,
  meId,
  secret,
  penalty,
  onPlace,
  onOpenBid,
  onRaise,
  onPass,
  onChoosePenalty,
}: Props) {
  const { stage, selfTurn, currentBid, totalStashed, currentTurnId } = game;
  const acting = game.players.find((p) => p.id === currentTurnId);

  const hand = secret?.hand ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bid, setBid] = useState(1);
  const [raise, setRaise] = useState(0);

  // default/select-first whenever the hand changes (e.g. after placing)
  useEffect(() => {
    if (selectedId && hand.some((d) => d.id === selectedId)) return;
    setSelectedId(hand[0]?.id ?? null);
  }, [hand, selectedId]);

  useEffect(() => {
    setRaise(currentBid + 1);
  }, [currentBid]);

  const placeable = (stage === 'INITIAL_PLACEMENT' || stage === 'ACTION') && selfTurn;
  const isPenaltyPicker = stage === 'PENALTY' && penalty?.pendingPlayerId === meId;
  const blindPick = isPenaltyPicker && penalty!.challengerId !== meId;

  // map candidate id -> type for the non-blind (own skull) case
  const knownTypes = new Map<string, 'flower' | 'skull'>();
  for (const d of secret?.hand ?? []) knownTypes.set(d.id, d.type);
  for (const d of secret?.pile ?? []) knownTypes.set(d.id, d.type);

  if (isPenaltyPicker && penalty) {
    return (
      <div className="actionbar">
        <div className="ab-hint">
          {blindPick
            ? '你翻出骷髅立了功 —— 从挑战者的圆片中盲选一枚移除'
            : '你翻到了自己的骷髅 —— 秘密选择一枚圆片移除'}
        </div>
        <div className="hand-strip penalty-strip">
          {penalty.candidates.map((id) => {
            const t = blindPick ? null : knownTypes.get(id) ?? null;
            return (
              <button
                key={id}
                type="button"
                className={`hand-disc ${t ? `hand-disc-${t}` : 'hand-disc-back'}`}
                onClick={() => onChoosePenalty(id)}
                aria-label={t ? (t === 'skull' ? '骷髅' : '花') : '背面朝上的圆片'}
              >
                {t ? <DiscIcon type={t} /> : <span className="disc-back-q">?</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!selfTurn) {
    return (
      <div className="actionbar waiting">
        <span className="wait-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {stage === 'PENALTY' && penalty
          ? `等待 ${game.players.find((p) => p.id === penalty.pendingPlayerId)?.name ?? '??'} 选择移除的圆片…`
          : stage === 'REVEAL'
            ? `等待挑战者 ${acting?.name ?? ''} 揭示…`
            : stage === 'INITIAL_PLACEMENT'
              ? `等待 ${acting?.name ?? ''} 暗置圆片…`
              : `等待 ${acting?.name ?? ''} 行动…`}
      </div>
    );
  }

  return (
    <div className="actionbar">
      {placeable && (
        <>
          <HandStrip hand={hand} selectable selectedId={selectedId} onSelect={setSelectedId} />
          {stage === 'INITIAL_PLACEMENT' && (
            <>
              <div className="ab-hint">选择一枚圆片，背面朝上放入你的牌堆</div>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => onPlace(selectedId ?? undefined)}
                disabled={!selectedId}
              >
                暗置一枚
              </button>
            </>
          )}
        </>
      )}

      {stage === 'ACTION' && (
        <>
          {hand.length > 0 && (
            <button
              className="btn btn-outline"
              onClick={() => onPlace(selectedId ?? undefined)}
              disabled={!selectedId}
            >
              追加一枚
            </button>
          )}
          <div className="ab-hint">或报出你能安全翻开的圆片数，上限 {totalStashed}</div>
          <div className="ab-bid">
            <input
              type="number"
              min={1}
              max={Math.max(1, totalStashed)}
              value={bid}
              onChange={(e) => setBid(Math.max(1, Math.min(totalStashed || 1, Number(e.target.value) || 1)))}
            />
            <button className="btn btn-primary btn-lg" onClick={() => onOpenBid(bid)} disabled={totalStashed < 1}>
              开价 {bid} 枚
            </button>
          </div>
        </>
      )}

      {stage === 'BIDDING' && (
        <>
          <div className="ab-hint">
            当前报价 {currentBid}，场上共 {totalStashed} —— 加价必须更高
          </div>
          <div className="ab-bid">
            <input
              type="number"
              min={currentBid + 1}
              max={totalStashed}
              value={raise}
              onChange={(e) =>
                setRaise(Math.max(currentBid + 1, Math.min(totalStashed, Number(e.target.value) || currentBid + 1)))
              }
            />
            <button
              className="btn btn-primary"
              onClick={() => onRaise(raise)}
              disabled={raise <= currentBid || raise > totalStashed}
            >
              加价到 {raise}
            </button>
            <button className="btn btn-ghost btn-danger" onClick={onPass}>
              弃权
            </button>
          </div>
        </>
      )}

      {stage === 'REVEAL' && (
        <div className="ab-hint reveal-tip">点击场上高亮发光的目标牌堆，逐张揭示圆片</div>
      )}
      {(stage === 'ROUND_CLEANUP' || stage === 'ROUND_SETUP') && (
        <div className="ab-hint">{game.lastEvent || '准备中…'}</div>
      )}
    </div>
  );
}
