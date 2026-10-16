import { useState } from 'react';
import type { Screen } from './types';
import LobbyScreen from './components/LobbyScreen';
import RoomScreen from './components/RoomScreen';
import GameScreen from './components/GameScreen';

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [nickname, setNickname] = useState('旅人');

  return (
    <div className="app">
      {screen === 'lobby' && (
        <LobbyScreen
          nickname={nickname}
          onNickname={setNickname}
          onCreate={() => setScreen('room')}
          onJoin={() => setScreen('room')}
        />
      )}
      {screen === 'room' && (
        <RoomScreen nickname={nickname} onStart={() => setScreen('game')} />
      )}
      {screen === 'game' && <GameScreen nickname={nickname} />}
    </div>
  );
}