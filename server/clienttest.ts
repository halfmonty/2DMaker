import { hc } from "hono/client";
import { Server} from './main.ts';

const MAX_CLIENTS = 1000;
const POLLING_PERCENTAGE = 0.05;
const CLIENT_CREATION_INTERVAL_IN_MS = 10;
const EMIT_INTERVAL_IN_MS = 15;

let clientCount = 0;
let lastReport = new Date().getTime();
let packetsSinceLastReport = 0;

const createClient = () => {
    const client = hc<Server>('http://localhost:8000');
    const ws = client.ws.$ws(0);
    

    ws.addEventListener('open', () => {
        setInterval(()=> {
            ws.send("hello");
        }, EMIT_INTERVAL_IN_MS);

        ws.onmessage = ()=> {
            packetsSinceLastReport++;
        };
    });

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