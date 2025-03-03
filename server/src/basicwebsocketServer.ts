import { Hono } from "hono";
import { upgradeWebSocket } from 'hono/deno';

const clients: Set<WebSocket> = new Set();

const app = new Hono()
    .get(
        '/',
        upgradeWebSocket((_c) => {
            return {
                onOpen: (event, ws) => {
                    ws.raw && clients.add(ws.raw);
                },
                onMessage: (event, ws) => {
                    console.log(event.data);
                    clients.forEach((client) => {
                        if (client !== ws.raw && client.readyState === WebSocket.OPEN) {
                            client.send(event.data)
                        }
                    })
                },
                onClose: (event, ws) => {
                    ws.raw && clients.delete(ws.raw);
                }
            }
        })
    );

export default app;