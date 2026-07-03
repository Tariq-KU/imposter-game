const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000, // Increased to 60 seconds to stop instant mobile drops
  pingInterval: 25000
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

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {

  // Handle Player Reconnections
  socket.on('rejoinRoom', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    
    if (!room) return socket.emit('rejoinFailed');

    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return socket.emit('rejoinFailed');

    // Re-bind the player to their fresh active socket connection
    player.id = socket.id;
    player.offline = false;
    socket.join(code);

    io.to(code).emit('roomUpdated', { players: room.players });

    // Send the correct state based on whether they were mid-game or in the lobby
    if (room.gameStarted && room.currentRound) {
      const isImposter = room.imposters.some(i => i.playerId === playerId);
      const { category, mode, crewmateWord, hiddenImposterWord, imposterRevealed } = room.currentRound;

      let roleToSend = '';
      let wordToSend = '';
      if (mode === 'hidden') {
        roleToSend = 'Hidden';
        wordToSend = isImposter ? hiddenImposterWord : crewmateWord;
      } else {
        roleToSend = isImposter ? 'Imposter' : 'Crewmate';
        wordToSend = isImposter ? 'UNKNOWN' : crewmateWord;
      }

      socket.emit('rejoinGame', {
        players: room.players,
        role: roleToSend,
        word: wordToSend,
        category: category.toUpperCase().replace('_', ' '),
        mode,
        selectedCategories: room.gameOptions.selectedCategories,
        imposterRevealed,
        imposterNames: imposterRevealed ? room.imposters.map(i => i.name).join(' & ') : null
      });
    } else {
      socket.emit('roomCreated', { roomCode: code, players: room.players });
    }
  });

  socket.on('createRoom', ({ name, playerId }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, playerId, name: name, isHost: true, score: 0, offline: false }],
      gameStarted: false,
      imposters: [],
      gameOptions: {},
      currentRound: null
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
  });

  socket.on('joinRoom', ({ roomCode, playerName, playerId }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) return socket.emit('errorMsg', 'Room not found.');

    const existingPlayer = room.players.find(p => p.playerId === playerId);
    if (existingPlayer) {
      existingPlayer.id = socket.id;
      existingPlayer.name = playerName; 
      existingPlayer.offline = false;
      socket.join(code);
      return io.to(code).emit('roomUpdated', { players: room.players });
    }

    if (room.gameStarted) return socket.emit('errorMsg', 'Game has already started.');

    room.players.push({ id: socket.id, playerId, name: playerName, isHost: false, score: 0, offline: false });
    socket.join(code);
    io.to(code).emit('roomUpdated', { players: room.players });
  });

  socket.on('startGame', ({ roomCode, selectedCategories, imposterCount, gameMode }) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;

    const numPlayers = room.players.length;
    const requestedImposters = parseInt(imposterCount);

    if (requestedImposters >= numPlayers) {
      return socket.emit('errorMsg', 'Imposters must be fewer than total players.');
    }
    
    if (!Array.isArray(selectedCategories) || selectedCategories.length === 0) {
      return socket.emit('errorMsg', 'Please select at least one category.');
    }

    // Verify all selected categories are valid
    for (let cat of selectedCategories) {
      if (!categories[cat]) return socket.emit('errorMsg', 'Invalid category selected.');
    }

    // Randomly pick one of the allowed categories chosen by the host
    const categoryToUse = selectedCategories[Math.floor(Math.random() * selectedCategories.length)];

    room.gameStarted = true;
    room.gameOptions = { imposterCount, gameMode, selectedCategories };

    const wordPool = [...categories[categoryToUse]].sort(() => 0.5 - Math.random());
    const crewmateWord = wordPool[0];
    const hiddenImposterWord = wordPool[1];

    const shuffledPlayers = [...room.players].sort(() => 0.5 - Math.random());
    const imposterIds = shuffledPlayers.slice(0, requestedImposters).map(p => p.playerId);
    
    room.imposters = room.players.filter(p => imposterIds.includes(p.playerId));

    room.currentRound = {
      category: categoryToUse,
      mode: gameMode,
      crewmateWord,
      hiddenImposterWord,
      imposterRevealed: false
    };

    room.players.forEach((player) => {
      const isImposter = imposterIds.includes(player.playerId);
      let roleToSend = '';
      let wordToSend = '';

      if (gameMode === 'hidden') {
        roleToSend = 'Hidden';
        wordToSend = isImposter ? hiddenImposterWord : crewmateWord;
      } else {
        roleToSend = isImposter ? 'Imposter' : 'Crewmate';
        wordToSend = isImposter ? 'UNKNOWN' : crewmateWord;
      }

      if (!player.offline) {
        io.to(player.id).emit('gameStarted', {
          role: roleToSend,
          word: wordToSend,
          category: categoryToUse.toUpperCase().replace('_', ' '),
          mode: gameMode,
          selectedCategories: room.gameOptions.selectedCategories,
          players: room.players
        });
      }
    });
  });

  socket.on('continueGame', ({ roomCode, pointsData, nextCategories }) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;

    // Apply points
    room.players.forEach(p => {
      if (pointsData[p.playerId]) p.score += parseInt(pointsData[p.playerId]) || 0;
    });

    if (!Array.isArray(nextCategories) || nextCategories.length === 0) {
      return socket.emit('errorMsg', 'Please select at least one category.');
    }

    for (let cat of nextCategories) {
      if (!categories[cat]) return socket.emit('errorMsg', 'Invalid category selected.');
    }

    // Update settings in case the host changed the checkboxes mid-game
    room.gameOptions.selectedCategories = nextCategories;
    
    const categoryToUse = nextCategories[Math.floor(Math.random() * nextCategories.length)];
    const requestedImposters = parseInt(room.gameOptions.imposterCount);
    const gameMode = room.gameOptions.gameMode;

    const wordPool = [...categories[categoryToUse]].sort(() => 0.5 - Math.random());
    const crewmateWord = wordPool[0];
    const hiddenImposterWord = wordPool[1];

    const shuffledPlayers = [...room.players].sort(() => 0.5 - Math.random());
    const imposterIds = shuffledPlayers.slice(0, requestedImposters).map(p => p.playerId);
    
    room.imposters = room.players.filter(p => imposterIds.includes(p.playerId));

    room.currentRound = {
      category: categoryToUse,
      mode: gameMode,
      crewmateWord,
      hiddenImposterWord,
      imposterRevealed: false
    };

    io.to(roomCode.toUpperCase()).emit('roomUpdated', { players: room.players });

    room.players.forEach((player) => {
      const isImposter = imposterIds.includes(player.playerId);
      let roleToSend = '';
      let wordToSend = '';

      if (gameMode === 'hidden') {
        roleToSend = 'Hidden';
        wordToSend = isImposter ? hiddenImposterWord : crewmateWord;
      } else {
        roleToSend = isImposter ? 'Imposter' : 'Crewmate';
        wordToSend = isImposter ? 'UNKNOWN' : crewmateWord;
      }

      if (!player.offline) {
        io.to(player.id).emit('gameStarted', {
          role: roleToSend,
          word: wordToSend,
          category: categoryToUse.toUpperCase().replace('_', ' '),
          mode: gameMode,
          selectedCategories: room.gameOptions.selectedCategories,
          players: room.players
        });
      }
    });
  });

  socket.on('revealImposter', (roomCode) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;
    room.currentRound.imposterRevealed = true;
    const imposterNames = room.imposters.map(i => i.name).join(' & ');
    io.to(roomCode.toUpperCase()).emit('imposterRevealed', imposterNames);
  });

  socket.on('resetScores', (roomCode) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;
    room.players.forEach(p => p.score = 0);
    io.to(roomCode.toUpperCase()).emit('roomUpdated', { players: room.players });
  });

  socket.on('resetGame', (roomCode) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;
    room.gameStarted = false;
    room.imposters = [];
    room.currentRound = null;
    io.to(roomCode.toUpperCase()).emit('gameReset', { players: room.players });
  });

  socket.on('leaveRoom', (roomCode) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (room) {
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const removedPlayer = room.players.splice(index, 1)[0];
        socket.leave(code);
        
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (removedPlayer.isHost) room.players[0].isHost = true;
          io.to(code).emit('roomUpdated', { players: room.players });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        player.offline = true; 

        const anyOnline = room.players.some(p => !p.offline);
        
        if (!anyOnline) {
          delete rooms[code]; 
        } else {
          if (player.isHost) {
            player.isHost = false;
            const nextOnline = room.players.find(p => !p.offline);
            if (nextOnline) nextOnline.isHost = true;
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
