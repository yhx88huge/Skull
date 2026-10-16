import http from 'node:http';
import { Server } from 'socket.io';
import { attachGateway } from './gateway';
import { Lobby } from './lobby';
import { createStore } from './store';
import { env } from './env';

async function main() {
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, methods: ['GET', 'POST'] },
  });

  const store = await createStore();
  const lobby = new Lobby(store, () => {
    /* broadcasts are driven by the gateway */
  });
  // bridge: gateway drives per-socket emits through emitRoomState bound to io
  await lobby.init();

  attachGateway(io, lobby);

  httpServer.listen(env.port, () => {
    console.log(`[server] listening on :${env.port}`);
  });

  process.on('SIGINT', () => process.exit(0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});