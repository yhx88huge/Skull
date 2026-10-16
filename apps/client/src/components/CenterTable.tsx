import type { GameState } from '../types';

const STAGE_LABEL: Record<string, string> = {
  LOBBY: '等待开局',
  ROUND_SETUP: '准备新的一轮',
  INITIAL_PLACEMENT: '暗置圆片',
  ACTION: '开价',
  BIDDING: '竞价中',
  REVEAL: '逐张揭示',
  PENALTY: '惩罚选择',
  ROUND_CLEANUP: '本轮结算',
  FINISHED: '本局终了',
};

export default function CenterTable({ game }: { game: GameState }) {
  const { stage, round, currentBid, totalStashed, challengerId, revealProgress, revealTarget } = game;
  const boss = game.players.find((p) => p.id === game.bossBidderId);

  return (
    <div className="center-table">
      <div className="center-felt">
        <span className="round-badge">第 {round} 轮</span>
        <span className="stage-badge">{STAGE_LABEL[stage] ?? stage}</span>

        <div className="bid-panel">
          <span className="bid-label">当前报价</span>
          <span className="bid-value">{currentBid || '—'}</span>
        </div>

        <div className="center-meta">
          <span>
            场上暗置 <b>{totalStashed}</b>
          </span>
          {boss && (
            <span>
              最高者 <b>{boss.name}</b>
            </span>
          )}
        </div>

        {stage === 'REVEAL' && challengerId && (
          <div className="reveal-progress">
            <span>
              {isNaN(revealTarget) || revealTarget === 0 ? '' : '目标 '}
              {typeof revealTarget === 'number' && revealTarget > 0 ? (
                <>
                  已翻开 <b>{revealProgress}</b> / {revealTarget}
                </>
              ) : null}
            </span>
            <div className="progress-track">
              <i
                style={{
                  width: `${
                    revealTarget > 0 ? Math.min((revealProgress / revealTarget) * 100, 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {stage === 'ROUND_SETUP' && <p className="center-tip">准备新一轮…</p>}
        {stage === 'ACTION' && (
          <p className="center-tip">追加一枚圆片，或开启本轮报价</p>
        )}
        {stage === 'INITIAL_PLACEMENT' && <p className="center-tip">所有人各暗置一枚圆片</p>}
        {stage === 'PENALTY' && <p className="center-tip">惩罚选择中…</p>}
        {game.lastEvent && (
          <p className="center-tip center-event" aria-live="polite">
            {game.lastEvent}
          </p>
        )}
      </div>
    </div>
  );
}