import { Hono } from 'hono';
import { serveStatic } from 'hono/deno';
import packageInfo from "../deno.json" with { type: "json" };

const app = new Hono()
    .get('/', (c) => {
        return c.json({name: "2D Maker Server", version: packageInfo.version});
    })
    .get('/*', serveStatic({ root: './public/'}));

export default app;