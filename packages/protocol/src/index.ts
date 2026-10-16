import type { DiscType, GameEvent, MatSide, Phase, RoomSettings } from '@skull/core';

/* ------------------------------------------------------------------ */
/* Wire event names (client <-> server)                                */
/* ------------------------------------------------------------------ */

export const C2S = {
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomReady: 'room:ready',
  roomStart: 'room:start',
  gameAction: 'game:action',
  snapshotRequest: 'snapshot:get',
  reconnect: 'reconnect',
} as const;

export type C2SEvent = (typeof C2S)[keyof typeof C2S];

export const S2C = {
  roomCreated: 'room:created',
  roomJoined: 'room:joined',
  roomState: 'room:state',
  roomError: 'room:error',
  snapshot: 'snapshot',
  gameEvent: 'game:event',
  gameEnded: 'game:ended',
  kicked: 'kicked',
} as const;

export type S2CEvent = (typeof S2C)[keyof typeof S2C];

/* ------------------------------------------------------------------ */
/* Client -> Server command payloads                                   */
/* ------------------------------------------------------------------ */

export interface RoomCreatePayload {
  name: string;
  settings?: Partial<Omit<RoomSettings, 'rulesetVersion'>>;
}

export interface RoomJoinPayload {
  roomCode: string;
  name: string;
}

export interface RoomReadyPayload {
  ready: boolean;
}

export interface PersistedIdentity {
  playerId: string;
  name: string;
  roomCode: string;
}

export type RoomAction =
  | { type: 'place'; discId?: string }
  | { type: 'open_bid'; amount: number }
  | { type: 'raise_bid'; amount: number }
  | { type: 'pass' }
  | { type: 'reveal'; targetPlayerId: string }
  | { type: 'choose_penalty_disc'; discId: string };

export interface GameActionPayload {
  actionId: string;
  action: RoomAction;
}

export interface SnapshotRequestPayload {
  fromVersion: number;
}

/* ------------------------------------------------------------------ */
/* Server -> Client snapshot/DTO types                                 */
/* ------------------------------------------------------------------ */

export interface PlayerPublic {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  ready: boolean;
  alive: boolean;
  mat: MatSide;
  lastChanceGranted: boolean;
  lastChanceActive: boolean;
  handCount: number;
  pileCount: number;
  /** the type of the top revealed disc on this pile, if any */
  topRevealed: DiscType | null;
  /** how many discs on this pile are still unrevealed (drives reveal targeting) */
  unrevealedCount: number;
  passed: boolean;
  isChallenger: boolean;
  isFirst: boolean;
  isCurrentTurn: boolean;
}

export interface SecretDisc {
  id: string;
  type: DiscType;
}

/** Only sent to the owning player. */
export interface PlayerSecret {
  handTypes: DiscType[];
  /** own hand discs with ids, so the UI can let the player pick which one to place */
  hand: SecretDisc[];
  /** own pile discs with ids/types (the owner placed them, so they are known) */
  pile: SecretDisc[];
  hasLastChanceDisc: boolean;
  lastChanceDiscInHand: boolean;
}

/** Public penalty state; candidate disc ids are only filled for the pending picker. */
export interface PenaltyView {
  challengerId: string;
  pendingPlayerId: string;
  skullOwnerId: string | null;
  /** disc ids the pending player may pick; empty array for everyone else (blind) */
  candidates: string[];
}

export interface RoundView {
  roundNumber: number;
  firstPlayerId: string | null;
  currentPlayerId: string | null;
  openerId: string | null;
  bidderId: string | null;
  currentBid: number;
  challengerId: string | null;
  passedPlayerIds: string[];
  revealProgress: number;
}

export interface BoardView {
  phase: Phase;
  totalStashed: number;
  revealTarget: number;
  revealProgress: number;
  winnerId: string | null;
  lastChanceHolderId: string | null;
}

export interface RoomView {
  roomId: string;
  roomCode: string;
  hostId: string;
  stateVersion: number;
  gameStarted: boolean;
  phase: Phase;
  settings: RoomSettings;
  board: BoardView;
  round: RoundView;
  players: PlayerPublic[];
  createdAt: number;
}

/** Full snapshot delivered to one client (includes their private info when game running). */
export interface Snapshot extends RoomView {
  /** the viewer's own player id — clients must key identity off this, not the nickname */
  youPlayerId: string;
  ownSecret: PlayerSecret | null;
  penalty: PenaltyView | null;
}

export interface ServerError {
  code: string;
  message: string;
}

export interface GameEndedPayload {
  winnerId: string;
  /** 'double_flower' | 'last_standing' | 'finished' */
  reason: string;
  players: PlayerPublic[];
  /** game wall-clock duration in ms, when known */
  durationMs: number | null;
  /** rounds played */
  rounds: number;
}

export type { GameEvent, DiscType };