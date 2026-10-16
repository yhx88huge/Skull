export type Screen = 'lobby' | 'room' | 'game';

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
}

export type MatSide = 'blank' | 'flower';

export type RoundStage =
  | 'SETUP'
  | 'PLACEMENT'
  | 'OPEN'
  | 'BIDDING'
  | 'REVEAL'
  | 'SETTLED'
  | 'FINISHED';

export interface GamePlayer {
  id: string;
  name: string;
  mat: MatSide;
  handLeft: number;
  stash: number;
  topRevealed: 'flower' | 'skull' | null;
  passed: boolean;
  alive: boolean;
  isSelf: boolean;
  hue: number;
}

export interface GameState {
  stage: RoundStage;
  round: number;
  currentTurnId: string;
  selfTurn: boolean;
  currentBid: number;
  bossBidderId: string | null;
  totalStashed: number;
  challengerId: string | null;
  revealTarget: number;
  revealProgress: number;
  settle: 'win' | 'lose' | null;
  lastEvent: string;
  players: GamePlayer[];
}