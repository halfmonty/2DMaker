class WebRTCGameClient {
    constructor() {
      // Connect to signaling server
      this.socket = io();
      this.isHost = false;
      this.roomId = null;
      this.peerId = null;
      this.connections = new Map(); // Maps peer IDs to their RTCPeerConnection
      this.dataChannels = new Map(); // Maps peer IDs to their RTCDataChannel
      
      // Bind methods to maintain 'this' context
      this.handleGameMessage = this.handleGameMessage.bind(this);
      this.sendGameAction = this.sendGameAction.bind(this);
      
      this.setupSocketListeners();
    }
    
    setupSocketListeners() {
      // Store socket ID when connected
      this.socket.on('connect', () => {
        this.peerId = this.socket.id;
        console.log(`Connected to signaling server with ID: ${this.peerId}`);
      });
      
      // Room creation response
      this.socket.on('roomCreated', ({ roomId, isHost }) => {
        this.roomId = roomId;
        this.isHost = isHost;
        console.log(`Room created: ${roomId}, You are the host`);
        
        // Notify application about room creation
        this.onRoomCreated && this.onRoomCreated(roomId);
      });
      
      // Room joining response
      this.socket.on('roomJoined', async ({ roomId, hostId }) => {
        this.roomId = roomId;
        this.isHost = false;
        console.log(`Joined room: ${roomId}, host is: ${hostId}`);
        
        // Connect to host
        await this.connectToPeer(hostId, true);
        
        // Notify application about room joining
        this.onRoomJoined && this.onRoomJoined(roomId, hostId);
      });
      
      // New participant notification (only host receives this)
      this.socket.on('newParticipant', async ({ participantId }) => {
        console.log(`New participant joined: ${participantId}`);
        
        if (this.isHost) {
          await this.connectToPeer(participantId, false);
          
          // Notify application about new participant
          this.onParticipantJoined && this.onParticipantJoined(participantId);
        }
      });
      
      // RTC signaling messages
      this.socket.on('rtcSignal', async ({ senderId, signal }) => {
        if (signal.type === 'offer') {
          await this.handleOffer(senderId, signal);
        } else if (signal.type === 'answer') {
          await this.handleAnswer(senderId, signal);
        } else if (signal.candidate) {
          await this.handleICECandidate(senderId, signal);
        }
      });
      
      // Host changed notification
      this.socket.on('hostChanged', async ({ newHostId }) => {
        console.log(`Host changed to: ${newHostId}`);
        
        // Check if I am the new host
        if (newHostId === this.socket.id) {
          this.isHost = true;
          
          // As new host, connect to all remaining peers in the room
          // This will be handled by the remaining peers connecting to me
          console.log("I am the new host");
          
          // Notify application about becoming host
          this.onBecameHost && this.onBecameHost();
        } else {
          // I am not the host
          this.isHost = false;
          
          // Close all existing connections
          this.closeAllConnections();
          
          // Connect to the new host
          await this.connectToPeer(newHostId, true);
          
          // Notify application about host change
          this.onHostChanged && this.onHostChanged(newHostId);
        }
      });
      
      // Error handling
      this.socket.on('error', (message) => {
        console.error(`Socket error: ${message}`);
        this.onError && this.onError(message);
      });
    }
    
    async connectToPeer(peerId, isHostConnection) {
      console.log(`Establishing connection to peer: ${peerId}`);
      
      // Create RTCPeerConnection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      this.connections.set(peerId, peerConnection);
      
      // Set up data channel
      let dataChannel;
      
      if (!isHostConnection || this.isHost) {
        // I am initiating the connection
        dataChannel = peerConnection.createDataChannel('gameData', {
          ordered: true // For game data, often ordered delivery is preferred
        });
        this.setupDataChannel(dataChannel, peerId);
        this.dataChannels.set(peerId, dataChannel);
      } else {
        // The other peer will create the data channel
        peerConnection.ondatachannel = (event) => {
          dataChannel = event.channel;
          this.setupDataChannel(dataChannel, peerId);
          this.dataChannels.set(peerId, dataChannel);
        };
      }
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('rtcSignal', {
            targetId: peerId,
            signal: event.candidate
          });
        }
      };
      
      // Log connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
          
          // Clean up connection if it was closed
          if (this.dataChannels.has(peerId)) {
            this.dataChannels.delete(peerId);
          }
          
          if (this.connections.has(peerId)) {
            this.connections.delete(peerId);
          }
          
          // Notify application about disconnection
          this.onPeerDisconnected && this.onPeerDisconnected(peerId);
        }
      };
      
      // Create and send offer if initiating the connection
      if (!isHostConnection || this.isHost) {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          
          this.socket.emit('rtcSignal', {
            targetId: peerId,
            signal: peerConnection.localDescription
          });
        } catch (error) {
          console.error('Error creating offer:', error);
        }
      }
    }
    
    async handleOffer(peerId, offer) {
      console.log(`Received offer from: ${peerId}`);
      
      let peerConnection = this.connections.get(peerId);
      
      if (!peerConnection) {
        peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        
        this.connections.set(peerId, peerConnection);
        
        // Handle data channel if peer creates it
        peerConnection.ondatachannel = (event) => {
          const dataChannel = event.channel;
          this.setupDataChannel(dataChannel, peerId);
          this.dataChannels.set(peerId, dataChannel);
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.socket.emit('rtcSignal', {
              targetId: peerId,
              signal: event.candidate
            });
          }
        };
        
        // Log connection state changes
        peerConnection.onconnectionstatechange = () => {
          console.log(`Connection state with ${peerId}: ${peerConnection.connectionState}`);
          
          if (peerConnection.connectionState === 'disconnected' || 
              peerConnection.connectionState === 'failed' ||
              peerConnection.connectionState === 'closed') {
            
            // Clean up connections
            if (this.dataChannels.has(peerId)) {
              this.dataChannels.delete(peerId);
            }
            
            if (this.connections.has(peerId)) {
              this.connections.delete(peerId);
            }
            
            // Notify application
            this.onPeerDisconnected && this.onPeerDisconnected(peerId);
          }
        };
      }
      
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        this.socket.emit('rtcSignal', {
          targetId: peerId,
          signal: peerConnection.localDescription
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    }
    
    async handleAnswer(peerId, answer) {
      console.log(`Received answer from: ${peerId}`);
      
      const peerConnection = this.connections.get(peerId);
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error('Error handling answer:', error);
        }
      }
    }
    
    async handleICECandidate(peerId, candidate) {
      const peerConnection = this.connections.get(peerId);
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    }
    
    setupDataChannel(dataChannel, peerId) {
      console.log(`Setting up data channel for peer: ${peerId}`);
      
      dataChannel.onopen = () => {
        console.log(`Data channel with ${peerId} opened`);
        
        // Notify application
        this.onDataChannelOpen && this.onDataChannelOpen(peerId);
        
        // If this is a new connection and I'm the host, send initial game state
        if (this.isHost) {
          this.sendInitialGameState(peerId);
        }
      };
      
      dataChannel.onclose = () => {
        console.log(`Data channel with ${peerId} closed`);
        
        // Notify application
        this.onDataChannelClose && this.onDataChannelClose(peerId);
      };
      
      dataChannel.onerror = (error) => {
        console.error(`Data channel error with ${peerId}:`, error);
      };
      
      dataChannel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleGameMessage(message, peerId);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };
    }
    
    handleGameMessage(message, senderId) {
      // Parse game messages and react accordingly
      if (this.isHost) {
        // As host: validate, process, and broadcast to all other peers
        console.log(`As host, received message from ${senderId}:`, message);
        
        // Allow application to validate/process the message
        const processedMessage = this.onHostReceiveMessage ? 
          this.onHostReceiveMessage(message, senderId) : message;
        
        if (processedMessage) {
          // Broadcast to all peers (except sender)
          this.broadcastGameMessage(processedMessage, senderId);
        }
      } else {
        // As client: process game update from host
        console.log('Received game update from host:', message);
        
        // Application callback for game updates
        this.onGameUpdate && this.onGameUpdate(message);
      }
    }
    
    broadcastGameMessage(message, excludePeerId) {
      if (!this.isHost) {
        console.warn('Cannot broadcast: not the host');
        return;
      }
      
      const messageStr = JSON.stringify(message);
      
      for (const [peerId, dataChannel] of this.dataChannels.entries()) {
        if (peerId !== excludePeerId && dataChannel.readyState === 'open') {
          dataChannel.send(messageStr);
        }
      }
    }
    
    sendGameAction(action) {
      if (this.isHost) {
        // Host: process action locally and broadcast to all
        console.log('Host processing game action:', action);
        
        // Allow application to process the action
        const processedAction = this.onHostProcessAction ?
          this.onHostProcessAction(action) : action;
        
        if (processedAction) {
          // Apply to local game state
          this.onGameUpdate && this.onGameUpdate(processedAction);
          
          // Broadcast to all clients
          this.broadcastGameMessage(processedAction, null);
        }
      } else {
        // Client: send action to host
        const hostPeerId = this.getHostPeerId();
        const hostDataChannel = this.dataChannels.get(hostPeerId);
        
        if (hostDataChannel && hostDataChannel.readyState === 'open') {
          console.log('Sending game action to host:', action);
          hostDataChannel.send(JSON.stringify(action));
        } else {
          console.error('Cannot send action: no open channel to host');
        }
      }
    }
    
    sendInitialGameState(peerId) {
      if (!this.isHost) return;
      
      const dataChannel = this.dataChannels.get(peerId);
      if (dataChannel && dataChannel.readyState === 'open') {
        // Get current game state from application
        const gameState = this.onGetGameState ? this.onGetGameState() : {};
        
        if (gameState) {
          const initialMessage = {
            type: 'initialState',
            state: gameState
          };
          
          dataChannel.send(JSON.stringify(initialMessage));
        }
      }
    }
    
    getHostPeerId() {
      // If there's only one connection for a client, it must be to the host
      if (this.dataChannels.size === 1) {
        return Array.from(this.dataChannels.keys())[0];
      }
      
      // This is more complex if multiple connections exist
      // In our star topology, should only happen during host migration
      return null;
    }
    
    // Public API methods
    createRoom() {
      this.socket.emit('createRoom');
    }
    
    joinRoom(roomId) {
      this.socket.emit('joinRoom', roomId);
    }
    
    leaveRoom() {
      // Close all peer connections
      this.closeAllConnections();
      
      // Leave the socket.io room (optional, as disconnection will handle this)
      if (this.roomId) {
        this.socket.emit('leaveRoom', this.roomId);
        this.roomId = null;
        this.isHost = false;
      }
    }
    
    closeAllConnections() {
      console.log('Closing all peer connections');
      
      // Close all data channels first
      for (const dataChannel of this.dataChannels.values()) {
        if (dataChannel.readyState === 'open') {
          dataChannel.close();
        }
      }
      
      // Then close all peer connections
      for (const connection of this.connections.values()) {
        connection.close();
      }
      
      // Clear the maps
      this.connections.clear();
      this.dataChannels.clear();
    }
    
    // For debugging
    getConnectionStats() {
      return {
        connections: this.connections.size,
        dataChannels: this.dataChannels.size,
        isHost: this.isHost,
        roomId: this.roomId
      };
    }
    
    // Callback registration methods for application integration
    setCallbacks(callbacks) {
      // Room events
      this.onRoomCreated = callbacks.onRoomCreated;
      this.onRoomJoined = callbacks.onRoomJoined;
      this.onBecameHost = callbacks.onBecameHost;
      this.onHostChanged = callbacks.onHostChanged;
      
      // Peer events
      this.onParticipantJoined = callbacks.onParticipantJoined;
      this.onPeerDisconnected = callbacks.onPeerDisconnected;
      this.onDataChannelOpen = callbacks.onDataChannelOpen;
      this.onDataChannelClose = callbacks.onDataChannelClose;
      
      // Game message handling
      this.onHostReceiveMessage = callbacks.onHostReceiveMessage;
      this.onHostProcessAction = callbacks.onHostProcessAction;
      this.onGameUpdate = callbacks.onGameUpdate;
      this.onGetGameState = callbacks.onGetGameState;
      
      // Error handling
      this.onError = callbacks.onError;
    }
  }