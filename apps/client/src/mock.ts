import type { GamePlayer, GameState } from './types';

export const ROOM_CODE = 'K7M2X9';

export const SEAT_NAMES = ['你', '渡鸦', '老鬼', '白玫瑰', '呱太', '铁匠'];

export function freshGame(): GameState {
  const players: GamePlayer[] = SEAT_NAMES.map((n, i) => ({
    id: `p${i}`,
    name: n,
    mat: 'blank',
    handLeft: i === 0 ? 4 : [3, 4, 4, 3, 4][i],
    stash: 0,
    topRevealed: null,
    passed: false,
    alive: true,
    isSelf: i === 0,
    hue: [28, 200, 320, 160, 45, 220][i],
  }));
  return {
    stage: 'ROUND_SETUP',
    round: 1,
    currentTurnId: 'p0',
    selfTurn: true,
    currentBid: 0,
    bossBidderId: null,
    totalStashed: 0,
    challengerId: null,
    revealTarget: 0,
    revealProgress: 0,
    settle: null,
    lastEvent: '房间已就绪 · 第一轮开始',
    players,
  };
}