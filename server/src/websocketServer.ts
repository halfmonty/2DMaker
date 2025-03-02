import { Hono } from "hono";
import { upgradeWebSocket } from 'hono/deno';
import { IceServer, WsMessage, MessageType, ClientMessage, WebRtcMessageType, UUID } from '../../shared/shared.ts';
import { WSContext, WSMessageReceive } from "hono/ws";

const iceServers:IceServer[] =
    [{ urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.l.google.com:5349" },
    { urls: "stun:stun1.l.google.com:3478" },
    { urls: "stun:stun1.l.google.com:5349" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:5349" },
    { urls: "stun:stun3.l.google.com:3478" },
    { urls: "stun:stun3.l.google.com:5349" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:5349" }];

const PING_INTERVAL = 25_000;
const PING_TIMEOUT = 20_000;
let activeConnections = new Set<WebSocket>();
let registeredConnections: Map<string, WebSocket> = new Map<string, WebSocket>();

const app = new Hono()
    .get(
    '/',
    upgradeWebSocket((_c)=> {
        let heartbeat:number;
        let pongTimeout:number;
        let pongReceived=false;
        const clientID:UUID=crypto.randomUUID();
        return {
            onOpen: (_event, ws) => {
                ws.raw  && activeConnections.add(ws.raw)
                        && registeredConnections.set(clientID, ws.raw);
                heartbeat = setInterval(()=>{
                    ws.send("ping");
                    pongReceived = false;
                    pongTimeout = setTimeout(()=>{
                        if(!pongReceived) {
                            console.debug("No pong received in time. Removing client from active connections.");
                            ws.raw && activeConnections.delete(ws.raw);
                            ws.close(4000, "No pong received within 20 seconds");
                        }
                    }, PING_TIMEOUT);
                }, PING_INTERVAL);
                sendJson(ws, {
                    messageType: MessageType.registered,
                    id: clientID,
                    iceServers: iceServers
                });
            },
            onMessage(event, ws) {
                switch(event.data) {
                    case "pong": {
                        console.debug("Pong recieved from client.");
                        pongReceived = true;
                        ws.raw && activeConnections.add(ws.raw);
                        clearTimeout(PING_TIMEOUT);
                        break;
                    }
                    default: {
                        //console.log("message recieved");
                        console.log(event.data);
                        if(activeConnections.size<2){
                            ws.send("no");
                            return;
                        }
                        activeConnections.forEach(peer => {
                            if (ws.raw && peer != ws.raw) {
                                console.log(`sending`)
                                peer.send(event.data);
                            }
                        });
                        // const clientMessage = parseClientMessage(event.data);
                        // if(clientMessage){
                        //     processClientMessage(ws, clientID, clientMessage);
                        // }else {
                        //     sendError(ws, "Failed to parse message");
                        // }
                    }
                }
            },
            onClose: (_event, ws) => {
                clearInterval(heartbeat);
                clearTimeout(pongTimeout);
                console.log('Connection closed');
                ws.raw  && activeConnections.delete(ws.raw)
                        && registeredConnections.delete(clientID);
            }
        }
    })
);

function parseClientMessage(data: WSMessageReceive): ClientMessage | undefined {
    if (typeof data !== 'string')
        return;
    try {
        const msgData:ClientMessage = JSON.parse(data);
        if(msgData.type)
            return msgData;
    } catch(_err) {
        return;
    }
};

function processClientMessage(ws: WSContext<WebSocket>, clientId: UUID, msg: ClientMessage) {
    if (registeredConnections.has(msg.destinationId)) {
        sendJson(ws, {
            messageType: MessageType.peer,
            sourceId: clientId,
            payload: msg.payload,
            type: msg.type
        });
    } else {
        sendError(ws, `No peer found with Id: ${msg.destinationId}.`);
    }
}

function sendJson(ws: WSContext<WebSocket>, message: WsMessage) {
    ws.send(JSON.stringify(message));
}

function sendError(ws: WSContext<WebSocket>, reason: string) {
    ws.send( JSON.stringify({
        messageType: MessageType.error,
        reason: reason
    } as WsMessage));
}

export default app;