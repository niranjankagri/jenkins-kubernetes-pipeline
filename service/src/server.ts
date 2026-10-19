// room-booking: a small JSON API, the system the pipeline builds, deploys to Kubernetes and tests.
// Node built-ins only, run directly as TypeScript (Node 24): node src/server.ts
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { BookingError, createStore } from './bookings.ts';
import type { Store } from './bookings.ts';

/** What /version reports: the pipeline sets these, and the tests check the right build is deployed. */
export interface VersionInfo {
  version: string;
  commit: string;
}

/**
 * Creates the HTTP server (not yet listening). A BookingError becomes JSON with its status and field;
 * anything unexpected is logged and answered with a 500.
 */
export function createServer(store: Store = createStore(), info: VersionInfo = { version: 'dev', commit: 'local' }): Server {
  return createHttpServer((req, res) => {
    handle(req, res, store, info).catch((error: unknown) => {
      if (error instanceof BookingError) {
        send(res, error.status, { error: error.message, ...(error.field && { field: error.field }) });
      } else {
        console.error(error);
        send(res, 500, { error: 'Internal server error' });
      }
    });
  });
}

/**
 * All routes: health, version, rooms, list and create bookings, and cancel one by id; anything else is a 404.
 */
async function handle(req: IncomingMessage, res: ServerResponse, store: Store, info: VersionInfo): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /health') return send(res, 200, { status: 'ok' });
  if (route === 'GET /version') return send(res, 200, info);
  if (route === 'GET /rooms') return send(res, 200, { rooms: store.rooms() });
  if (route === 'GET /bookings') {
    const roomId = url.searchParams.get('roomId') ?? undefined;
    const date = url.searchParams.get('date') ?? undefined;
    return send(res, 200, { bookings: store.list(roomId, date) });
  }
  if (route === 'POST /bookings') return send(res, 201, store.create(await readJson(req)));

  const id = /^\/bookings\/([^/]+)$/.exec(url.pathname)?.[1];
  if (id && req.method === 'DELETE') {
    if (!store.cancel(id)) throw new BookingError(404, 'Booking not found');
    res.writeHead(204).end();
    return;
  }
  throw new BookingError(404, `No route for ${route}`);
}

/** Reads the whole request body as JSON; invalid JSON is a 400. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BookingError(400, 'Body must be valid JSON');
  }
}

/** Writes a JSON response. */
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

// Started as a program: port and version from the environment (the Kubernetes Deployment sets them).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const server = createServer(createStore(), {
    version: process.env.APP_VERSION ?? 'dev',
    commit: process.env.APP_COMMIT ?? 'local',
  });
  server.listen(port, () => console.log(`room-booking listening on port ${port}`));
  // Kubernetes sends SIGTERM before stopping a pod: finish open requests, then exit.
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
