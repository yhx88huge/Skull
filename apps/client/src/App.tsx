import { useState, useEffect } from 'react';
import type { Screen } from './types';
import LobbyScreen from './components/LobbyScreen';
import RoomScreen from './components/RoomScreen';
import GameScreen from './components/GameScreen';
import { gameSocket } from './api/socket';
import type { Snapshot, RoomAction } from '@skull/protocol';

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:3000';

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [nickname, setNickname] = useState('旅人');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      gameSocket.on('connect', () => {
        setError(null);
      }),
    );

    unsubs.push(
      gameSocket.on('disconnect', () => {
        setError('连接已断开,正在重连…');
      }),
    );

    unsubs.push(
      gameSocket.on('room:created', () => {
        setScreen('room');
      }),
    );

    unsubs.push(
      gameSocket.on('room:joined', () => {
        setScreen('room');
      }),
    );

    unsubs.push(
      gameSocket.on('room:state', (data: unknown) => {
        const d = data as Snapshot;
        setSnapshot(d);
        if (d.phase === 'FINISHED' && !d.gameStarted) {
          setScreen('lobby');
        } else if (d.phase !== 'LOBBY') {
          setScreen('game');
        }
      }),
    );

    unsubs.push(
      gameSocket.on('room:error', (data: unknown) => {
        const d = data as { message: string };
        setError(d.message);
      }),
    );

    unsubs.push(
      gameSocket.on('game:ended', () => {
        setScreen('lobby');
      }),
    );

    gameSocket.connect(SERVER_URL);

    return () => {
      unsubs.forEach((u) => u());
      gameSocket.disconnect();
    };
  }, []);

  const handleCreate = () => {
    gameSocket.createRoom(nickname);
  };

  const handleJoin = (code: string) => {
    gameSocket.joinRoom(code, nickname);
  };

  const handleStart = () => {
    gameSocket.startGame();
  };

  const handleReady = (ready: boolean) => {
    gameSocket.setReady(ready);
  };

  const handleAction = (action: RoomAction) => {
    gameSocket.sendAction(action);
  };

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
          nickname={nickname}
          onStart={handleStart}
          onReady={handleReady}
          onLeave={() => {
            gameSocket.disconnect();
            setScreen('lobby');
          }}
        />
      )}
      {screen === 'game' && snapshot && (
        <GameScreen
          snapshot={snapshot}
          nickname={nickname}
          onAction={handleAction}
          onLeave={() => {
            gameSocket.disconnect();
            setScreen('lobby');
          }}
        />
      )}
    </div>
  );
}