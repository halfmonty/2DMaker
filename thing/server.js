// Using Node.js with Socket.IO for the signaling server
const server = require('http').createServer();
const io = require('socket.io')(server);
const rooms = new Map(); // Map to track rooms and their participants

io.on('connection', (socket) => {
  // Handle room creation
  socket.on('createRoom', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      host: socket.id,
      participants: [socket.id]
    });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, isHost: true });
  });

  // Handle room joining
  socket.on('joinRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    room.participants.push(socket.id);
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, hostId: room.host });
    
    // Notify host about new participant
    io.to(room.host).emit('newParticipant', { participantId: socket.id });
  });

  // WebRTC signaling (offer, answer, ICE candidates)
  socket.on('rtcSignal', ({ targetId, signal }) => {
    io.to(targetId).emit('rtcSignal', { 
      senderId: socket.id, 
      signal 
    });
  });

  // Handle disconnection and host migration
  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      const participantIndex = room.participants.indexOf(socket.id);
      
      if (participantIndex !== -1) {
        // Remove participant
        room.participants.splice(participantIndex, 1);
        
        // If room is empty, remove it
        if (room.participants.length === 0) {
          rooms.delete(roomId);
          continue;
        }
        
        // If the disconnected user was the host, select new host
        if (room.host === socket.id) {
          const newHostIndex = Math.floor(Math.random() * room.participants.length);
          room.host = room.participants[newHostIndex];
          
          // Notify all participants about new host
          io.to(roomId).emit('hostChanged', { newHostId: room.host });
        }
      }
    }
  });
});

server.listen(3000);