const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, isHost: true, score: 0 }],
      gameStarted: false,
      imposters: [],
      gameOptions: {}
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) return socket.emit('errorMsg', 'Room not found.');
    if (room.gameStarted) return socket.emit('errorMsg', 'Game has already started.');

    room.players.push({ id: socket.id, name: playerName, isHost: false, score: 0 });
    socket.join(code);
    io.to(code).emit('roomUpdated', { players: room.players });
  });

  socket.on('startGame', ({ roomCode, category, imposterCount, gameMode }) => {
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
    room.gameOptions = { imposterCount, gameMode }; // Save for continue feature

    // Pick TWO distinct words for Hidden Mode, or just one for Standard
    const wordPool = [...categories[category]].sort(() => 0.5 - Math.random());
    const crewmateWord = wordPool[0];
    const hiddenImposterWord = wordPool[1];

    // Shuffle players to pick imposters
    const shuffledPlayers = [...room.players].sort(() => 0.5 - Math.random());
    const imposterIds = shuffledPlayers.slice(0, requestedImposters).map(p => p.id);
    
    // Save imposters to room state for later reveal
    room.imposters = room.players.filter(p => imposterIds.includes(p.id));

    room.players.forEach((player) => {
      const isImposter = imposterIds.includes(player.id);
      
      let roleToSend = '';
      let wordToSend = '';

      if (gameMode === 'hidden') {
        roleToSend = 'Hidden';
        // Imposters get a different valid word, Crewmates get the main word
        wordToSend = isImposter ? hiddenImposterWord : crewmateWord;
      } else {
        roleToSend = isImposter ? 'Imposter' : 'Crewmate';
        wordToSend = isImposter ? 'UNKNOWN' : crewmateWord;
      }

      io.to(player.id).emit('gameStarted', {
        role: roleToSend,
        word: wordToSend,
        category: category.toUpperCase().replace('_', ' '),
        mode: gameMode,
        players: room.players
      });
    });
  });

  socket.on('continueGame', ({ roomCode, pointsData, nextCategory }) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;

    // Update scores based on the host's input
    room.players.forEach(p => {
      if (pointsData[p.id]) {
        p.score += parseInt(pointsData[p.id]) || 0;
      }
    });

    // Determine Category
    let categoryToUse = nextCategory;
    if (categoryToUse === 'random') {
      const catKeys = Object.keys(categories);
      categoryToUse = catKeys[Math.floor(Math.random() * catKeys.length)];
    } else if (!categories[categoryToUse]) {
      return socket.emit('errorMsg', 'Invalid category selected.');
    }

    const requestedImposters = parseInt(room.gameOptions.imposterCount);
    const gameMode = room.gameOptions.gameMode;

    const wordPool = [...categories[categoryToUse]].sort(() => 0.5 - Math.random());
    const crewmateWord = wordPool[0];
    const hiddenImposterWord = wordPool[1];

    const shuffledPlayers = [...room.players].sort(() => 0.5 - Math.random());
    const imposterIds = shuffledPlayers.slice(0, requestedImposters).map(p => p.id);
    
    room.imposters = room.players.filter(p => imposterIds.includes(p.id));

    // Sync updated scores to everyone before starting
    io.to(roomCode.toUpperCase()).emit('roomUpdated', { players: room.players });

    room.players.forEach((player) => {
      const isImposter = imposterIds.includes(player.id);
      let roleToSend = '';
      let wordToSend = '';

      if (gameMode === 'hidden') {
        roleToSend = 'Hidden';
        wordToSend = isImposter ? hiddenImposterWord : crewmateWord;
      } else {
        roleToSend = isImposter ? 'Imposter' : 'Crewmate';
        wordToSend = isImposter ? 'UNKNOWN' : crewmateWord;
      }

      io.to(player.id).emit('gameStarted', {
        role: roleToSend,
        word: wordToSend,
        category: categoryToUse.toUpperCase().replace('_', ' '),
        mode: gameMode,
        players: room.players
      });
    });
  });

  socket.on('revealImposter', (roomCode) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;
    const imposterNames = room.imposters.map(i => i.name).join(' & ');
    io.to(roomCode.toUpperCase()).emit('imposterRevealed', imposterNames);
  });

  socket.on('resetGame', (roomCode) => {
    const room = rooms[roomCode.toUpperCase()];
    if (!room) return;
    room.gameStarted = false;
    room.imposters = [];
    room.players.forEach(p => p.score = 0); // Reset scores when ending the full session
    io.to(roomCode.toUpperCase()).emit('gameReset', { players: room.players });
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const removedPlayer = room.players.splice(index, 1)[0];
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (removedPlayer.isHost) room.players[0].isHost = true;
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
