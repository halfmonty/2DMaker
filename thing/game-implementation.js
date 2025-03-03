// Example usage in a browser environment
document.addEventListener('DOMContentLoaded', () => {
    // Create WebRTC client
    const gameClient = new WebRTCGameClient();
    
    // Game state (managed by the application)
    let gameState = {
      players: {},
      gameObjects: [],
      timestamp: Date.now()
    };
    
    // Set up UI event listeners
    document.getElementById('createRoomBtn').addEventListener('click', () => {
      gameClient.createRoom();
    });
    
    document.getElementById('joinRoomBtn').addEventListener('click', () => {
      const roomId = document.getElementById('roomIdInput').value;
      if (roomId) {
        gameClient.joinRoom(roomId);
      }
    });
    
    document.getElementById('leaveRoomBtn').addEventListener('click', () => {
      gameClient.leaveRoom();
      updateUI('disconnected');
    });
    
    document.getElementById('sendActionBtn').addEventListener('click', () => {
      // Example game action
      const action = {
        type: 'playerMove',
        playerId: gameClient.peerId,
        position: {
          x: Math.floor(Math.random() * 100),
          y: Math.floor(Math.random() * 100)
        },
        timestamp: Date.now()
      };
      
      gameClient.sendGameAction(action);
    });
    
    // Register callbacks
    gameClient.setCallbacks({
      // Room events
      onRoomCreated: (roomId) => {
        document.getElementById('roomIdDisplay').textContent = roomId;
        document.getElementById('hostStatus').textContent = 'You are the host';
        updateUI('connected');
        
        // Initialize game state
        gameState = {
          players: {
            [gameClient.peerId]: {
              id: gameClient.peerId,
              position: { x: 50, y: 50 },
              color: getRandomColor(),
              lastUpdate: Date.now()
            }
          },
          gameObjects: [],
          timestamp: Date.now()
        };
        
        // Start game loop
        startGameLoop();
      },
      
      onRoomJoined: (roomId) => {
        document.getElementById('roomIdDisplay').textContent = roomId;
        document.getElementById('hostStatus').textContent = 'You are a client';
        updateUI('connected');
      },
      
      onBecameHost: () => {
        document.getElementById('hostStatus').textContent = 'You are the host (migrated)';
        
        // Start game loop if not already running
        startGameLoop();
      },
      
      onHostChanged: (newHostId) => {
        document.getElementById('hostStatus').textContent = 'You are a client';
        console.log(`New host is: ${newHostId}`);
      },
      
      // Peer events
      onParticipantJoined: (participantId) => {
        console.log(`New player joined: ${participantId}`);
        
        // Add new player to game state
        if (gameClient.isHost) {
          gameState.players[participantId] = {
            id: participantId,
            position: { x: 50, y: 50 },
            color: getRandomColor(),
            lastUpdate: Date.now()
          };
        }
        
        updatePlayerList();
      },
      
      onPeerDisconnected: (peerId) => {
        console.log(`Player disconnected: ${peerId}`);
        
        // Remove player from game state
        if (gameClient.isHost && gameState.players[peerId]) {
          delete gameState.players[peerId];
        }
        
        updatePlayerList();
      },
      
      // Game message handling
      onHostReceiveMessage: (message, senderId) => {
        if (message.type === 'playerMove') {
          // Validate move (could add game logic here)
          if (gameState.players[senderId]) {
            gameState.players[senderId].position = message.position;
            gameState.players[senderId].lastUpdate = message.timestamp;
            return message; // Allow broadcasting
          }
        }
        return null; // Don't broadcast invalid messages
      },
      
      onHostProcessAction: (action) => {
        if (action.type === 'playerMove') {
          // Update host's own player position
          if (gameState.players[gameClient.peerId]) {
            gameState.players[gameClient.peerId].position = action.position;
            gameState.players[gameClient.peerId].lastUpdate = action.timestamp;
          }
          return action; // Allow broadcasting
        }
        return null;
      },
      
      onGameUpdate: (update) => {
        if (update.type === 'initialState') {
          // Replace entire game state with initial state from host
          gameState = update.state;
          console.log('Received initial game state:', gameState);
        } else if (update.type === 'gameState') {
          // Full state update
          gameState = update.state;
        } else if (update.type === 'playerMove') {
          // Individual player move
          if (gameState.players[update.playerId]) {
            gameState.players[update.playerId].position = update.position;
            gameState.players[update.playerId].lastUpdate = update.timestamp;
          }
        }
        
        // Render updated game state
        renderGame();
        updatePlayerList();
      },
      
      onGetGameState: () => {
        // Return the current game state for new players
        return gameState;
      },
      
      // Error handling
      onError: (error) => {
        console.error('WebRTC error:', error);
        document.getElementById('errorMessage').textContent = error;
      }
    });
    
    // Helper functions
    function updateUI(status) {
      if (status === 'connected') {
        document.getElementById('connectionPanel').classList.add('hidden');
        document.getElementById('gamePanel').classList.remove('hidden');
      } else {
        document.getElementById('connectionPanel').classList.remove('hidden');
        document.getElementById('gamePanel').classList.add('hidden');
        document.getElementById('roomIdDisplay').textContent = '';
        document.getElementById('hostStatus').textContent = '';
        document.getElementById('playerList').innerHTML = '';
      }
    }
    
    function updatePlayerList() {
      const playerList = document.getElementById('playerList');
      playerList.innerHTML = '';
      
      for (const playerId in gameState.players) {
        const playerEl = document.createElement('div');
        const player = gameState.players[playerId];
        
        playerEl.classList.add('player-item');
        playerEl.style.color = player.color;
        playerEl.textContent = `${playerId} (${player.position.x}, ${player.position.y})`;
        
        if (playerId === gameClient.peerId) {
          playerEl.textContent += ' (You)';
          playerEl.classList.add('current-player');
        }
        
        playerList.appendChild(playerEl);
      }
    }
    
    function renderGame() {
      const canvas = document.getElementById('gameCanvas');
      const ctx = canvas.getContext('2d');
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw players
      for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(
          player.position.x * (canvas.width / 100),
          player.position.y * (canvas.height / 100), 
          10, 
          0, 
          Math.PI * 2
        );
        ctx.fill();
        
        // Draw player ID
        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          playerId.substring(0, 4), 
          player.position.x * (canvas.width / 100), 
          player.position.y * (canvas.height / 100) - 15
        );
      }
    }
    
    function startGameLoop() {
      if (gameClient.isHost) {
        // Only host runs game loop to broadcast regular state updates
        const gameLoopInterval = setInterval(() => {
          if (!gameClient.isHost) {
            // Stop loop if no longer host
            clearInterval(gameLoopInterval);
            return;
          }
          
          // Send full game state periodically
          gameClient.broadcastGameMessage({
            type: 'gameState',
            state: gameState
          });
          
          // Update timestamp
          gameState.timestamp = Date.now();
        }, 1000); // Send full state every second
      }
    }
    
    function getRandomColor() {
      const letters = '0123456789ABCDEF';
      let color = '#';
      for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    }
  });