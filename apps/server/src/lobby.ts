import type { GameAction, GameActionResult } from '@skull/core';
import type { RoomSettings } from '@skull/core';
import {
  applyGameAction,
  createRoom,
  deserializeRoom,
  disconnect,
  joinRoom,
  leaveRoom,
  makeRoomCode,
  reconnectPlayer,
  setReady,
  startGame,
  type Room,
} from './roomManager';
import type { Store } from './store';
import { buildSnapshot } from './snapshot';

export interface ActionOutcome {
  ok: boolean;
  error?: string;
  events: GameActionEvent[];
}

export interface GameActionEvent {
  id: string;
  stateVersion: number;
  actorId: string;
  type: string;
  payload: Record<string, unknown>;
}

export class Lobby {
  private rooms = new Map<string, Room>();
  private codes = new Set<string>();
  private onChange: (room: Room) => void;

  constructor(store: Store, onChange: (room: Room) => void = () => {}) {
    this.store = store;
    this.onChange = onChange;
  }

  setOnChange(fn: (room: Room) => void): void {
    this.onChange = fn;
  }

  private store: Store;

  async init(): Promise<void> {
    const all = await this.store.loadAll();
    for (const r of all) {
      this.rooms.set(r.code, r);
      this.codes.add(r.code);
    }
    console.log(`[lobby] restored ${all.length} room(s)`);
  }

  async create(name: string, settings: Partial<RoomSettings> = {}): Promise<Room> {
    const room = createRoom(name, settings);
    this.rooms.set(room.code, room);
    this.codes.add(room.code);
    await this.store.save(room);
    this.onChange(room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  async join(code: string, name: string): Promise<Room> {
    const room = this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    joinRoom(room, name);
    await this.store.save(room);
    this.onChange(room);
    return room;
  }

  async reconnect(code: string, playerId: string, name: string): Promise<Room> {
    const room = this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    reconnectPlayer(room, playerId, name);
    await this.store.save(room);
    this.onChange(room);
    return room;
  }

  async leave(code: string, playerId: string): Promise<Room> {
    const room = this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    leaveRoom(room, playerId);
    await this.store.save(room);
    this.onChange(room);
    return room;
  }

  async ready(code: string, playerId: string, ready: boolean): Promise<Room> {
    const room = this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    setReady(room, playerId, ready);
    await this.store.save(room);
    this.onChange(room);
    return room;
  }

  async start(code: string, hostId: string): Promise<Room> {
    const room = this.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const res = startGame(room, hostId);
    if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : 'NOT_READY');
    await this.store.save(room);
    this.onChange(room);
    return room;
  }

  /** Apply a game action; returns emitted wire events on success. */
  async action(code: string, playerId: string, actionId: string, action: GameAction): Promise<ActionOutcome> {
    const room = this.get(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND', events: [] };
    const { result } = applyGameAction(room, playerId, actionId, action);
    if (!result.ok) {
      return { ok: false, error: result.error, events: [] };
    }
    await this.store.save(room);
    this.onChange(room);
    const events: GameActionEvent[] = result.events.map((e: { id: string; stateVersion: number; actorId: string; type: string; payload: Record<string, unknown> }) => ({
      id: e.id,
      stateVersion: e.stateVersion,
      actorId: e.actorId,
      type: e.type,
      payload: e.payload,
    }));
    return { ok: true, events };
  }

  snapshot(code: string, playerId: string) {
    const room = this.get(code);
    if (!room) return null;
    return buildSnapshot(room, playerId);
  }

  markDisconnected(code: string, playerId: string): void {
    const room = this.get(code);
    if (!room) return;
    disconnect(room, playerId);
    void this.store.save(room);
    this.onChange(room);
  }

  /** For tests/tools. */
  createTestRoom(players: { id: string; name: string }[], code?: string): Room {
    const host = players[0];
    if (!host) throw new Error('NO_PLAYERS');
    const room = createRoom(host.name, {}, code ?? makeRoomCode(this.codes));
    room.hostId = host.id;
    room.players[0].id = host.id;
    for (const p of players.slice(1)) {
      const rp = joinRoom(room, p.name);
      rp.id = p.id;
      rp.ready = true;
    }
    this.rooms.set(room.code, room);
    this.codes.add(room.code);
    return room;
  }

  importRoom(raw: unknown): Room {
    const room = deserializeRoom(raw);
    this.rooms.set(room.code, room);
    this.codes.add(room.code);
    return room;
  }
}