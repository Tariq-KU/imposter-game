const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static frontend files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Game Categories Data
const categories = {
  anime: [
    "Tanjiro Kamado", "Nezuko Kamado", "Zenitsu Agatsuma", "Inosuke Hashibira",
    "Giyu Tomioka", "Kyojuro Rengoku", "Muzan Kibutsuji", "Eren Yeager",
    "Mikasa Ackerman", "Armin Arlert", "Levi Ackerman", "Reiner Braun"
  ],
  marvel_dc: [
    "Batman", "Spider-Man", "Superman", "Iron Man", "Wonder Woman",
    "Thor", "Joker", "Captain America", "The Flash", "Black Widow"
  ],
  food: [
    "Sushi", "Shawarma", "Burger", "Pizza", "Tacos",
    "Biryani", "Ramen", "Steak", "Falafel", "Gelato"
  ],
  animals: [
    "Capybara", "Peregrine Falcon", "Great White Shark", "Snow Leopard",
    "Lion", "Elephant", "Dolphin", "Kangaroo", "Gorilla", "Panda"
  ],
  professions: [
    "Neurosurgeon", "Astronaut", "Firefighter", "Pilot", "Chef",
    "Lawyer", "Software Engineer", "Artist", "Journalist", "Private Investigator"
  ]
};

// In-memory room storage
const rooms = {};

// Helper function to generate a unique room code
function generateRoomCode(){
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Create Room
  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, isHost: true }],
      gameStarted: false
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
  });

  // 2. Join Room
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) {
      return socket.emit('errorMsg', 'Room not found.');
    }
    if (room.gameStarted) {
      return socket.emit('errorMsg', 'Game has already started.');
    }

    room.players.push({ id: socket.id, name: playerName, isHost: false });
    socket.join(code);
    io.to(code).emit('roomUpdated', { players: room.players });
  });

  // 3. Start Game (Host Only)
  socket.on('startGame', ({ roomCode, category, imposterCount }) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;

    const numPlayers = room.players.length;
    const requestedImposters = parseInt(imposterCount);

    if (requestedImposters >= numPlayers) {
      return socket.emit('errorMsg', 'Imposters must be fewer than total players.');
    }

    if (!categories[category]) {
      return socket.emit('errorMsg', 'Invalid category selected.');
    }

    room.gameStarted = true;

    // Select a random secret word from the chosen category
    const wordPool = categories[category];
    const secretWord = wordPool[Math.floor(Math.random() * wordPool.length)];

    // Shuffle players to pick random imposters
    const shuffledPlayers = [...room.players].sort(() => 0.5 - Math.random());
    const imposterIds = shuffledPlayers.slice(0, requestedImposters).map(p => p.id);

    // Send role information privately to each individual player's socket
    room.players.forEach((player) => {
      const isImposter = imposterIds.includes(player.id);
      io.to(player.id).emit('gameStarted', {
        role: isImposter ? 'Imposter' : 'Crewmate',
        word: isImposter ? 'UNKNOWN' : secretWord,
        category: category.toUpperCase().replace('_', ' ')
      });
    });
  });

  // 4. Return to Lobby / Play Again
  socket.on('resetGame', (roomCode) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;
    room.gameStarted = false;
    io.to(roomCode.toUpperCase()).emit('gameReset', { players: room.players });
  });

  // 5. Handle Disconnects
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const removedPlayer = room.players.splice(index, 1)[0];

        // If room is empty, delete it
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          // If the host left, assign a new host
          if (removedPlayer.isHost) {
            room.players[0].isHost = true;
          }
          io.to(code).emit('roomUpdated', { players: room.players });
        }
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
