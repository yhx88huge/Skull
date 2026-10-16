import type { GameState } from '../types';

const STAGE_LABEL: Record<GameState['stage'], string> = {
  SETUP: '准备开局',
  PLACEMENT: '暗置圆片',
  OPEN: '开价',
  BIDDING: '竞价中',
  REVEAL: '逐张揭示',
  SETTLED: '本轮结算',
  FINISHED: '本局终了',
};

export default function CenterTable({
  game,
  onNextStage,
}: {
  game: GameState;
  onNextStage: () => void;
}) {
  const { stage, round, currentBid, totalStashed, challengerId, revealProgress, revealTarget } = game;
  const boss = game.players.find((p) => p.id === game.bossBidderId);

  return (
    <div className="center-table">
      <div className="center-felt">
        <span className="round-badge">第 {round} 轮</span>
        <span className="stage-badge">{STAGE_LABEL[stage]}</span>

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

        {stage === 'SETUP' && (
          <button className="btn btn-primary" onClick={onNextStage}>
            开始第一轮
          </button>
        )}
        {stage === 'OPEN' && (
          <p className="center-tip">由你开启本轮的报价面纱</p>
        )}
        {stage === 'PLACEMENT' && <p className="center-tip">所有人各暗置一枚圆片</p>}
        {(stage === 'SETTLED' || stage === 'FINISHED') && (
          <div className={`settle-banner ${game.settle === 'win' ? 'settle-win' : 'settle-lose'}`}>
            {game.settle === 'lose' && '翻到骷髅 —— 挑战失败'}
            {game.settle === 'win' && stage === 'SETTLED' && '挑战成功，垫子翻到花面'}
            {game.settle === 'win' && stage === 'FINISHED' && '第二次翻花成功 —— 本局你赢了！'}
            {stage === 'SETTLED' && (
              <button className="btn btn-outline btn-sm" onClick={onNextStage}>
                下一轮
              </button>
            )}
            {stage === 'FINISHED' && (
              <button className="btn btn-primary btn-sm" onClick={onNextStage}>
                再来一局
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}