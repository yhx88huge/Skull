import type { Phase } from '@skull/core';

export type Screen = 'lobby' | 'room' | 'game';

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
}

export type MatSide = 'blank' | 'flower';

export interface GamePlayer {
  id: string;
  name: string;
  mat: MatSide;
  handLeft: number;
  stash: number;
  unrevealedCount: number;
  topRevealed: 'flower' | 'skull' | null;
  passed: boolean;
  alive: boolean;
  isSelf: boolean;
  hue: number;
}

/** Stable 1..6 hue bucket from a player id (works for `p_xxxx` style ids). */
export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

export interface GameState {
  stage: Phase;
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