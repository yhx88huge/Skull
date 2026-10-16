import TitleBar from './TitleBar';
import type { Snapshot } from '@skull/protocol';

interface Props {
  snapshot: Snapshot;
  nickname: string;
  onStart: () => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

export default function RoomScreen({ snapshot, nickname, onStart, onReady, onLeave }: Props) {
  const players = snapshot.players;
  const online = players.filter((p) => p.connected).length;
  const canStart = online >= 3 && players.filter((p) => p.connected && p.ready).length === online;
  const emptySeats = snapshot.settings.maxPlayers - players.length;
  const isHost = players[0]?.id === snapshot.hostId;
  const isSelf = (id: string) => players.find((p) => p.id === id)?.name === nickname;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.roomCode);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="room">
      <TitleBar
        right={
          <button className="btn btn-ghost btn-sm" onClick={copy}>
            {snapshot.roomCode} 复制
          </button>
        }
      />
      <main className="room-main">
        <div className="room-head">
          <h2>等待集会成员</h2>
          <p>
            <span className="pill">{online}/{snapshot.settings.maxPlayers} 在线</span>
            <span className="pill">至少 {snapshot.settings.minPlayers} 人开始</span>
          </p>
        </div>

        <div className="seat-grid">
          {players.map((p) => {
            const self = isSelf(p.id);
            return (
              <button
                key={p.id}
                className={`seat-card ${p.connected ? '' : 'seat-offline'}`}
                onClick={() => {
                  if (!p.connected || self) return;
                  onReady(!p.ready);
                }}
              >
                <span className={`avatar hue-${(Number(p.id.slice(1)) % 6) + 1}`}>
                  {p.name.slice(0, 1)}
                </span>
                <span className="seat-name">{p.name}</span>
                {p.id === snapshot.hostId && <span className="tag tag-host">房主</span>}
                <span className={`tag ${p.connected ? 'tag-on' : 'tag-off'}`}>
                  {p.connected ? (p.ready ? '已准备' : '未准备') : '已断开'}
                </span>
              </button>
            );
          })}
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
          <div style={{ display: 'flex', gap: '12px' }}>
            {isHost && (
              <button className="btn btn-primary btn-lg" disabled={!canStart} onClick={onStart}>
                开始游戏
              </button>
            )}
            <button className="btn btn-ghost btn-lg" onClick={onLeave}>
              离开房间
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}