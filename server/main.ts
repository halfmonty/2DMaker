import { Hono } from 'hono';
import { serveStatic } from 'hono/deno';
import wsServer from './websocketServer.ts';

const app = new Hono()
    .get('/*', serveStatic({ root: './public/'}))
    .route('/ws', wsServer);

Deno.serve(app.fetch)

export type Server = typeof app;