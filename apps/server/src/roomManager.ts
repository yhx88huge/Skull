import {
  applyAction as engineApply,
  createGame,
  type GameAction,
  type GameActionResult,
  type GameEvent,
  type GameState,
  DEFAULT_SETTINGS,
} from '@skull/core';
import type { RoomSettings } from '@skull/core';

export interface RoomPlayer {
  id: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  createdAt: number;
  stateVersion: number;
  settings: RoomSettings;
  players: RoomPlayer[];
  game: GameState | null;
  /** event ids already applied for idempotency */
  appliedActionIds: Map<string, number>;
  /** reconnect-ish bookkeeping */
  lastActiveAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

let roomSeq = 0;

export function makeRoomCode(existing: Set<string>): string {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (existing.has(code));
  return code;
}

export function createRoom(hostName: string, settings: Partial<RoomSettings> = {}, code?: string): Room {
  const room: Room = {
    id: `room_${Date.now()}_${roomSeq++}`,
    code: code ?? makeRoomCode(new Set()),
    hostId: '',
    createdAt: Date.now(),
    stateVersion: 0,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: [],
    game: null,
    appliedActionIds: new Map(),
    lastActiveAt: Date.now(),
  };
  const host = addPlayer(room, hostName);
  room.hostId = host.id;
  room.stateVersion += 1;
  return room;
}

function addPlayer(room: Room, name: string, playerId?: string): RoomPlayer {
  const seat = room.players.reduce((max, p) => Math.max(max, p.seat), -1) + 1;
  const p: RoomPlayer = {
    id: playerId ?? `p_${Math.random().toString(36).slice(2, 10)}`,
    name,
    seat,
    ready: room.players.length === 0,
    connected: true,
  };
  room.players.push(p);
  if (room.players.length === 1) room.hostId = p.id;
  room.stateVersion += 1;
  return p;
}

export function joinRoom(room: Room, name: string): RoomPlayer {
  if (room.players.length >= room.settings.maxPlayers) throw new Error('ROOM_FULL');
  if (room.game) throw new Error('GAME_IN_PROGRESS');
  return addPlayer(room, name);
}

export function reconnectPlayer(room: Room, playerId: string, name: string): RoomPlayer {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) throw new Error('NOT_IN_ROOM');
  p.connected = true;
  p.name = name;
  room.stateVersion += 1;
  return p;
}

export function leaveRoom(room: Room, playerId: string): boolean {
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return false;
  const [removed] = room.players.splice(idx, 1);
  if (removed.id === room.hostId && room.players.length > 0) {
    // transfer host to the earliest connected player
    const next = room.players.find((p) => p.connected) ?? room.players[0];
    room.hostId = next.id;
  }
  room.stateVersion += 1;
  return true;
}

export function setReady(room: Room, playerId: string, ready: boolean): boolean {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return false;
  p.ready = ready;
  room.stateVersion += 1;
  return true;
}

export function disconnect(room: Room, playerId: string): void {
  const p = room.players.find((x) => x.id === playerId);
  if (p) p.connected = false;
  room.stateVersion += 1;
}

/** Build core player list preserving seats from room. */
function corePlayerList(room: Room) {
  return room.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat }));
}

function syncCorePlayers(room: Room): void {
  if (!room.game) return;
  for (const rp of room.players) {
    const cp = room.game.players.find((x: { id: string }) => x.id === rp.id);
    if (cp) cp.connected = rp.connected;
  }
}

export function startGame(room: Room, hostId: string): GameActionResult | null {
  if (room.hostId !== hostId) return null;
  if (room.game) return null;
  const connected = room.players.filter((p) => p.connected);
  if (connected.length < room.settings.minPlayers) return null;
  if (!connected.every((p) => p.ready)) return null;

  room.game = createGame(room.id, corePlayerList(room), room.settings);
  const res = engineApply(room.game, hostId, { type: 'start' });
  if (!res.ok) {
    room.game = null;
    return res;
  }
  room.game = res.state;
  room.stateVersion += 1;
  return res;
}

export function applyGameAction(
  room: Room,
  playerId: string,
  actionId: string,
  action: GameAction,
): { result: GameActionResult; actionId: string } {
  if (!room.game) {
    return { result: { ok: false, error: 'WRONG_PHASE' }, actionId };
  }
  if (room.appliedActionIds.has(actionId)) {
    return { result: { ok: true, state: room.game, events: [], privateEvents: {} }, actionId };
  }
  const res = engineApply(room.game, playerId, action);
  if (res.ok) {
    room.game = res.state;
    room.appliedActionIds.set(actionId, res.state.stateVersion);
    syncCorePlayers(room);
    room.stateVersion += 1;
  }
  return { result: res, actionId };
}

export function serializeRoom(room: Room): unknown {
  return {
    ...room,
    appliedActionIds: [...room.appliedActionIds.entries()],
  };
}

export function deserializeRoom(raw: any): Room {
  return {
    ...raw,
    players: raw.players ?? [],
    appliedActionIds: new Map(raw.appliedActionIds ?? []),
  };
}

export type { GameEvent, GameState, GameActionResult };