// 从外网对已部署服务做真实开局验证: 建房 -> 加入 -> 准备 -> 开局 -> 出牌
import { io } from 'socket.io-client';

const URL = process.argv[2] || 'http://120.46.214.10:8080';
const C2S = {
  roomCreate: 'room:create', roomJoin: 'room:join', roomReady: 'room:ready',
  roomStart: 'room:start', gameAction: 'game:action',
};
const S2C = { roomCreated: 'room:created', roomJoined: 'room:joined', snapshot: 'room:state', roomError: 'room:error' };

const once = (s, ev, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout waiting ${ev}`)), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});

function connect() {
  const s = io(URL, { transports: ['websocket', 'polling'], reconnection: false, timeout: 10000 });
  s.on('connect_error', (e) => console.error('  connect_error:', e.message));
  return s;
}

const results = [];
const ok = (label, pass, extra = '') => {
  results.push({ label, pass, extra });
  console.log(`${pass ? '  OK  ' : ' FAIL '} ${label}${extra ? '  ' + extra : ''}`);
};

console.log(`目标: ${URL}\n`);

// ---- 1. 房主建房 ----
const host = connect();
host.on(S2C.roomError, (e) => console.error('  room:error ->', JSON.stringify(e)));
await once(host, 'connect', 10000);
ok('WebSocket 经 nginx 握手成功', true);

host.emit(C2S.roomCreate, { name: 'Host' });
const created = await once(host, S2C.roomCreated);
const roomCode = created.roomCode;
ok('创建房间', !!roomCode, `roomCode=${roomCode}  playerId=${created.playerId}`);

// ---- 2. 两名玩家加入 ----
const guests = [];
for (const name of ['Alice', 'Bob']) {
  const g = connect();
  await once(g, 'connect', 10000);
  g.emit(C2S.roomJoin, { roomCode, name });
  const joined = await once(g, S2C.roomJoined);
  guests.push({ name, sock: g, id: joined.playerId });
  ok(`${name} 加入房间`, joined.roomCode === roomCode, `playerId=${joined.playerId}`);
}

// ---- 3. 全部准备 ----
for (const s of [host, ...guests.map((g) => g.sock)]) s.emit(C2S.roomReady, { ready: true });
await new Promise((r) => setTimeout(r, 600));

// ---- 4. 房主开局 ----
host.emit(C2S.roomStart);
await new Promise((r) => setTimeout(r, 1200));

// ---- 5. 分别拉快照,检查私有信息 ----
const all = [{ name: 'Host', sock: host, id: created.playerId }, ...guests];
for (const p of all) {
  p.sock.emit('snapshot:get');
  const snap = await once(p.sock, S2C.snapshot);
  p.snap = snap;
  const sec = snap.ownSecret;
  ok(`${p.name} 收到快照`, snap.phase !== 'LOBBY', `phase=${snap.phase}  youPlayerId=${snap.youPlayerId}`);
  ok(`${p.name} 身份正确`, snap.youPlayerId === p.id);
  ok(`${p.name} 持有私有手牌`, Array.isArray(sec?.hand) && sec.hand.length === 4,
    `hand=[${(sec?.hand || []).map((d) => d.type).join(',')}]`);
  const others = snap.players.filter((x) => x.id !== p.id);
  const leaked = others.some((x) => JSON.stringify(x).includes('"hand"'));
  ok(`${p.name} 未泄露他人手牌`, !leaked);
}

// ---- 6. 由当前行动者出一张牌(先手不一定是房主) ----
const curId = all[0].snap.round.currentPlayerId;
const actor = all.find((p) => p.id === curId);
ok('存在当前行动者', !!actor, `currentPlayerId=${curId}`);
const discId = actor.snap.ownSecret.hand[0].id;
actor.sock.emit(C2S.gameAction, { actionId: 'e2e-place-1', action: { type: 'place', discId } });
await new Promise((r) => setTimeout(r, 1000));
actor.sock.emit('snapshot:get');
const after = await once(actor.sock, S2C.snapshot);
const before = actor.snap.players.find((x) => x.id === curId)?.unrevealedCount;
const placed = after.players.find((x) => x.id === curId)?.unrevealedCount;
ok('放置圆片生效', placed === before + 1, `${actor.name} 牌堆 ${before} -> ${placed}`);
ok('轮转到下一位', after.round.currentPlayerId !== curId,
  `${curId} -> ${after.round.currentPlayerId}`);

for (const p of all) p.sock.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n总计 ${results.length} 项, 通过 ${results.length - failed.length}, 失败 ${failed.length}`);
process.exit(failed.length ? 1 : 0);
