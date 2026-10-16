import type { ReactNode } from 'react';

function SkullMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8.4" cy="10" r="1.7" fill="currentColor" />
      <circle cx="15.6" cy="10" r="1.7" fill="currentColor" />
      <path d="M12 13.6c-1.4 0-2.2.9-2.2 2.1 0 .7.4 1.3 1 1.6.3-.8 1.2-1.3 2.2-1.3" fill="currentColor" opacity=".9" />
      <rect x="5.4" y="19.4" width="13.2" height="1.7" rx=".85" fill="currentColor" opacity=".85" />
    </svg>
  );
}

export default function TitleBar({ right }: { right?: ReactNode }) {
  return (
    <header className="titlebar">
      <button
        className="brand"
        onClick={() => {
          window.location.hash = '';
        }}
        title="Skull"
      >
        <SkullMark size={34} />
        <span className="brand-name">SKULL</span>
        <span className="brand-sub">骷髅宣言 · 诈唬集会</span>
      </button>
      <div className="titlebar-right">{right}</div>
    </header>
  );
}