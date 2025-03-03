import { Hono } from 'hono';
//import wsServer from './websocketServer.ts';
//import wsServer from './basicwebsocketServer.ts';
//import wsServer from './claudewebsocketServer.ts';
import wsServer from './claudestarwebsocketServer.ts';
import webServer from './webServer.ts';

const app = new Hono()
    .route('/ws', wsServer)
    .route('/', webServer);

Deno.serve(
    {
        hostname: '0.0.0.0',
        cert: await Deno.readTextFile("./cert.pem"),
        key: await Deno.readTextFile("./key.pem")
    }, app.fetch);

export type Server = typeof app;