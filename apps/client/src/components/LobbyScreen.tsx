import { useState } from 'react';
import type { FormEvent } from 'react';
import TitleBar from './TitleBar';

interface Props {
  nickname: string;
  onNickname: (v: string) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
}

export default function LobbyScreen({ nickname, onNickname, onCreate, onJoin }: Props) {
  const [code, setCode] = useState('');
  const [copyHint, setCopyHint] = useState(false);

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.length >= 6) onJoin(code.toUpperCase());
  };

  return (
    <div className="lobby">
      <TitleBar />
      <main className="lobby-main">
        <div className="hero">
          <p className="hero-kicker">3–6 人 · 暗置 · 诈唬 · 逐张揭示</p>
          <h1 className="hero-title">
            玫瑰之下，
            <em>必有骷髅</em>
          </h1>
          <p className="hero-desc">
            坐下来，把圆片背面朝上扔进牌堆。宣称你能翻开的数字——
            可他们之中，总有一枚是骷髅。
          </p>
        </div>

        <div className="panel lobby-card">
          <div className="field">
            <label htmlFor="nick">你的名号</label>
            <input
              id="nick"
              value={nickname}
              maxLength={12}
              onChange={(e) => onNickname(e.target.value)}
              placeholder="输入昵称"
            />
          </div>

          <button className="btn btn-primary btn-block" onClick={onCreate} disabled={!nickname.trim()}>
            创建房间
          </button>

          <div className="divider">
            <span>或加入已有房间</span>
          </div>

          <form className="join-row" onSubmit={submitJoin}>
            <input
              aria-label="房间码"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6 位房间码"
              maxLength={6}
              className="join-input"
            />
            <button type="submit" className="btn btn-ghost" disabled={code.length < 6}>
              加入
            </button>
          </form>

          {copyHint && <p className="hint">已复制房间码</p>}
          <p className="footnote">
            无需注册 · 游客昵称即可开局 · 断线 60 秒内可重连
          </p>
        </div>
      </main>
      <footer className="lobby-foot">
        <span
          className="foot-link"
          role="button"
          tabIndex={0}
          onClick={() => {
            navigator.clipboard?.writeText('K7M2X9');
            setCopyHint(true);
          }}
          onKeyDown={() => {}}
        >
          试玩演示房间码：K7M2X9
        </span>
      </footer>
    </div>
  );
}