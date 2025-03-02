export enum WebRtcMessageType {
    offer="offer",
    answer="answer",
    ice="ice"
}

export enum MessageType {
    registered="registered",
    error="error",
    host="host",
    join="join",
    peer="peer",
}

export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export type ClientMessage = {
    messageType: 'rtc',
    destinationId: `${string}-${string}-${string}-${string}-${string}`,
    type: WebRtcMessageType,
    payload: any;
}

export type IceServer = RTCIceServer;

type registrationMessage = {
    messageType: MessageType.registered;
    id: `${string}-${string}-${string}-${string}-${string}`;
    iceServers: RTCIceServer[];
}

type peerMessage = {
    messageType: MessageType.peer;
    type: WebRtcMessageType,
    sourceId: `${string}-${string}-${string}-${string}-${string}`;
    payload: any;
}

type errorMessage = {
    messageType: MessageType.error;
    reason: string;
}


export type WsMessage = registrationMessage | peerMessage | errorMessage;

