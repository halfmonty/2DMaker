import { Hono } from 'hono';
import wsServer from './websocketServer.ts';
import webServer from './webServer.ts';

const app = new Hono()
    .route('/ws', wsServer)
    .route('/', webServer);

Deno.serve(
    {
        cert: await Deno.readTextFile("./cert.pem"),
        key: await Deno.readTextFile("./key.pem")
    }, app.fetch);

export type Server = typeof app;