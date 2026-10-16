import { io, type Socket } from 'socket.io-client';
import type { RoomAction, Snapshot, GameEvent, ServerError } from '@skull/protocol';
import { C2S, S2C } from '@skull/protocol';

export interface ConnectionState {
  connected: boolean;
  roomCode: string | null;
  playerId: string | null;
  error: string | null;
}

export class GameSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private state: ConnectionState = {
    connected: false,
    roomCode: null,
    playerId: null,
    error: null,
  };

  connect(url: string): void {
    if (this.socket) this.disconnect();
    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.state = { ...this.state, connected: true, error: null };
      this.emit('connect', null);
    });

    this.socket.on('disconnect', () => {
      this.state = { ...this.state, connected: false };
      this.emit('disconnect', null);
    });

    this.socket.on(S2C.roomCreated, (data: { roomCode: string; playerId: string }) => {
      this.state = { ...this.state, roomCode: data.roomCode, playerId: data.playerId };
      this.emit(S2C.roomCreated, data);
    });

    this.socket.on(S2C.roomJoined, (data: { roomCode: string; playerId: string }) => {
      this.state = { ...this.state, roomCode: data.roomCode, playerId: data.playerId };
      this.emit(S2C.roomJoined, data);
    });

    this.socket.on(S2C.roomState, (data: Snapshot) => {
      this.emit(S2C.roomState, data);
    });

    this.socket.on(S2C.roomError, (data: ServerError) => {
      this.state = { ...this.state, error: data.message };
      this.emit(S2C.roomError, data);
    });

    this.socket.on(S2C.gameEvent, (data: GameEvent) => {
      this.emit(S2C.gameEvent, data);
    });

    this.socket.on(S2C.gameEnded, (data: { winnerId: string; reason: string }) => {
      this.emit(S2C.gameEnded, data);
    });

    this.socket.on(S2C.kicked, (data: { reason: string }) => {
      this.emit(S2C.kicked, data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.state = { connected: false, roomCode: null, playerId: null, error: null };
  }

  on(event: string, cb: (data: unknown) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb);
    this.listeners.set(event, set);
    return () => {
      set.delete(cb);
    };
  }

  private emit(event: string, data: unknown): void {
    const set = this.listeners.get(event);
    if (set) set.forEach((cb) => cb(data));
  }

  createRoom(name: string, settings?: Record<string, unknown>): void {
    this.socket?.emit(C2S.roomCreate, { name, settings });
  }

  joinRoom(roomCode: string, name: string): void {
    this.socket?.emit(C2S.roomJoin, { roomCode, name });
  }

  reconnect(roomCode: string, playerId: string, name: string): void {
    this.socket?.emit(C2S.reconnect, { roomCode, playerId, name });
  }

  setReady(ready: boolean): void {
    this.socket?.emit(C2S.roomReady, { ready });
  }

  startGame(): void {
    this.socket?.emit(C2S.roomStart);
  }

  sendAction(action: RoomAction): void {
    this.socket?.emit(C2S.gameAction, { actionId: makeActionId(), action });
  }

  requestSnapshot(): void {
    this.socket?.emit(C2S.snapshotRequest, { fromVersion: 0 });
  }

  getState(): ConnectionState {
    return { ...this.state };
  }
}

function makeActionId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const gameSocket = new GameSocket();