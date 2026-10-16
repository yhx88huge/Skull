import { useState, useEffect, useCallback } from 'react';
import type { Screen } from './types';
import LobbyScreen from './components/LobbyScreen';
import RoomScreen from './components/RoomScreen';
import GameScreen from './components/GameScreen';
import { gameSocket } from './api/socket';
import type { Snapshot, RoomAction, GameEvent, GameEndedPayload, PersistedIdentity } from '@skull/protocol';

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin);

const IDENTITY_KEY = 'skull:identity';

function loadIdentity(): PersistedIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.playerId && d.roomCode) return d as PersistedIdentity;
    return null;
  } catch {
    return null;
  }
}

function saveIdentity(id: PersistedIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [nickname, setNickname] = useState(() => loadIdentity()?.name ?? '旅人');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);
  const [ended, setEnded] = useState<GameEndedPayload | null>(null);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      gameSocket.on('connect', () => {
        setError(null);
        // rejoin the room after (re)connect — covers socket.io auto-reconnect too
        const id = loadIdentity();
        if (id) gameSocket.reconnect(id.roomCode, id.playerId, id.name);
      }),
    );

    unsubs.push(
      gameSocket.on('disconnect', () => {
        setError('连接已断开,正在重连…');
      }),
    );

    unsubs.push(
      gameSocket.on('room:created', (data: unknown) => {
        const d = data as { roomCode: string; playerId: string };
        saveIdentity({ playerId: d.playerId, name: nickname, roomCode: d.roomCode });
        setEnded(null);
        setScreen('room');
      }),
    );

    unsubs.push(
      gameSocket.on('room:joined', (data: unknown) => {
        const d = data as { roomCode: string; playerId: string };
        saveIdentity({ playerId: d.playerId, name: nickname, roomCode: d.roomCode });
        setEnded(null);
        setScreen('room');
      }),
    );

    unsubs.push(
      gameSocket.on('room:state', (data: unknown) => {
        const d = data as Snapshot;
        setSnapshot(d);
        if (d.phase === 'LOBBY') {
          setScreen('room');
        } else {
          setScreen('game');
        }
      }),
    );

    unsubs.push(
      gameSocket.on('room:error', (data: unknown) => {
        const d = data as { code?: string; message: string };
        // stale identity (room gone after a restart) -> stop retrying
        if (d.code === 'NOT_IN_ROOM' || d.code === 'ROOM_NOT_FOUND') clearIdentity();
        setError(d.message);
      }),
    );

    unsubs.push(
      gameSocket.on('game:event', (data: unknown) => {
        setLastEvent(data as GameEvent);
      }),
    );

    unsubs.push(
      gameSocket.on('game:ended', (data: unknown) => {
        // stay on the game screen: the settlement panel is shown there
        setEnded(data as GameEndedPayload);
      }),
    );

    unsubs.push(
      gameSocket.on('kicked', () => {
        clearIdentity();
        setSnapshot(null);
        setEnded(null);
        setScreen('lobby');
      }),
    );

    gameSocket.connect(SERVER_URL);

    return () => {
      unsubs.forEach((u) => u());
      gameSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    gameSocket.createRoom(nickname);
  };

  const handleJoin = (code: string) => {
    gameSocket.joinRoom(code, nickname);
  };

  const handleStart = () => {
    setEnded(null);
    gameSocket.startGame();
  };

  const handleReady = (ready: boolean) => {
    gameSocket.setReady(ready);
  };

  const handleAction = (action: RoomAction) => {
    gameSocket.sendAction(action);
  };

  const handleLeave = useCallback(() => {
    gameSocket.leaveRoom();
    clearIdentity();
    setSnapshot(null);
    setEnded(null);
    setScreen('lobby');
  }, []);

  return (
    <div className="app">
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {screen === 'lobby' && (
        <LobbyScreen
          nickname={nickname}
          onNickname={setNickname}
          onCreate={handleCreate}
          onJoin={handleJoin}
        />
      )}
      {screen === 'room' && snapshot && (
        <RoomScreen
          snapshot={snapshot}
          onStart={handleStart}
          onReady={handleReady}
          onLeave={handleLeave}
        />
      )}
      {screen === 'game' && snapshot && (
        <GameScreen
          snapshot={snapshot}
          lastEvent={lastEvent}
          ended={ended}
          onAction={handleAction}
          onRematch={handleStart}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
}
