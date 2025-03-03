import { Hono } from "hono";
import { upgradeWebSocket } from 'hono/deno';

// Define types for our users and messages
interface User {
    userId: string;
    username: string;
    conn: WebSocket;
}

interface BaseMessage {
    type: string;
    userId: string;
}

interface JoinMessage extends BaseMessage {
    type: 'join';
    username: string;
}

interface LeaveMessage extends BaseMessage {
    type: 'leave';
}

interface OfferMessage extends BaseMessage {
    type: 'offer';
    targetUserId: string;
    sdp: RTCSessionDescription;
    username: string;
}

interface AnswerMessage extends BaseMessage {
    type: 'answer';
    targetUserId: string;
    sdp: RTCSessionDescription;
}

interface IceCandidateMessage extends BaseMessage {
    type: 'ice_candidate';
    targetUserId: string;
    candidate: RTCIceCandidate;
}

type SignalingMessage =
    | JoinMessage
    | LeaveMessage
    | OfferMessage
    | AnswerMessage
    | IceCandidateMessage;

const clients: Set<WebSocket> = new Set();
const users: Map<string, User> = new Map();

const app = new Hono()
    .get(
        '/',
        upgradeWebSocket((_c) => {
            return {
                onOpen: (event, ws) => {
                    ws.raw && clients.add(ws.raw);
                },
                onMessage: (event: MessageEvent, ws) => {
                    console.log("got message");
                    try {
                        const message: SignalingMessage = JSON.parse(event.data);

                        switch (message.type) {
                            case 'join':
                                handleJoin(message, ws.raw!);
                                break;
                            case 'leave':
                                handleLeave(message);
                                break;
                            case 'offer':
                                handleOffer(message);
                                break;
                            case 'answer':
                                handleAnswer(message);
                                break;
                            case 'ice_candidate':
                                handleIceCandidate(message);
                                break;
                            default:
                                console.log("Unknown message type:", message['type']);
                                break;
                        }
                    } catch (error) {
                        console.error("Error handling message:", error);
                    }
                },
                onClose: (event, ws) => {
                    const userEntry = Array.from(users.entries()).find(
                        ([_, user]) => user.conn === ws.raw
                    );
                    if (userEntry) {
                        const [userId, user] = userEntry;
                        handleLeave({ type: 'leave', userId });
                    }
                    console.log("WebSocket connection closed");
                },
                onError: (error) => {
                    console.error("WebSocket error: ", error);
                }
            }
        })
    );

function handleJoin(message: JoinMessage, socket: WebSocket): void {
    const { userId, username } = message;

    // Add user to users map
    users.set(userId, { userId, username, conn: socket });

    // Notify all users about the new user
    const usersList = Array.from(users.values()).map(u => ({
        userId: u.userId,
        username: u.username
    }));

    // Send current users list to the new user
    send(socket, {
        type: 'users_list',
        users: usersList
    });

    // Notify all other users about the new user
    broadcast({
        type: 'user_joined',
        userId,
        username,
        users: usersList
    }, userId);

    console.log(`User joined: ${username} (${userId})`);
}

function handleLeave(message: LeaveMessage): void {
    const { userId } = message;
    const user = users.get(userId);

    if (user) {
        // Remove user from users map
        users.delete(userId);

        // Get updated users list
        const usersList = Array.from(users.values()).map(u => ({
            userId: u.userId,
            username: u.username
        }));

        // Notify all users about the user leaving
        broadcast({
            type: 'user_left',
            userId,
            username: user.username,
            users: usersList
        });

        console.log(`User left: ${user.username} (${userId})`);
    }
}

function handleOffer(message: OfferMessage): void {
    const { targetUserId } = message;
    const targetUser = users.get(targetUserId);

    if (targetUser) {
        // Forward offer to target user
        send(targetUser.conn, message);
    }
}

function handleAnswer(message: AnswerMessage): void {
    const { targetUserId } = message;
    const targetUser = users.get(targetUserId);

    if (targetUser) {
        // Forward answer to target user
        send(targetUser.conn, message);
    }
}

function handleIceCandidate(message: IceCandidateMessage): void {
    const { targetUserId } = message;
    const targetUser = users.get(targetUserId);

    if (targetUser) {
        // Forward ICE candidate to target user
        send(targetUser.conn, message);
    }
}

function send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function broadcast(message: unknown, excludeUserId?: string): void {
    users.forEach(user => {
        if (!excludeUserId || user.userId !== excludeUserId) {
            send(user.conn, message);
        }
    });
}

export default app;