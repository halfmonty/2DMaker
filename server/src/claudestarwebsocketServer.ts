import { Hono } from "hono";
import { upgradeWebSocket } from 'hono/deno';

// Define types for our users and messages
interface User {
    userId: string;
    username: string;
    conn: WebSocket;
}

interface Room {
    roomId: string;
    hostId: string;
    users: Map<string, User>;
}

interface BaseMessage {
    type: string;
    userId: string;
}

interface JoinMessage extends BaseMessage {
    type: 'join';
    username: string;
    roomId?: string; // Optional: to join a specific room
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

const rooms = new Map<string, Room>();
const userToRoom = new Map<string, string>();

function generateRoomId(): string {
    return Math.random().toString(36).substr(2, 9);
}

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
                    // Find user by socket connection and handle leave
                    for (const [roomId, room] of rooms.entries()) {
                        for (const [userId, user] of room.users.entries()) {
                            if (user.conn === ws.raw) {
                                handleLeave({ type: 'leave', userId });
                                return;
                            }
                        }
                    }
                    console.log("WebSocket connection closed");
                },
                onError: (error) => {
                    console.error("WebSocket error: ", error);
                }
            }
        })
    );

// Handler functions
function handleJoin(message: JoinMessage, socket: WebSocket): void {
    const { userId, username, roomId: requestedRoomId } = message;
    
    let roomId = requestedRoomId;
    let room: Room;
    
    // If no roomId specified or room doesn't exist, either join the first room or create a new one
    if (!roomId || !rooms.has(roomId)) {
      // Try to find an existing room with space
      if (!roomId && rooms.size > 0) {
        // Just use the first room for simplicity - in production you might want more sophisticated room selection
        roomId = rooms.keys().next().value;
        room = rooms.get(roomId!)!;
      } else {
        // Create a new room with this user as host
        roomId = generateRoomId();
        room = {
          roomId,
          hostId: userId,
          users: new Map()
        };
        rooms.set(roomId, room);
        console.log(`Created new room: ${roomId} with host: ${username} (${userId})`);
      }
    } else {
      room = rooms.get(roomId)!;
    }
  
    // Add user to room
    room.users.set(userId, { userId, username, conn: socket });
    userToRoom.set(userId, roomId!);
    
    // Get user list to send
    const usersList = Array.from(room.users.values()).map(u => ({
      userId: u.userId,
      username: u.username
    }));
    
    // Inform the user about the room and all users
    send(socket, {
      type: 'room_info',
      roomId,
      hostId: room.hostId,
      users: usersList
    });
    
    // Notify all other users in the room about the new user
    for (const [otherUserId, otherUser] of room.users.entries()) {
      if (otherUserId !== userId) {
        send(otherUser.conn, {
          type: 'user_joined',
          userId,
          username,
          users: usersList
        });
      }
    }
    
    console.log(`User joined: ${username} (${userId}) in room ${roomId}`);
}

function handleLeave(message: LeaveMessage): void {
    const { userId } = message;
    const roomId = userToRoom.get(userId);
    
    if (!roomId || !rooms.has(roomId)) {
      return;
    }
    
    const room = rooms.get(roomId)!;
    const user = room.users.get(userId);
    
    if (!user) {
      return;
    }
    
    // Remove user from room and tracking
    room.users.delete(userId);
    userToRoom.delete(userId);
    
    // If room is empty, delete it
    if (room.users.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
      return;
    }
    
    // Check if the leaving user was the host
    let newHostId: string | null = null;
    if (userId === room.hostId) {
      // Assign a new host (first available user)
      newHostId = room.users.keys().next().value!;
      room.hostId = newHostId;
      console.log(`New host in room ${roomId}: ${newHostId}`);
    }
    
    // Get updated users list
    const usersList = Array.from(room.users.values()).map(u => ({
      userId: u.userId,
      username: u.username
    }));
    
    // Notify all remaining users about the user leaving and possibly new host
    for (const [otherUserId, otherUser] of room.users.entries()) {
      send(otherUser.conn, {
        type: 'user_left',
        userId,
        username: user.username,
        users: usersList,
        newHostId // Will be null if host didn't change
      });
    }
    
    console.log(`User left: ${user.username} (${userId}) from room ${roomId}`);
}

function handleOffer(message: OfferMessage): void {
    const { targetUserId } = message;
    const roomId = userToRoom.get(message.userId);
    
    if (!roomId || !rooms.has(roomId)) {
      return;
    }
    
    const room = rooms.get(roomId)!;
    const targetUser = room.users.get(targetUserId);
    
    if (targetUser) {
      // Forward offer to target user
      send(targetUser.conn, message);
    }
}

function handleAnswer(message: AnswerMessage): void {
    const { targetUserId } = message;
    const roomId = userToRoom.get(message.userId);
    
    if (!roomId || !rooms.has(roomId)) {
      return;
    }
    
    const room = rooms.get(roomId)!;
    const targetUser = room.users.get(targetUserId);
    
    if (targetUser) {
      // Forward answer to target user
      send(targetUser.conn, message);
    }
}

function handleIceCandidate(message: IceCandidateMessage): void {
    const { targetUserId } = message;
    const roomId = userToRoom.get(message.userId);
    
    if (!roomId || !rooms.has(roomId)) {
      return;
    }
    
    const room = rooms.get(roomId)!;
    const targetUser = room.users.get(targetUserId);
    
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