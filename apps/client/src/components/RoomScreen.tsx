import { useState } from 'react';
import TitleBar from './TitleBar';
import { ROOM_CODE } from '../mock';
import type { RoomPlayer } from '../types';

interface Props {
  nickname: string;
  onStart: () => void;
}

export default function RoomScreen({ nickname, onStart }: Props) {
  const [seatMap, setSeatMap] = useState<RoomPlayer[]>([
    { id: 'p0', name: nickname, connected: true, ready: true },
    { id: 'p1', name: '渡鸦', connected: true, ready: true },
    { id: 'p3', name: '白玫瑰', connected: true, ready: true },
    { id: 'p4', name: '呱太', connected: false, ready: false },
    { id: 'p5', name: '铁匠', connected: true, ready: true },
  ] as RoomPlayer[] & number[]);

  const online = seatMap.filter((p) => p.connected).length;
  const canStart = online >= 3 && seatMap.filter((p) => p.connected && p.ready).length === online;
  const emptySeats = 6 - seatMap.length;

  const toggleReady = (id: string) =>
    setSeatMap((m) => m.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p)));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ROOM_CODE);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="room">
      <TitleBar
        right={
          <button className="btn btn-ghost btn-sm" onClick={copy}>
            {ROOM_CODE} 复制
          </button>
        }
      />
      <main className="room-main">
        <div className="room-head">
          <h2>等待集会成员</h2>
          <p>
            <span className="pill">{online}/6 在线</span>
            <span className="pill">至少 3 人开始</span>
          </p>
        </div>

        <div className="seat-grid">
          {seatMap.map((p) => (
            <button
              key={p.id}
              className={`seat-card ${p.connected ? '' : 'seat-offline'}`}
              onClick={() => p.connected && p.id !== 'p0' && toggleReady(p.id)}
            >
              <span className={`avatar hue-${(Number(p.id.slice(1)) % 6) + 1}`}>
                {p.name.slice(0, 1)}
              </span>
              <span className="seat-name">{p.name}</span>
              {p.id === 'p0' && <span className="tag tag-host">房主</span>}
              <span className={`tag ${p.connected ? 'tag-on' : 'tag-off'}`}>
                {p.connected ? (p.ready ? '已准备' : '未准备') : '已断开'}
              </span>
            </button>
          ))}
          {Array.from({ length: Math.max(emptySeats, 0) }).map((_, i) => (
            <div key={`e${i}`} className="seat-card seat-empty">
              <span className="seat-plus">+</span>
              <span className="seat-name">空位</span>
              <span className="tag tag-off">等待加入</span>
            </div>
          ))}
        </div>

        <div className="room-cta">
          <p className="rules-teaser">
            规则一句话：每人 4 枚圆片（3 花 1 骷髅）· 报一个数 · 翻开达到即赢
          </p>
          <button className="btn btn-primary btn-lg" disabled={!canStart} onClick={onStart}>
            开始游戏
          </button>
        </div>
      </main>
    </div>
  );
}