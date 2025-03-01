import { Hono } from "hono";
import { upgradeWebSocket } from 'hono/deno';

var connectedClients = new Set<WebSocket>();

const app = new Hono()
    .get(
    '/',
    upgradeWebSocket((c)=> {
        return {
        onOpen: (event, ws) => {
            connectedClients.add(ws.raw!);
        },
        onMessage(event, ws) {
            //console.log(`Message from client: ${event.data}`);
            ws.send(event.data.toString());
            for (const client of connectedClients.values().filter((client)=>{client!=ws.raw})) {
            client.send(event.data);
            }
        },
        onClose: (event, ws) => {
            console.log('Connection closed');
            connectedClients.delete(ws.raw!);
        }
        }
    })
);

export default app;