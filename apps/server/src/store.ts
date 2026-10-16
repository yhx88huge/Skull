import fs from 'node:fs';
import path from 'node:path';
import type { Room } from './roomManager';
import { serializeRoom, deserializeRoom } from './roomManager';
import { env } from './env';

export interface Store {
  save(room: Room): Promise<void>;
  load(code: string): Promise<Room | null>;
  loadAll(): Promise<Room[]>;
  remove(code: string): Promise<void>;
}

export class MemoryStore implements Store {
  private map = new Map<string, Room>();
  async save(room: Room) {
    this.map.set(room.code, room);
  }
  async load(code: string) {
    return this.map.get(code) ?? null;
  }
  async loadAll() {
    return [...this.map.values()];
  }
  async remove(code: string) {
    this.map.delete(code);
  }
}

export class FileStore implements Store {
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }
  private file(code: string) {
    return path.join(this.dir, `${code}.json`);
  }
  async save(room: Room) {
    await fs.promises.writeFile(this.file(room.code), JSON.stringify(serializeRoom(room)), 'utf8');
  }
  async load(code: string): Promise<Room | null> {
    try {
      const raw = JSON.parse(await fs.promises.readFile(this.file(code), 'utf8'));
      return deserializeRoom(raw);
    } catch {
      return null;
    }
  }
  async loadAll(): Promise<Room[]> {
    const files = await fs.promises.readdir(this.dir).catch(() => []);
    const out: Room[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await fs.promises.readFile(path.join(this.dir, f), 'utf8'));
        out.push(deserializeRoom(raw));
      } catch {
        /* skip corrupt */
      }
    }
    return out;
  }
  async remove(code: string) {
    await fs.promises.rm(this.file(code), { force: true }).catch(() => {});
  }
}

export class PostgresStore implements Store {
  private pool: any;
  constructor(pool: any) {
    this.pool = pool;
  }
  async save(room: Room) {
    await this.pool.query(
      `INSERT INTO rooms (code, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [room.code, JSON.stringify(serializeRoom(room))],
    );
  }
  async load(code: string): Promise<Room | null> {
    const r = await this.pool.query('SELECT data FROM rooms WHERE code = $1', [code]);
    if (r.rows.length === 0) return null;
    return deserializeRoom(r.rows[0].data);
  }
  async loadAll(): Promise<Room[]> {
    const r = await this.pool.query('SELECT data FROM rooms');
    return r.rows.map((x: any) => deserializeRoom(x.data));
  }
  async remove(code: string) {
    await this.pool.query('DELETE FROM rooms WHERE code = $1', [code]);
  }
}

export async function createStore(): Promise<Store> {
  if (env.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: env.databaseUrl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('[store] using PostgreSQL');
    return new PostgresStore(pool);
  }
  if (process.env.STORE_MODE === 'memory') {
    console.log('[store] using memory');
    return new MemoryStore();
  }
  console.log('[store] using file store at', env.dataDir);
  return new FileStore(env.dataDir);
}