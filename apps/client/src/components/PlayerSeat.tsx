import type { GamePlayer } from '../types';

interface Props {
  player: GamePlayer;
  isActive: boolean;
  isRevealTarget?: boolean;
  onReveal?: (id: string) => void;
}

export function Flower() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M12 6c-1.6-2.4-4.6-1.2-4.2 1.2" fill="currentColor" opacity=".55" />
        <path d="M12 6c1.6-2.4 4.6-1.2 4.2 1.2" fill="currentColor" opacity=".55" />
        <path d="M12 6c-2.4-1.5-3.8 1.4-1.6 2.6" fill="currentColor" opacity=".55" />
        <path d="M12 6c2.4-1.5 3.8 1.4 1.6 2.6" fill="currentColor" opacity=".55" />
        <circle cx="12" cy="8.2" r="1.4" fill="currentColor" />
        <path d="M12 9.4c-2.8 0-4.8 2.1-4.8 4.8 0 2.6 2.1 4.7 4.8 4.7s4.8-2.1 4.8-4.7c0-2.7-2-4.8-4.8-4.8Z" />
        <circle cx="12" cy="14.2" r="1.5" fill="currentColor" opacity=".8" />
      </g>
    </svg>
  );
}

export function Skull() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M4.5 15.5C3.2 14 2.7 12.3 3 10.4 3.5 7 6.8 4.6 12 4.6s8.5 2.4 9 5.8c.3 1.9-.2 3.6-1.5 5.1-1.3 1.5-3.4 2.6-7.5 2.6s-6.2-1.1-7.5-2.6Z" />
        <circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="11" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12 13.8c-1.6 0-2.6 1-2.6 2.4 0 .9.5 1.6 1.3 1.9.3-.9 1.3-1.6 2.6-1.6" fill="currentColor" opacity=".9" />
        <path d="M5 19.6h14" />
      </g>
    </svg>
  );
}

export default function PlayerSeat({ player, isActive, isRevealTarget, onReveal }: Props) {
  const p = player;
  return (
    <div
      className={`seat ${p.isSelf ? 'seat-self' : ''} ${p.alive ? '' : 'seat-dead'} ${
        isActive ? 'seat-active' : ''
      } ${isRevealTarget ? 'seat-target' : ''} ${p.passed ? 'seat-passed' : ''}`}
      style={{ ['--hue' as string]: p.hue }}
      onClick={() => isRevealTarget && onReveal?.(p.id)}
    >
      <div className="seat-top">
        <span className={`avatar`}>{p.name.slice(0, 1)}</span>
        <span className="seat-id">
          {p.name}
          {p.isSelf && <i className="you-tag">你</i>}
        </span>
        <span className="seat-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>

      <div className={`mat ${p.mat === 'flower' ? 'mat-flower' : 'mat-blank'}`}>
        {p.mat === 'flower' ? <Flower /> : <Skull />}
        <span className="mat-side-label">{p.mat === 'flower' ? '已翻' : '未翻'}</span>
      </div>

      <div className="seat-bottom">
        <span className="stash-label">暗置</span>
        <div className="stash row-rev">
          {Array.from({ length: Math.max(0, p.stash) }).map((_, i) => (
            <span
              key={i}
              className={`disc-mini ${i === 0 && p.topRevealed ? `top-reveal-${p.topRevealed}` : ''}`}
            >
              {i === 0 && p.topRevealed === 'flower' ? <Flower /> : i === 0 && p.topRevealed === 'skull' ? <Skull /> : null}
            </span>
          ))}
        </div>
        <span className="hand-label">
          手牌 <b>{p.handLeft}</b>
        </span>
      </div>

      {p.passed && <span className="stamp">弃权</span>}
      {!p.alive && <span className="stamp stamp-dead">出局</span>}
      {p.passed && <span className="seat-filter" aria-hidden />}
    </div>
  );
}