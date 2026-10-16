export type DiscType = 'flower' | 'skull';
export type MatSide = 'blank' | 'flower';
export type DiscLocation = 'hand' | 'stack' | 'box' | 'supply';
export type Rng = () => number;

export type Phase =
  | 'LOBBY'
  | 'ROUND_SETUP'
  | 'INITIAL_PLACEMENT'
  | 'ACTION'
  | 'BIDDING'
  | 'REVEAL'
  | 'PENALTY'
  | 'ROUND_CLEANUP'
  | 'FINISHED';

export interface Disc {
  id: string;
  ownerId: string;
  type: DiscType;
  location: DiscLocation;
  roundId: number;
  pileId: string | null;
  order: number;
  revealed: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  ready: boolean;
  alive: boolean;
  mat: MatSide;
  lastChanceGranted: boolean;
  lastChanceActive: boolean;
  hand: string[];
}

export interface RoomSettings {
  minPlayers: number;
  maxPlayers: number;
  turnTimerSeconds: number;
  rulesetVersion: string;
}

export interface RoundProof {
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

export interface PenaltyContext {
  challengerId: string;
  /** Who must pick the disc to remove: the challenger (own skull) or the skull owner (blind pick). */
  pendingPlayerId: string;
  skullOwnerId: string | null;
  /** Shuffled disc ids the pending player may pick from (challenger's hand + pile). */
  candidates: string[];
}

export interface GameState {
  roomId: string;
  stateVersion: number;
  phase: Phase;
  settings: RoomSettings;
  players: Player[];
  nextDiscId: number;
  discs: Record<string, Disc>;
  round: RoundProof;
  piles: Record<string, string[]>;
  lastChanceDiscId: string | null;
  lastChanceLastRound: number;
  /** ownerId -> their personal supply (last-chance) disc id, fixed at game creation. */
  supplyDiscIds: Record<string, string>;
  winnerId: string | null;
  penalty: PenaltyContext | null;
  eventIdCounter: number;
}

export type GameActionResult =
  | { ok: true; state: GameState; events: GameEvent[]; privateEvents: Record<string, GameEvent[]> }
  | { ok: false; error: ActionError };

export type ActionError =
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'NO_DISC_TO_PLACE'
  | 'PLACE_ALREADY_DONE'
  | 'BID_OUT_OF_RANGE'
  | 'BID_NOT_INCREASING'
  | 'CANNOT_BID_AFTER_OPEN'
  | 'ALREADY_PASSED'
  | 'NOT_CHALLENGER'
  | 'MUST_REVEAL_SELF_FIRST'
  | 'INVALID_TARGET'
  | 'NOT_PENALTY_PLAYER'
  | 'INVALID_DISC'
  | 'PLAYER_NOT_ALIVE'
  | 'NOT_HOST'
  | 'NOT_READY'
  | 'GAME_FINISHED'
  | 'NOT_IN_ROOM'
  | 'INSUFFICIENT_PLAYERS';

export type EventType =
  | 'ROUND_STARTED'
  | 'DISC_PLACED'
  | 'BID_OPENED'
  | 'BID_RAISED'
  | 'PLAYER_PASSED'
  | 'DISC_REVEALED'
  | 'CHALLENGE_SUCCEEDED'
  | 'CHALLENGE_FAILED'
  | 'DISC_REMOVED'
  | 'PLAYER_ELIMINATED'
  | 'LAST_CHANCE_GRANTED'
  | 'CHALLENGE_STARTED'
  | 'ROUND_ENDED'
  | 'GAME_ENDED'
  | 'TURN_ADVANCED'
  | 'PHASE_CHANGED';

export interface GameEvent {
  id: string;
  stateVersion: number;
  actorId: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export type GameAction =
  | { type: 'start' }
  | { type: 'place'; discId?: string }
  | { type: 'open_bid'; amount: number }
  | { type: 'raise_bid'; amount: number }
  | { type: 'pass' }
  | { type: 'reveal'; targetPlayerId: string }
  | { type: 'choose_penalty_disc'; discId: string };

export const RULESET_VERSION = '2023';
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 3;
export const DISCS_PER_PLAYER = 4;

export const DEFAULT_SETTINGS: RoomSettings = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  turnTimerSeconds: 0,
  rulesetVersion: RULESET_VERSION,
};