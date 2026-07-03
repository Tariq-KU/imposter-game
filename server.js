const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Mobile browsers often pause JavaScript/network activity while the tab is hidden.
// These grace periods prevent a temporary phone background/screen timeout from
// being treated as an intentional leave.
const DISCONNECT_GRACE_MS = 2 * 60 * 1000; // 2 minutes before host handoff
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes before deleting an empty/offline room

const io = new Server(server, {
  pingTimeout: 120000,
  pingInterval: 25000,
  connectionStateRecovery: {
    maxDisconnectionDuration: EMPTY_ROOM_TTL_MS,
    skipMiddlewares: true
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Expanded Game Categories Data
const categories = {
  anime: [
    "Tanjiro Kamado", "Nezuko Kamado", "Zenitsu Agatsuma", "Inosuke Hashibira", 
    "Giyu Tomioka", "Kyojuro Rengoku", "Tengen Uzui", "Muichiro Tokito",
    "Mitsuri Kanroji", "Obanai Iguro", "Sanemi Shinazugawa", "Gyomei Himejima",
    "Shinobu Kocho", "Muzan Kibutsuji", "Akaza", "Doma", "Kokushibo",
    "Eren Yeager", "Mikasa Ackerman", "Armin Arlert", "Levi Ackerman", 
    "Erwin Smith", "Reiner Braun", "Annie Leonhart", "Bertholdt Hoover", 
    "Hange Zoe", "Zeke Yeager", "Historia Reiss", "Jean Kirstein", 
    "Sasha Blouse", "Connie Springer", "Pieck Finger", "Porco Galliard"
  ],
  marvel_dc: [
    "Batman", "Superman", "Spider-Man", "Iron Man", "Wonder Woman", 
    "Captain America", "Thor", "Hulk", "Black Widow", "The Flash", 
    "Aquaman", "Green Lantern", "Wolverine", "Deadpool", "Doctor Strange", 
    "Black Panther", "Ant-Man", "Scarlet Witch", "Vision", "Loki", 
    "Thanos", "Joker", "Harley Quinn", "Lex Luthor", "Darkseid", 
    "Magneto", "Professor X", "Daredevil", "The Punisher", "Venom"
  ],
  food: [
    "Sushi", "Shawarma", "Burger", "Pizza", "Tacos", 
    "Biryani", "Ramen", "Steak", "Falafel", "Gelato",
    "Croissant", "Pad Thai", "Lasagna", "Dim Sum", "Kebab",
    "Fried Chicken", "Paella", "Burrito", "Mac and Cheese", "Pho",
    "Butter Chicken", "Peking Duck", "Fish and Chips", "Hummus", "Tiramisu",
    "Churros", "Cheesecake", "Pancakes", "Waffles", "Curry"
  ],
  animals: [
    "Capybara", "Peregrine Falcon", "Great White Shark", "Snow Leopard", 
    "Lion", "Elephant", "Dolphin", "Kangaroo", "Gorilla", "Panda",
    "Tiger", "Giraffe", "Zebra", "Cheetah", "Orangutan", 
    "Penguin", "Polar Bear", "Koala", "Rhinoceros", "Hippopotamus",
    "Ostrich", "Sloth", "Meerkat", "Platypus", "Komodo Dragon",
    "Bald Eagle", "Octopus", "Chameleon", "Otter", "Hedgehog"
  ],
  professions: [
    "Neurosurgeon", "Astronaut", "Firefighter", "Pilot", "Chef", 
    "Lawyer", "Software Engineer", "Artist", "Journalist", "Private Investigator",
    "Architect", "Dentist", "Detective", "Pharmacist", "Plumber",
    "Electrician", "Veterinarian", "Mechanic", "Scientist", "Teacher",
    "Actor", "Musician", "Photographer", "Writer", "Accountant",
    "Psychologist", "Police Officer", "Paramedic", "Judge", "Magician"
  ],
  irl_people: [
    "Cristiano Ronaldo", "Lionel Messi", "Elon Musk", "Barack Obama", 
    "Gordon Ramsay", "LeBron James", "Taylor Swift", "Tom Cruise", 
    "Nelson Mandela", "Albert Einstein", "Serena Williams", "Michael Jordan", 
    "Bill Gates", "Mark Zuckerberg", "Dwayne 'The Rock' Johnson", "Leonardo DiCaprio", 
    "Keanu Reeves", "Will Smith", "Jackie Chan", "David Beckham", 
    "Usain Bolt", "Muhammad Ali", "Abraham Lincoln", "Winston Churchill", 
    "Marilyn Monroe", "Oprah Winfrey", "Queen Elizabeth II", "Virat Kohli", 
    "Roger Federer", "Rafael Nadal"
  ]
};


const rooms = {};
const playerDisconnectTimers = new Map();
const roomCleanupTimers = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms[code]);
  return code;
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function playerTimerKey(code, playerId) {
  return `${code}:${playerId}`;
}

function clearPlayerDisconnectTimer(code, playerId) {
  const key = playerTimerKey(code, playerId);
  const timer = playerDisconnectTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    playerDisconnectTimers.delete(key);
  }
}

function clearRoomCleanupTimer(code) {
  const timer = roomCleanupTimers.get(code);

  if (timer) {
    clearTimeout(timer);
    roomCleanupTimers.delete(code);
  }
}

function clearRoomTimers(code) {
  clearRoomCleanupTimer(code);

  for (const key of playerDisconnectTimers.keys()) {
    if (key.startsWith(`${code}:`)) {
      clearTimeout(playerDisconnectTimers.get(key));
      playerDisconnectTimers.delete(key);
    }
  }
}

function deleteRoom(code) {
  clearRoomTimers(code);
  delete rooms[code];
}

function publicPlayers(room) {
  return room.players.map(player => ({
    id: player.id,
    playerId: player.playerId,
    name: player.name,
    isHost: player.isHost,
    score: player.score || 0,
    offline: Boolean(player.offline)
  }));
}

function emitRoomUpdated(code) {
  const room = rooms[code];
  if (!room) return;

  io.to(code).emit('roomUpdated', {
    roomCode: code,
    players: publicPlayers(room)
  });
}

function scheduleRoomCleanup(code) {
  if (roomCleanupTimers.has(code)) return;

  const timer = setTimeout(() => {
    const room = rooms[code];
    if (!room) return;

    const everyoneOffline = room.players.every(player => player.offline);
    if (everyoneOffline) {
      deleteRoom(code);
      return;
    }

    roomCleanupTimers.delete(code);
  }, EMPTY_ROOM_TTL_MS);

  roomCleanupTimers.set(code, timer);
}

function buildPlayerGameState(room, playerId) {
  const isImposter = room.imposters.some(imposter => imposter.playerId === playerId);
  const { category, mode, crewmateWord, hiddenImposterWord, imposterRevealed } = room.currentRound;

  let roleToSend;
  let wordToSend;

  if (mode === 'hidden') {
    roleToSend = 'Hidden';
    wordToSend = isImposter ? hiddenImposterWord : crewmateWord;
  } else {
    roleToSend = isImposter ? 'Imposter' : 'Crewmate';
    wordToSend = isImposter ? 'UNKNOWN' : crewmateWord;
  }

  return {
    roomCode: room.code,
    players: publicPlayers(room),
    role: roleToSend,
    word: wordToSend,
    category: category.toUpperCase().replace('_', ' '),
    mode,
    selectedCategories: room.gameOptions.selectedCategories,
    imposterRevealed,
    imposterNames: imposterRevealed ? room.imposters.map(i => i.name).join(' & ') : null
  };
}

function sendCurrentState(socket, code, playerId) {
  const room = rooms[code];
  if (!room) {
    socket.emit('rejoinFailed');
    return;
  }

  if (room.gameStarted && room.currentRound) {
    socket.emit('rejoinGame', buildPlayerGameState(room, playerId));
  } else {
    socket.emit('roomCreated', {
      roomCode: code,
      players: publicPlayers(room)
    });
  }
}

function attachPlayerToSocket(socket, code, playerId, name) {
  const room = rooms[code];
  if (!room || !playerId) return false;

  const player = room.players.find(p => p.playerId === playerId);
  if (!player) return false;

  clearPlayerDisconnectTimer(code, playerId);
  clearRoomCleanupTimer(code);

  player.id = socket.id;
  player.offline = false;
  player.disconnectedAt = null;
  if (name) player.name = name;

  socket.join(code);
  emitRoomUpdated(code);
  sendCurrentState(socket, code, playerId);

  return true;
}

function pickRound(room, selectedCategories) {
  const categoryToUse = selectedCategories[Math.floor(Math.random() * selectedCategories.length)];
  const wordPool = [...categories[categoryToUse]].sort(() => 0.5 - Math.random());
  const crewmateWord = wordPool[0];
  const hiddenImposterWord = wordPool[1];
  const requestedImposters = parseInt(room.gameOptions.imposterCount, 10);
  const shuffledPlayers = [...room.players].sort(() => 0.5 - Math.random());
  const imposterIds = shuffledPlayers.slice(0, requestedImposters).map(p => p.playerId);

  room.imposters = room.players.filter(p => imposterIds.includes(p.playerId));
  room.currentRound = {
    category: categoryToUse,
    mode: room.gameOptions.gameMode,
    crewmateWord,
    hiddenImposterWord,
    imposterRevealed: false
  };

  return { categoryToUse, imposterIds };
}

function sendRoundAssignments(room, imposterIds) {
  room.players.forEach(player => {
    if (player.offline) return;
    io.to(player.id).emit('gameStarted', buildPlayerGameState(room, player.playerId));
  });
}

function validateCategories(selectedCategories) {
  if (!Array.isArray(selectedCategories) || selectedCategories.length === 0) {
    return 'Please select at least one category.';
  }

  for (const cat of selectedCategories) {
    if (!categories[cat]) return 'Invalid category selected.';
  }

  return null;
}

io.on('connection', (socket) => {
  socket.on('rejoinRoom', (payload = {}) => {
    const code = normalizeRoomCode(payload.roomCode);
    const success = attachPlayerToSocket(socket, code, payload.playerId);

    if (!success) socket.emit('rejoinFailed');
  });

  socket.on('syncState', (payload = {}) => {
    const code = normalizeRoomCode(payload.roomCode);
    const success = attachPlayerToSocket(socket, code, payload.playerId);

    if (!success) socket.emit('rejoinFailed');
  });

  socket.on('createRoom', (payload = {}) => {
    const name = typeof payload === 'string' ? payload.trim() : String(payload.name || '').trim();
    const playerId = typeof payload === 'object' ? payload.playerId : socket.id;

    if (!name) return socket.emit('errorMsg', 'Please enter a name first.');
    if (!playerId) return socket.emit('errorMsg', 'Could not identify player. Please refresh and try again.');

    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, playerId, name, isHost: true, score: 0, offline: false, disconnectedAt: null }],
      gameStarted: false,
      imposters: [],
      gameOptions: {},
      currentRound: null
    };

    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, players: publicPlayers(rooms[roomCode]) });
  });

  socket.on('joinRoom', ({ roomCode, playerName, playerId } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    const name = String(playerName || '').trim();

    if (!room) return socket.emit('errorMsg', 'Room not found.');
    if (!name) return socket.emit('errorMsg', 'Please enter a name first.');
    if (!playerId) return socket.emit('errorMsg', 'Could not identify player. Please refresh and try again.');

    const existingPlayer = room.players.find(p => p.playerId === playerId);
    if (existingPlayer) {
      attachPlayerToSocket(socket, code, playerId, name);
      return;
    }

    if (room.gameStarted) return socket.emit('errorMsg', 'Game has already started.');

    clearRoomCleanupTimer(code);
    room.players.push({ id: socket.id, playerId, name, isHost: false, score: 0, offline: false, disconnectedAt: null });
    socket.join(code);

    socket.emit('roomCreated', { roomCode: code, players: publicPlayers(room) });
    emitRoomUpdated(code);
  });

  socket.on('startGame', ({ roomCode, selectedCategories, imposterCount, gameMode } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer?.isHost) return socket.emit('errorMsg', 'Only the host can start the game.');

    const requestedImposters = parseInt(imposterCount, 10);
    if (!Number.isInteger(requestedImposters) || requestedImposters < 1) {
      return socket.emit('errorMsg', 'Please choose at least one imposter.');
    }

    const numPlayers = room.players.length;
    if (requestedImposters >= numPlayers) {
      return socket.emit('errorMsg', 'Imposters must be fewer than total players.');
    }

    const categoryError = validateCategories(selectedCategories);
    if (categoryError) return socket.emit('errorMsg', categoryError);

    room.gameStarted = true;
    room.gameOptions = {
      imposterCount: requestedImposters,
      gameMode: gameMode === 'hidden' ? 'hidden' : 'standard',
      selectedCategories
    };

    const { imposterIds } = pickRound(room, selectedCategories);
    sendRoundAssignments(room, imposterIds);
  });

  socket.on('continueGame', ({ roomCode, pointsData = {}, nextCategories } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer?.isHost) return socket.emit('errorMsg', 'Only the host can continue the game.');

    const categoryError = validateCategories(nextCategories);
    if (categoryError) return socket.emit('errorMsg', categoryError);

    room.players.forEach(player => {
      if (Object.prototype.hasOwnProperty.call(pointsData, player.playerId)) {
        player.score += parseInt(pointsData[player.playerId], 10) || 0;
      }
    });

    room.gameOptions.selectedCategories = nextCategories;
    const { imposterIds } = pickRound(room, nextCategories);

    emitRoomUpdated(code);
    sendRoundAssignments(room, imposterIds);
  });

  socket.on('revealImposter', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room || !room.currentRound) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer?.isHost) return socket.emit('errorMsg', 'Only the host can end the round.');

    room.currentRound.imposterRevealed = true;
    const imposterNames = room.imposters.map(i => i.name).join(' & ');
    io.to(code).emit('imposterRevealed', imposterNames);
  });

  socket.on('resetScores', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer?.isHost) return socket.emit('errorMsg', 'Only the host can reset scores.');

    room.players.forEach(p => { p.score = 0; });
    emitRoomUpdated(code);
  });

  socket.on('resetGame', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer?.isHost) return socket.emit('errorMsg', 'Only the host can reset the game.');

    room.gameStarted = false;
    room.imposters = [];
    room.currentRound = null;
    io.to(code).emit('gameReset', { roomCode: code, players: publicPlayers(room) });
  });

  socket.on('leaveRoom', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room) return;

    const index = room.players.findIndex(p => p.id === socket.id);
    if (index === -1) return;

    const removedPlayer = room.players.splice(index, 1)[0];
    clearPlayerDisconnectTimer(code, removedPlayer.playerId);
    socket.leave(code);

    if (room.players.length === 0) {
      deleteRoom(code);
      return;
    }

    if (removedPlayer.isHost && !room.players.some(p => p.isHost)) {
      const nextHost = room.players.find(p => !p.offline) || room.players[0];
      nextHost.isHost = true;
    }

    emitRoomUpdated(code);
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);

      if (!player) continue;

      player.offline = true;
      player.disconnectedAt = Date.now();
      emitRoomUpdated(code);

      clearPlayerDisconnectTimer(code, player.playerId);
      const key = playerTimerKey(code, player.playerId);

      const timer = setTimeout(() => {
        const currentRoom = rooms[code];
        if (!currentRoom) return;

        const currentPlayer = currentRoom.players.find(p => p.playerId === player.playerId);
        if (!currentPlayer || !currentPlayer.offline) return;

        if (currentPlayer.isHost) {
          const nextOnlineHost = currentRoom.players.find(
            p => !p.offline && p.playerId !== currentPlayer.playerId
          );

          if (nextOnlineHost) {
            currentPlayer.isHost = false;
            nextOnlineHost.isHost = true;
          }
        }

        emitRoomUpdated(code);

        if (currentRoom.players.every(p => p.offline)) {
          scheduleRoomCleanup(code);
        }

        playerDisconnectTimers.delete(key);
      }, DISCONNECT_GRACE_MS);

      playerDisconnectTimers.set(key, timer);

      if (room.players.every(p => p.offline)) {
        scheduleRoomCleanup(code);
      }

      break;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
