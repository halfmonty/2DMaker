import { hc } from "hono/client";
import { Server} from '../src/main.ts';

const MAX_CLIENTS = 100;
const POLLING_PERCENTAGE = 0.05;
const CLIENT_CREATION_INTERVAL_IN_MS = 10;
const EMIT_INTERVAL_IN_MS = 15;

let clientCount = 0;
let lastReport = new Date().getTime();
let packetsSinceLastReport = 0;

function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

const createClient = () => {
    const client = hc<Server>('http://localhost:8000');
    const ws = client.ws.$ws(0);

    ws.onopen = () => {
        //console.log("Connected to the server");
    };

    ws.onclose = (event) => {
        clientCount-=1;
        console.log("Socket closed: ["+ event.code + "] " + event.reason);
    };

    ws.onerror = (event) => {
        console.error("Error:");
        console.error(event);
    };

    ws.onmessage = (event)=> {
        switch (event.data) {
            case "ping": {
                console.log("Ping from server. Sending pong.");
                if(getRandomInt(1,10) > 2) {
                    ws.send("pong");
                }
                break;
            }
            default: {
                console.log("Message from server:", event.data);
                break;
            }
        };
        packetsSinceLastReport++;
    };

    if (++clientCount < MAX_CLIENTS) {
        setTimeout(createClient, CLIENT_CREATION_INTERVAL_IN_MS);
    }
};

createClient();

const printReport = () => {
    const now = new Date().getTime();
    const durationSinceLastReport = (now - lastReport) / 1000;
    const packetsPerSeconds = (
      packetsSinceLastReport / durationSinceLastReport
    ).toFixed(2);
  
    console.log(
      `client count: ${clientCount} ; average packets received per second: ${packetsPerSeconds}`
    );
  
    packetsSinceLastReport = 0;
    lastReport = now;
};

setInterval(printReport, 1000);