require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Mobile browsers often pause JavaScript/network activity while the tab is hidden.
// These grace periods prevent a temporary phone background/screen timeout from
// being treated as an intentional leave.
const DISCONNECT_GRACE_MS = 2 * 60 * 1000; // 2 minutes before host handoff
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes before deleting an empty/offline room
const GUESS_WHO_MIN_CHARACTERS = 6;
const GUESS_WHO_DEFAULT_BOARD_SIZE = 24;
const GUESS_WHO_MAX_BOARD_SIZE = 60;
const MAX_CHAT_MESSAGES = 100;
const ADMIN_UPLOAD_PASSWORD = String(process.env.ADMIN_UPLOAD_PASSWORD || '').trim();

const io = new Server(server, {
  pingTimeout: 120000,
  pingInterval: 25000,
  connectionStateRecovery: {
    maxDisconnectionDuration: EMPTY_ROOM_TTL_MS,
    skipMiddlewares: true
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const GUESS_WHO_LIBRARY_FILE = path.join(DATA_DIR, 'guess-who-characters.json');
const GUESS_WHO_LIBRARY_DIR = path.join(__dirname, 'public', 'uploads', 'guess-who-library');
const DEFAULT_GUESS_WHO_FOLDER_ID = 'uncategorized';
const DEFAULT_GUESS_WHO_FOLDER_NAME = 'Uncategorized';

function ensureDirectorySync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDirectorySync(DATA_DIR);
ensureDirectorySync(GUESS_WHO_LIBRARY_DIR);
if (!fs.existsSync(GUESS_WHO_LIBRARY_FILE)) {
  fs.writeFileSync(GUESS_WHO_LIBRARY_FILE, JSON.stringify({ folders: [{ id: DEFAULT_GUESS_WHO_FOLDER_ID, name: DEFAULT_GUESS_WHO_FOLDER_NAME, createdAt: new Date().toISOString() }], characters: [] }, null, 2), 'utf8');
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Expanded Game Categories Data
const categories = {
  anime: [
    // Demon Slayer
    "Tanjiro Kamado", "Nezuko Kamado", "Zenitsu Agatsuma", "Inosuke Hashibira",
    "Kanao Tsuyuri", "Genya Shinazugawa", "Giyu Tomioka", "Kyojuro Rengoku",
    "Tengen Uzui", "Muichiro Tokito", "Mitsuri Kanroji", "Obanai Iguro",
    "Sanemi Shinazugawa", "Gyomei Himejima", "Shinobu Kocho", "Kanae Kocho",
    "Sakonji Urokodaki", "Jigoro Kuwajima", "Kagaya Ubuyashiki", "Amane Ubuyashiki",
    "Aoi Kanzaki", "Hotaru Haganezuka", "Kozo Kanamori", "Kotetsu",
    "Yushiro", "Tamayo", "Muzan Kibutsuji", "Kokushibo",
    "Doma", "Akaza", "Hantengu", "Gyokko",
    "Daki", "Gyutaro", "Kaigaku", "Enmu",
    "Rui", "Kyogai", "Susamaru", "Yahaba",
    "Sabito", "Makomo", "Murata", "Senjuro Rengoku",
    "Shinjuro Rengoku", "Tanjuro Kamado", "Kie Kamado", "Hinatsuru",
    "Makio", "Suma", "Nakime",

    // Attack on Titan
    "Eren Yeager", "Mikasa Ackerman", "Armin Arlert", "Levi Ackerman",
    "Erwin Smith", "Reiner Braun", "Annie Leonhart", "Bertholdt Hoover",
    "Hange Zoe", "Zeke Yeager", "Historia Reiss", "Jean Kirstein",
    "Sasha Blouse", "Connie Springer", "Pieck Finger", "Porco Galliard",
    "Falco Grice", "Gabi Braun", "Ymir", "Ymir Fritz",
    "Kenny Ackerman", "Rod Reiss", "Grisha Yeager", "Carla Yeager",
    "Faye Yeager", "Dina Fritz", "Eren Kruger", "Keith Shadis",
    "Floch Forster", "Hannes", "Marco Bodt", "Dot Pixis",
    "Nile Dok", "Hitch Dreyse", "Marlo Freudenberg", "Moblit Berner",
    "Onyankopon", "Yelena", "Niccolo", "Willy Tybur",
    "Lara Tybur", "Theo Magath", "Colt Grice", "Marcel Galliard",
    "Mina Carolina", "Thomas Wagner", "Samuel Linke-Jackson"
  ],
  marvel_dc: [
    "Batman", "Superman", "Spider-Man", "Iron Man", "Wonder Woman",
    "Captain America", "Thor", "Hulk", "Black Widow", "The Flash",
    "Aquaman", "Green Lantern", "Wolverine", "Deadpool", "Doctor Strange",
    "Black Panther", "Ant-Man", "The Wasp", "Scarlet Witch", "Vision",
    "Loki", "Thanos", "Joker", "Harley Quinn", "Lex Luthor",
    "Darkseid", "Magneto", "Professor X", "Daredevil", "The Punisher",
    "Venom", "Catwoman", "Robin", "Nightwing", "Batgirl",
    "The Riddler", "The Penguin", "Two-Face", "Bane", "Poison Ivy",
    "Green Arrow", "Supergirl", "Shazam", "Cyborg", "Martian Manhunter",
    "Hawkgirl", "Zatanna", "John Constantine", "Doctor Fate", "Black Adam",
    "Brainiac", "Doomsday", "Deathstroke", "Starfire", "Raven",
    "Beast Boy", "Gamora", "Star-Lord", "Rocket Raccoon", "Groot",
    "Drax", "Mantis", "Nebula", "Falcon", "Winter Soldier",
    "War Machine", "Hawkeye", "Nick Fury", "Captain Marvel", "Moon Knight",
    "She-Hulk", "Ms. Marvel", "Shang-Chi", "Silver Surfer", "Galactus",
    "Green Goblin", "Doctor Octopus", "Sandman", "Mysterio", "Kingpin",
    "Elektra", "Ghost Rider", "Blade", "Cyclops", "Jean Grey",
    "Storm", "Beast", "Rogue", "Gambit", "Mystique",
    "Sabretooth", "Juggernaut", "Red Skull", "Ultron", "Doctor Doom"
  ],
  food: [
    "Sushi", "Shawarma", "Burger", "Pizza", "Tacos",
    "Biryani", "Ramen", "Steak", "Falafel", "Gelato",
    "Croissant", "Pad Thai", "Lasagna", "Dim Sum", "Kebab",
    "Fried Chicken", "Paella", "Burrito", "Mac and Cheese", "Pho",
    "Butter Chicken", "Peking Duck", "Fish and Chips", "Hummus", "Tiramisu",
    "Churros", "Cheesecake", "Pancakes", "Waffles", "Curry",
    "Mansaf", "Kabsa", "Mandi", "Machboos", "Koshari",
    "Fattoush", "Tabbouleh", "Baba Ganoush", "Manakish", "Knafeh",
    "Baklava", "Umm Ali", "Luqaimat", "Bibimbap", "Kimchi",
    "Korean BBQ", "Dumplings", "Spring Rolls", "Poke Bowl", "Risotto",
    "Gnocchi", "Carbonara", "Bolognese", "Lobster Roll", "Clam Chowder",
    "Jollof Rice", "Arepas", "Empanadas", "Quesadilla", "Nachos",
    "Hot Dog", "Donut", "Brownie", "Apple Pie", "Creme Brulee",
    "Mochi", "Crepe", "French Toast", "Caesar Salad", "Greek Salad"
  ],
  animals: [
    "Dog", "Cat", "Horse", "Cow", "Sheep",
    "Goat", "Pig", "Chicken", "Duck", "Rabbit",
    "Mouse", "Rat", "Hamster", "Guinea Pig", "Donkey",
    "Camel", "Deer", "Moose", "Bear", "Wolf",
    "Fox", "Lion", "Tiger", "Leopard", "Cheetah",
    "Elephant", "Giraffe", "Zebra", "Rhino", "Hippo",
    "Monkey", "Gorilla", "Chimpanzee", "Panda", "Koala",
    "Kangaroo", "Sloth", "Otter", "Raccoon", "Squirrel",
    "Hedgehog", "Bat", "Eagle", "Owl", "Parrot",
    "Penguin", "Flamingo", "Peacock", "Swan", "Turkey",
    "Snake", "Crocodile", "Alligator", "Turtle", "Frog",
    "Lizard", "Chameleon", "Shark", "Dolphin", "Whale",
    "Octopus", "Crab", "Lobster", "Jellyfish", "Starfish",
    "Bee", "Butterfly", "Spider", "Scorpion", "Ant"
  ],
  professions: [
    "Neurosurgeon", "Astronaut", "Firefighter", "Pilot", "Chef",
    "Lawyer", "Software Engineer", "Artist", "Journalist", "Private Investigator",
    "Architect", "Dentist", "Detective", "Pharmacist", "Plumber",
    "Electrician", "Veterinarian", "Mechanic", "Scientist", "Teacher",
    "Actor", "Musician", "Photographer", "Writer", "Accountant",
    "Psychologist", "Police Officer", "Paramedic", "Judge", "Magician",
    "Civil Engineer", "Data Scientist", "Cybersecurity Analyst", "Game Developer", "UX Designer",
    "Product Manager", "Entrepreneur", "Real Estate Agent", "Interior Designer", "Fashion Designer",
    "Barber", "Hair Stylist", "Makeup Artist", "Fitness Trainer", "Nutritionist",
    "Surgeon", "Nurse", "Radiologist", "Marine Biologist", "Archaeologist",
    "Historian", "Economist", "Translator", "Diplomat", "Politician",
    "News Anchor", "Film Director", "Producer", "Stunt Performer", "Voice Actor",
    "Baker", "Butcher", "Farmer", "Fisherman", "Flight Attendant",
    "Air Traffic Controller", "Librarian", "Professor", "School Principal", "Security Guard",
    "Personal Trainer", "Social Worker", "Therapist", "Banker", "Stock Trader"
  ],
  irl_people: [
    "Cristiano Ronaldo", "Lionel Messi", "Elon Musk", "Barack Obama",
    "Gordon Ramsay", "LeBron James", "Taylor Swift", "Tom Cruise",
    "Nelson Mandela", "Albert Einstein", "Serena Williams", "Michael Jordan",
    "Bill Gates", "Mark Zuckerberg", "Dwayne 'The Rock' Johnson", "Leonardo DiCaprio",
    "Keanu Reeves", "Will Smith", "Jackie Chan", "David Beckham",
    "Usain Bolt", "Muhammad Ali", "Abraham Lincoln", "Winston Churchill",
    "Marilyn Monroe", "Oprah Winfrey", "Queen Elizabeth II", "Virat Kohli",
    "Roger Federer", "Rafael Nadal", "Charlie Kirk", "Kim Jong Un",
    "Donald Trump", "Tom Holland", "Chris Hemsworth", "Robert Downey Jr.",
    "Neymar Jr.", "Kylian Mbappe", "Erling Haaland", "Zinedine Zidane",
    "Kobe Bryant", "Stephen Curry", "Shaquille O'Neal", "Mike Tyson",
    "Conor McGregor", "Lewis Hamilton", "Max Verstappen", "Tiger Woods",
    "Michael Phelps", "Simone Biles", "Naomi Osaka", "Beyonce",
    "Rihanna", "Ariana Grande", "Drake", "Eminem",
    "The Weeknd", "Billie Eilish", "MrBeast", "PewDiePie",
    "Ryan Reynolds", "Hugh Jackman", "Chris Evans", "Scarlett Johansson",
    "Zendaya", "Emma Watson", "Jennifer Lawrence", "Angelina Jolie",
    "Brad Pitt", "Johnny Depp", "Morgan Freeman", "Samuel L. Jackson",
    "Steven Spielberg", "Christopher Nolan", "Martin Scorsese", "Quentin Tarantino",
    "Steve Jobs", "Jeff Bezos", "Warren Buffett", "Mark Cuban",
    "Greta Thunberg", "Malala Yousafzai", "Neil Armstrong", "Marie Curie",
    "Isaac Newton", "Nikola Tesla", "Stephen Hawking", "Pablo Picasso"
  ]
};

const rooms = {};
const guessWhoRooms = {};
const playerDisconnectTimers = new Map();
const roomCleanupTimers = new Map();
const guessWhoDisconnectTimers = new Map();
const guessWhoRoomCleanupTimers = new Map();

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function roomCodeExists(code) {
  return Boolean(rooms[code] || guessWhoRooms[code]);
}

function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (roomCodeExists(code));
  return code;
}

function playerTimerKey(code, playerId) {
  return `${code}:${playerId}`;
}

function clearTimerFromMap(timerMap, key) {
  const timer = timerMap.get(key);
  if (timer) {
    clearTimeout(timer);
    timerMap.delete(key);
  }
}

function clearPlayerDisconnectTimer(code, playerId) {
  clearTimerFromMap(playerDisconnectTimers, playerTimerKey(code, playerId));
}

function clearRoomCleanupTimer(code) {
  clearTimerFromMap(roomCleanupTimers, code);
}

function clearRoomTimers(code) {
  clearRoomCleanupTimer(code);

  for (const key of playerDisconnectTimers.keys()) {
    if (key.startsWith(`${code}:`)) {
      clearTimerFromMap(playerDisconnectTimers, key);
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
    imposterNames: imposterRevealed ? room.imposters.map(i => i.name).join(' & ') : null,
    isCurrentPlayerImposter: imposterRevealed ? isImposter : false,
    revealedCrewmateWord: imposterRevealed && isImposter ? crewmateWord : null
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
}

function sendRoundAssignments(room) {
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

// --------------------------
// Guess Who character library
// --------------------------
const allowedImageMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif']
]);

const blockedImageMimeTypes = new Set(['image/heic', 'image/heif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 120,
    fileSize: 8 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (blockedImageMimeTypes.has(file.mimetype)) {
      cb(new Error('HEIC/HEIF photos are not browser-friendly here. Please upload JPG, PNG, WEBP, GIF, or AVIF images.'));
      return;
    }

    if (!allowedImageMimeTypes.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, WEBP, GIF, and AVIF images are allowed.'));
      return;
    }

    cb(null, true);
  }
});

function requireAdminPassword(req, res, next) {
  if (!ADMIN_UPLOAD_PASSWORD) {
    return res.status(503).json({
      message: 'Admin uploads are disabled. Set ADMIN_UPLOAD_PASSWORD in your environment first.'
    });
  }

  const suppliedPassword = String(req.get('x-admin-password') || req.body?.adminPassword || '').trim();
  if (suppliedPassword !== ADMIN_UPLOAD_PASSWORD) {
    return res.status(401).json({ message: 'Invalid admin password.' });
  }

  next();
}

function createDefaultGuessWhoFolder() {
  return {
    id: DEFAULT_GUESS_WHO_FOLDER_ID,
    name: DEFAULT_GUESS_WHO_FOLDER_NAME,
    createdAt: new Date().toISOString()
  };
}

function publicGuessWhoFolder(folder, characters = []) {
  const characterCount = characters.filter(character => character.folderId === folder.id).length;
  return {
    id: folder.id,
    name: normalizeCharacterDisplayName(folder.name),
    characterCount
  };
}

function normalizeGuessWhoLibraryData(rawData) {
  let folders = [];
  let characters = [];

  if (Array.isArray(rawData)) {
    folders = [createDefaultGuessWhoFolder()];
    characters = rawData.map(character => ({
      ...character,
      folderId: character.folderId || DEFAULT_GUESS_WHO_FOLDER_ID
    }));
  } else if (rawData && typeof rawData === 'object') {
    folders = Array.isArray(rawData.folders) ? rawData.folders : [];
    characters = Array.isArray(rawData.characters) ? rawData.characters : [];
  }

  const folderMap = new Map();
  folders.forEach(folder => {
    const name = normalizeCharacterDisplayName(folder?.name || DEFAULT_GUESS_WHO_FOLDER_NAME);
    const baseId = slugify(folder?.id || name || DEFAULT_GUESS_WHO_FOLDER_ID);
    const id = baseId || DEFAULT_GUESS_WHO_FOLDER_ID;

    if (!folderMap.has(id)) {
      folderMap.set(id, {
        id,
        name,
        createdAt: folder?.createdAt || new Date().toISOString()
      });
    }
  });

  if (characters.length > 0 && folderMap.size === 0) {
    folderMap.set(DEFAULT_GUESS_WHO_FOLDER_ID, createDefaultGuessWhoFolder());
  }

  const normalizedFolders = [...folderMap.values()].sort((a, b) => {
    if (a.id === DEFAULT_GUESS_WHO_FOLDER_ID) return -1;
    if (b.id === DEFAULT_GUESS_WHO_FOLDER_ID) return 1;
    return normalizeCharacterDisplayName(a.name).localeCompare(
      normalizeCharacterDisplayName(b.name),
      undefined,
      { sensitivity: 'base' }
    );
  });

  const folderIds = new Set(normalizedFolders.map(folder => folder.id));
  const characterIds = new Set();
  const normalizedCharacters = [];

  characters.forEach(character => {
    const originalId = String(character?.id || '').trim();
    const name = normalizeCharacterDisplayName(character?.name || originalId || 'Unknown Character');
    const baseId = slugify(originalId || name);
    const id = uniqueId(baseId, characterIds);
    const fallbackFolderId = normalizedFolders[0]?.id || DEFAULT_GUESS_WHO_FOLDER_ID;
    const folderId = folderIds.has(character?.folderId) ? character.folderId : fallbackFolderId;

    normalizedCharacters.push({
      ...character,
      id,
      name,
      folderId,
      imageUrl: character?.imageUrl || '',
      fileName: character?.fileName || '',
      relativePath: character?.relativePath || character?.fileName || '',
      createdAt: character?.createdAt || new Date().toISOString()
    });
  });

  return {
    folders: normalizedFolders,
    characters: normalizedCharacters
  };
}

async function readGuessWhoLibraryData() {
  try {
    const raw = await fsp.readFile(GUESS_WHO_LIBRARY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeGuessWhoLibraryData(parsed);
  } catch (error) {
    return normalizeGuessWhoLibraryData({ folders: [createDefaultGuessWhoFolder()], characters: [] });
  }
}

async function writeGuessWhoLibraryData(libraryData) {
  const normalized = normalizeGuessWhoLibraryData(libraryData);
  const folderNameById = new Map(normalized.folders.map(folder => [folder.id, folder.name]));

  const sortedCharacters = [...normalized.characters].sort((a, b) => {
    const folderCompare = normalizeCharacterDisplayName(folderNameById.get(a.folderId) || '').localeCompare(
      normalizeCharacterDisplayName(folderNameById.get(b.folderId) || ''),
      undefined,
      { sensitivity: 'base' }
    );

    if (folderCompare !== 0) return folderCompare;

    return normalizeCharacterDisplayName(a.name).localeCompare(
      normalizeCharacterDisplayName(b.name),
      undefined,
      { sensitivity: 'base' }
    );
  });

  const dataToSave = {
    folders: normalized.folders,
    characters: sortedCharacters
  };

  await fsp.writeFile(GUESS_WHO_LIBRARY_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
  return dataToSave;
}

async function readGuessWhoLibrary() {
  const libraryData = await readGuessWhoLibraryData();
  return libraryData.characters;
}

async function writeGuessWhoLibrary(characters) {
  const existing = await readGuessWhoLibraryData();
  const saved = await writeGuessWhoLibraryData({
    folders: existing.folders,
    characters
  });
  return saved.characters;
}

function buildGuessWhoLibraryPayload(libraryData) {
  const normalized = normalizeGuessWhoLibraryData(libraryData);
  const folderNameById = new Map(normalized.folders.map(folder => [folder.id, folder.name]));

  const publicCharacters = normalized.characters.map(character => publicGuessWhoCharacter({
    ...character,
    folderName: folderNameById.get(character.folderId) || DEFAULT_GUESS_WHO_FOLDER_NAME
  }));

  return {
    folders: normalized.folders.map(folder => publicGuessWhoFolder(folder, normalized.characters)),
    characters: publicCharacters
  };
}

function decodeLikelyMojibake(text) {
  const value = String(text || '');
  const hasArabic = /[\u0600-\u06FF]/.test(value);
  const looksMojibake = /[ÃÂØÙÐÑ]/.test(value);

  if (hasArabic || !looksMojibake) return value;

  try {
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    if (/[\u0600-\u06FF]/.test(decoded) && !decoded.includes('�')) {
      return decoded;
    }
  } catch (error) {
    // Keep the original value if decoding fails.
  }

  return value;
}

function titleCaseDisplayName(text) {
  return String(text || '').replace(/[\p{L}\p{M}\p{N}'’.]+/gu, word => {
    // Arabic and other scripts without casing should be left exactly as typed.
    if (!/[A-Za-z]/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function normalizeCharacterDisplayName(name) {
  return decodeLikelyMojibake(name)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown Character';
}

function characterNameFromFileName(fileName) {
  const decodedFileName = decodeLikelyMojibake(fileName);
  const baseName = path.basename(decodedFileName, path.extname(decodedFileName));
  const spaced = normalizeCharacterDisplayName(baseName);

  if (!spaced) return 'Unknown Character';

  return titleCaseDisplayName(spaced);
}

function shortHash(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 10);
}

function slugify(text) {
  const asciiSlug = String(text || 'character')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return asciiSlug || `character-${shortHash(text)}`;
}

function uniqueId(baseId, existingIds) {
  let id = baseId;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  existingIds.add(id);
  return id;
}

function publicGuessWhoCharacter(character) {
  return {
    id: character.id,
    name: normalizeCharacterDisplayName(character.name),
    imageUrl: character.imageUrl,
    folderId: character.folderId || DEFAULT_GUESS_WHO_FOLDER_ID,
    folderName: normalizeCharacterDisplayName(character.folderName || DEFAULT_GUESS_WHO_FOLDER_NAME)
  };
}

app.get('/api/guess-who/characters', async (req, res) => {
  const libraryData = await readGuessWhoLibraryData();
  res.json(buildGuessWhoLibraryPayload(libraryData));
});

app.post('/api/admin/guess-who/folders', requireAdminPassword, async (req, res) => {
  const name = normalizeCharacterDisplayName(req.body?.name || '');
  if (!name) return res.status(400).json({ message: 'Enter a folder name.' });

  const libraryData = await readGuessWhoLibraryData();
  const existingIds = new Set(libraryData.folders.map(folder => folder.id));
  const id = uniqueId(slugify(name), existingIds);

  libraryData.folders.push({
    id,
    name,
    createdAt: new Date().toISOString()
  });

  const saved = await writeGuessWhoLibraryData(libraryData);
  res.json(buildGuessWhoLibraryPayload(saved));
});

app.patch('/api/admin/guess-who/folders/:id', requireAdminPassword, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const name = normalizeCharacterDisplayName(req.body?.name || '');

  if (!name) return res.status(400).json({ message: 'Enter a new folder name.' });

  const libraryData = await readGuessWhoLibraryData();
  const folder = libraryData.folders.find(item => item.id === id);
  if (!folder) return res.status(404).json({ message: 'Folder not found.' });

  folder.name = name;
  folder.updatedAt = new Date().toISOString();

  const saved = await writeGuessWhoLibraryData(libraryData);
  res.json(buildGuessWhoLibraryPayload(saved));
});

async function removeGuessWhoCharacterFile(character) {
  const relativePath = character.relativePath || character.fileName;
  if (!relativePath) return;

  const safeLibraryDir = path.resolve(GUESS_WHO_LIBRARY_DIR);
  const storedPath = path.resolve(GUESS_WHO_LIBRARY_DIR, relativePath);
  if (storedPath.startsWith(`${safeLibraryDir}${path.sep}`)) {
    await fsp.rm(storedPath, { force: true });
  }
}

app.delete('/api/admin/guess-who/folders/:id', requireAdminPassword, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const libraryData = await readGuessWhoLibraryData();
  const folder = libraryData.folders.find(item => item.id === id);

  if (!folder) return res.status(404).json({ message: 'Folder not found.' });

  const charactersToDelete = libraryData.characters.filter(character => character.folderId === id);
  libraryData.characters = libraryData.characters.filter(character => character.folderId !== id);
  libraryData.folders = libraryData.folders.filter(item => item.id !== id);

  for (const character of charactersToDelete) {
    await removeGuessWhoCharacterFile(character);
  }

  await fsp.rm(path.join(GUESS_WHO_LIBRARY_DIR, id), { recursive: true, force: true });

  const saved = await writeGuessWhoLibraryData(libraryData);
  res.json(buildGuessWhoLibraryPayload(saved));
});

app.post('/api/admin/guess-who/upload', requireAdminPassword, (req, res, next) => {
  upload.array('images', 120)(req, res, err => {
    if (!err) return next();

    let message = err.message || 'Upload failed.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'One or more images are too large. Each image must be 8 MB or smaller.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many images selected. Upload 120 images or fewer at a time.';
    }

    return res.status(400).json({ message });
  });
}, async (req, res) => {
  try {
    ensureDirectorySync(GUESS_WHO_LIBRARY_DIR);

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'Please choose at least one image.' });
    }

    const libraryData = await readGuessWhoLibraryData();
    const requestedFolderId = String(req.body?.folderId || '').trim();
    const folder = libraryData.folders.find(item => item.id === requestedFolderId);

    if (!folder) {
      return res.status(400).json({ message: 'Create or choose a folder before uploading.' });
    }

    const folderDir = path.join(GUESS_WHO_LIBRARY_DIR, folder.id);
    ensureDirectorySync(folderDir);

    const existingIds = new Set(libraryData.characters.map(character => character.id));
    const added = [];

    for (const file of files) {
      const name = characterNameFromFileName(file.originalname);
      const baseId = slugify(`${folder.id}-${name}`);
      const id = uniqueId(baseId, existingIds);
      const extension = allowedImageMimeTypes.get(file.mimetype);
      const storedFileName = `${id}${extension}`;
      const relativePath = `${folder.id}/${storedFileName}`;
      const storedPath = path.join(GUESS_WHO_LIBRARY_DIR, relativePath);

      await fsp.writeFile(storedPath, file.buffer);

      const character = {
        id,
        name,
        folderId: folder.id,
        imageUrl: `/uploads/guess-who-library/${relativePath}`,
        fileName: storedFileName,
        relativePath,
        createdAt: new Date().toISOString()
      };

      libraryData.characters.push(character);
      added.push(publicGuessWhoCharacter({ ...character, folderName: folder.name }));
    }

    const saved = await writeGuessWhoLibraryData(libraryData);
    const payload = buildGuessWhoLibraryPayload(saved);
    res.json({
      added,
      ...payload
    });
  } catch (error) {
    console.error('Guess Who upload failed:', error);
    res.status(500).json({
      message: 'Upload failed while saving the images. Check server permissions/storage and try again.'
    });
  }
});

app.delete('/api/admin/guess-who/characters', requireAdminPassword, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map(id => String(id || '').trim()).filter(Boolean))]
    : [];

  if (ids.length === 0) {
    return res.status(400).json({ message: 'Select at least one character to delete.' });
  }

  const idSet = new Set(ids);
  const libraryData = await readGuessWhoLibraryData();
  const charactersToDelete = libraryData.characters.filter(item => idSet.has(item.id));

  if (charactersToDelete.length === 0) {
    return res.status(404).json({ message: 'No selected characters were found.' });
  }

  libraryData.characters = libraryData.characters.filter(item => !idSet.has(item.id));
  await writeGuessWhoLibraryData(libraryData);

  for (const character of charactersToDelete) {
    await removeGuessWhoCharacterFile(character);
  }

  const saved = await readGuessWhoLibraryData();
  res.json({
    deletedCount: charactersToDelete.length,
    ...buildGuessWhoLibraryPayload(saved)
  });
});

app.delete('/api/admin/guess-who/characters/:id', requireAdminPassword, async (req, res) => {
  const id = String(req.params.id || '');
  const libraryData = await readGuessWhoLibraryData();
  const character = libraryData.characters.find(item => item.id === id);

  if (!character) {
    return res.status(404).json({ message: 'Character not found.' });
  }

  libraryData.characters = libraryData.characters.filter(item => item.id !== id);
  await writeGuessWhoLibraryData(libraryData);
  await removeGuessWhoCharacterFile(character);

  const saved = await readGuessWhoLibraryData();
  res.json(buildGuessWhoLibraryPayload(saved));
});

// --------------------------
// Guess Who game helpers
// --------------------------
function guessWhoChannel(code) {
  return `guess-who:${code}`;
}

function guessWhoTimerKey(code, playerId) {
  return `${code}:${playerId}`;
}

function clearGuessWhoPlayerTimer(code, playerId) {
  clearTimerFromMap(guessWhoDisconnectTimers, guessWhoTimerKey(code, playerId));
}

function clearGuessWhoRoomCleanupTimer(code) {
  clearTimerFromMap(guessWhoRoomCleanupTimers, code);
}

function clearGuessWhoRoomTimers(code) {
  clearGuessWhoRoomCleanupTimer(code);

  for (const key of guessWhoDisconnectTimers.keys()) {
    if (key.startsWith(`${code}:`)) {
      clearTimerFromMap(guessWhoDisconnectTimers, key);
    }
  }
}

function deleteGuessWhoRoom(code) {
  clearGuessWhoRoomTimers(code);
  delete guessWhoRooms[code];
}

function scheduleGuessWhoRoomCleanup(code) {
  if (guessWhoRoomCleanupTimers.has(code)) return;

  const timer = setTimeout(() => {
    const room = guessWhoRooms[code];
    if (!room) return;

    if (room.players.every(player => player.offline)) {
      deleteGuessWhoRoom(code);
      return;
    }

    guessWhoRoomCleanupTimers.delete(code);
  }, EMPTY_ROOM_TTL_MS);

  guessWhoRoomCleanupTimers.set(code, timer);
}

function publicGuessWhoPlayers(room) {
  return room.players.map(player => ({
    id: player.id,
    playerId: player.playerId,
    name: player.name,
    isHost: player.isHost,
    score: player.score || 0,
    offline: Boolean(player.offline),
    hasSelected: Boolean(player.selectedCharacterId)
  }));
}

function findGuessWhoCharacter(room, characterId) {
  return room.board.find(character => character.id === characterId) || null;
}

function buildGuessWhoState(room, playerId) {
  const me = room.players.find(player => player.playerId === playerId);
  const mySecret = me?.selectedCharacterId ? findGuessWhoCharacter(room, me.selectedCharacterId) : null;
  const revealedSecrets = room.status === 'revealed'
    ? room.players.map(player => ({
      playerId: player.playerId,
      name: player.name,
      character: player.selectedCharacterId ? findGuessWhoCharacter(room, player.selectedCharacterId) : null
    }))
    : [];

  return {
    gameType: 'guessWho',
    roomCode: room.code,
    status: room.status,
    roundId: room.roundId,
    players: publicGuessWhoPlayers(room),
    board: room.board,
    messages: room.messages,
    mySecret,
    revealedSecrets,
    isHost: Boolean(me?.isHost)
  };
}

function sendGuessWhoState(socket, room, playerId) {
  socket.emit('gwState', buildGuessWhoState(room, playerId));
}

function emitGuessWhoState(code) {
  const room = guessWhoRooms[code];
  if (!room) return;

  room.players.forEach(player => {
    if (!player.offline) {
      io.to(player.id).emit('gwState', buildGuessWhoState(room, player.playerId));
    }
  });
}

function attachGuessWhoPlayerToSocket(socket, code, playerId, name, boardCapacity) {
  const room = guessWhoRooms[code];
  if (!room || !playerId) return false;

  const player = room.players.find(p => p.playerId === playerId);
  if (!player) return false;

  clearGuessWhoPlayerTimer(code, playerId);
  clearGuessWhoRoomCleanupTimer(code);

  player.id = socket.id;
  player.offline = false;
  player.disconnectedAt = null;
  if (name) player.name = name;
  if (boardCapacity) player.boardCapacity = clampGuessWhoBoardCapacity(boardCapacity);

  socket.join(guessWhoChannel(code));
  emitGuessWhoState(code);
  sendGuessWhoState(socket, room, playerId);
  return true;
}

function addGuessWhoSystemMessage(room, text) {
  room.messages.push({
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    playerId: 'system',
    name: 'System',
    text,
    timestamp: Date.now(),
    system: true
  });

  room.messages = room.messages.slice(-MAX_CHAT_MESSAGES);
}

function clampGuessWhoBoardSize(requestedSize, libraryLength) {
  const parsed = parseInt(requestedSize, 10);
  const wanted = Number.isInteger(parsed) ? parsed : GUESS_WHO_DEFAULT_BOARD_SIZE;
  return Math.max(
    GUESS_WHO_MIN_CHARACTERS,
    Math.min(wanted, GUESS_WHO_MAX_BOARD_SIZE, libraryLength)
  );
}

function sampleCharacters(characters, amount) {
  return [...characters]
    .sort(() => 0.5 - Math.random())
    .slice(0, amount)
    .map(publicGuessWhoCharacter);
}

function clampGuessWhoBoardCapacity(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed)) return GUESS_WHO_DEFAULT_BOARD_SIZE;
  return Math.max(GUESS_WHO_MIN_CHARACTERS, Math.min(parsed, GUESS_WHO_MAX_BOARD_SIZE));
}

function getAutoGuessWhoBoardSize(room, libraryLength) {
  const onlineCapacities = room.players
    .filter(player => !player.offline)
    .map(player => clampGuessWhoBoardCapacity(player.boardCapacity))
    .filter(Number.isInteger);

  const safestCapacity = onlineCapacities.length > 0
    ? Math.min(...onlineCapacities)
    : GUESS_WHO_DEFAULT_BOARD_SIZE;

  return Math.max(
    GUESS_WHO_MIN_CHARACTERS,
    Math.min(safestCapacity, GUESS_WHO_MAX_BOARD_SIZE, libraryLength)
  );
}

function getSelectedGuessWhoCharacters(library, selectedCharacterIds) {
  if (!Array.isArray(selectedCharacterIds)) return [];

  const libraryById = new Map(library.map(character => [character.id, character]));
  const seen = new Set();
  const selected = [];

  selectedCharacterIds.forEach(id => {
    const cleanId = String(id || '').trim();
    if (!cleanId || seen.has(cleanId)) return;

    const character = libraryById.get(cleanId);
    if (!character) return;

    seen.add(cleanId);
    selected.push(character);
  });

  return selected;
}

function getGuessWhoRandomSourceCharacters(libraryData, selectedFolderIds) {
  const library = libraryData.characters;
  const validFolderIds = new Set(libraryData.folders.map(folder => folder.id));

  if (!Array.isArray(selectedFolderIds)) {
    return {
      selectedFolderIds: libraryData.folders.map(folder => folder.id),
      characters: library
    };
  }

  const cleanFolderIds = [...new Set(selectedFolderIds
    .map(id => String(id || '').trim())
    .filter(id => validFolderIds.has(id)))];

  if (cleanFolderIds.length === 0) {
    throw new Error('Select at least one character folder for the random board.');
  }

  const folderIdSet = new Set(cleanFolderIds);
  return {
    selectedFolderIds: cleanFolderIds,
    characters: library.filter(character => folderIdSet.has(character.folderId || DEFAULT_GUESS_WHO_FOLDER_ID))
  };
}

async function prepareGuessWhoRound(room, options = {}) {
  const libraryData = await readGuessWhoLibraryData();
  const library = libraryData.characters;
  if (library.length < GUESS_WHO_MIN_CHARACTERS) {
    throw new Error(`Upload at least ${GUESS_WHO_MIN_CHARACTERS} Guess Who characters before starting.`);
  }

  const selectionMode = options.selectionMode === 'selected' ? 'selected' : 'random';

  if (selectionMode === 'selected') {
    const selectedCharacters = getSelectedGuessWhoCharacters(library, options.selectedCharacterIds);

    if (selectedCharacters.length < GUESS_WHO_MIN_CHARACTERS) {
      throw new Error(`Select at least ${GUESS_WHO_MIN_CHARACTERS} characters for the Guess Who board.`);
    }

    if (selectedCharacters.length > GUESS_WHO_MAX_BOARD_SIZE) {
      throw new Error(`Please select ${GUESS_WHO_MAX_BOARD_SIZE} characters or fewer.`);
    }

    room.selectedFolderIds = [];
    room.board = selectedCharacters.map(publicGuessWhoCharacter);
  } else {
    const source = getGuessWhoRandomSourceCharacters(libraryData, options.selectedFolderIds);

    if (source.characters.length < GUESS_WHO_MIN_CHARACTERS) {
      throw new Error(`The selected folder(s) only have ${source.characters.length} character(s). Select folders with at least ${GUESS_WHO_MIN_CHARACTERS} total characters.`);
    }

    const size = options.autoFit
      ? getAutoGuessWhoBoardSize(room, source.characters.length)
      : clampGuessWhoBoardSize(options.boardSize, source.characters.length);

    room.selectedFolderIds = source.selectedFolderIds;
    room.board = sampleCharacters(source.characters, size);
  }

  room.status = 'selecting';
  room.roundId += 1;
  room.messages = [];
  room.players.forEach(player => {
    player.selectedCharacterId = null;
  });
  addGuessWhoSystemMessage(room, `Round ${room.roundId} started with ${room.board.length} characters. Pick your secret character.`);
}

function awardGuessWhoPoints(room, pointsData = {}) {
  room.players.forEach(player => {
    if (Object.prototype.hasOwnProperty.call(pointsData, player.playerId)) {
      player.score += parseInt(pointsData[player.playerId], 10) || 0;
    }
  });
}

function getPlayerBySocket(room, socketId) {
  return room.players.find(player => player.id === socketId);
}

function requireGuessWhoHost(socket, room) {
  const player = getPlayerBySocket(room, socket.id);
  return Boolean(player?.isHost);
}

// --------------------------
// Socket events
// --------------------------
io.on('connection', (socket) => {
  // ----- Imposter Game -----
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

    pickRound(room, selectedCategories);
    sendRoundAssignments(room);
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
    pickRound(room, nextCategories);

    emitRoomUpdated(code);
    sendRoundAssignments(room);
  });

  socket.on('revealImposter', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = rooms[code];
    if (!room || !room.currentRound) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer?.isHost) return socket.emit('errorMsg', 'Only the host can end the round.');

    room.currentRound.imposterRevealed = true;
    const imposterNames = room.imposters.map(i => i.name).join(' & ');

    room.players.forEach(player => {
      if (player.offline) return;

      const isImposter = room.imposters.some(imposter => imposter.playerId === player.playerId);
      io.to(player.id).emit('imposterRevealed', {
        imposterNames,
        isCurrentPlayerImposter: isImposter,
        crewmateWord: isImposter ? room.currentRound.crewmateWord : null
      });
    });
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

  // ----- Guess Who Game -----
  socket.on('gwSyncState', (payload = {}) => {
    const code = normalizeRoomCode(payload.roomCode);
    const success = attachGuessWhoPlayerToSocket(socket, code, payload.playerId, null, payload.boardCapacity);
    if (!success) socket.emit('gwRejoinFailed');
  });

  socket.on('gwUpdateViewport', ({ roomCode, playerId, boardCapacity } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room || !playerId) return;

    const player = room.players.find(p => p.playerId === playerId && p.id === socket.id);
    if (!player) return;

    player.boardCapacity = clampGuessWhoBoardCapacity(boardCapacity);
  });

  socket.on('gwCreateRoom', ({ name, playerId, boardCapacity } = {}) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return socket.emit('gwErrorMsg', 'Please enter a name first.');
    if (!playerId) return socket.emit('gwErrorMsg', 'Could not identify player. Please refresh and try again.');

    const roomCode = generateRoomCode();
    guessWhoRooms[roomCode] = {
      code: roomCode,
      players: [{
        id: socket.id,
        playerId,
        name: cleanName,
        isHost: true,
        score: 0,
        offline: false,
        disconnectedAt: null,
        selectedCharacterId: null,
        boardCapacity: clampGuessWhoBoardCapacity(boardCapacity)
      }],
      status: 'lobby',
      board: [],
      messages: [],
      roundId: 0,
      selectedFolderIds: [],
      createdAt: Date.now()
    };

    socket.join(guessWhoChannel(roomCode));
    sendGuessWhoState(socket, guessWhoRooms[roomCode], playerId);
  });

  socket.on('gwJoinRoom', ({ roomCode, playerName, playerId, boardCapacity } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    const cleanName = String(playerName || '').trim();

    if (!room) return socket.emit('gwErrorMsg', 'Guess Who room not found.');
    if (!cleanName) return socket.emit('gwErrorMsg', 'Please enter a name first.');
    if (!playerId) return socket.emit('gwErrorMsg', 'Could not identify player. Please refresh and try again.');

    const existingPlayer = room.players.find(player => player.playerId === playerId);
    if (existingPlayer) {
      attachGuessWhoPlayerToSocket(socket, code, playerId, cleanName, boardCapacity);
      return;
    }

    if (room.players.length >= 2) {
      return socket.emit('gwErrorMsg', 'This Guess Who room is full. Only 2 players can play.');
    }

    if (room.status !== 'lobby') {
      return socket.emit('gwErrorMsg', 'This Guess Who game has already started.');
    }

    clearGuessWhoRoomCleanupTimer(code);
    room.players.push({
      id: socket.id,
      playerId,
      name: cleanName,
      isHost: false,
      score: 0,
      offline: false,
      disconnectedAt: null,
      selectedCharacterId: null,
      boardCapacity: clampGuessWhoBoardCapacity(boardCapacity)
    });

    socket.join(guessWhoChannel(code));
    emitGuessWhoState(code);
  });

  socket.on('gwStartSelection', async ({ roomCode, boardSize, autoFit, selectionMode, selectedCharacterIds, selectedFolderIds } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    if (!requireGuessWhoHost(socket, room)) {
      return socket.emit('gwErrorMsg', 'Only the host can start the Guess Who round.');
    }

    if (room.players.length !== 2) {
      return socket.emit('gwErrorMsg', 'Guess Who needs exactly 2 players.');
    }

    if (room.players.some(player => player.offline)) {
      return socket.emit('gwErrorMsg', 'Both players must be online before starting.');
    }

    try {
      await prepareGuessWhoRound(room, { boardSize, autoFit, selectionMode, selectedCharacterIds, selectedFolderIds });
      emitGuessWhoState(code);
    } catch (error) {
      socket.emit('gwErrorMsg', error.message || 'Could not start Guess Who.');
    }
  });

  socket.on('gwSelectCharacter', ({ roomCode, characterId } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    if (room.status !== 'selecting') {
      return socket.emit('gwErrorMsg', 'Secret character selection is not open.');
    }

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;

    const character = findGuessWhoCharacter(room, characterId);
    if (!character) {
      return socket.emit('gwErrorMsg', 'Please choose a character from this round.');
    }

    player.selectedCharacterId = character.id;

    if (room.players.length === 2 && room.players.every(p => p.selectedCharacterId)) {
      room.status = 'playing';
      addGuessWhoSystemMessage(room, 'Both players have picked their secret character. Start asking questions.');
    }

    emitGuessWhoState(code);
  });

  socket.on('gwChatMessage', ({ roomCode, text } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;

    const cleanText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!cleanText) return;

    if (!['playing', 'revealed'].includes(room.status)) {
      return socket.emit('gwErrorMsg', 'Chat opens after both players select their characters.');
    }

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      playerId: player.playerId,
      name: player.name,
      text: cleanText,
      timestamp: Date.now(),
      system: false
    };

    room.messages.push(message);
    room.messages = room.messages.slice(-MAX_CHAT_MESSAGES);
    io.to(guessWhoChannel(code)).emit('gwChatMessage', message);
  });

  socket.on('gwRevealCharacters', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    if (!requireGuessWhoHost(socket, room)) {
      return socket.emit('gwErrorMsg', 'Only the host can reveal the characters.');
    }

    if (!['playing', 'selecting'].includes(room.status)) return;

    room.status = 'revealed';
    addGuessWhoSystemMessage(room, 'Characters revealed. Assign points or start the next round.');
    emitGuessWhoState(code);
  });

  socket.on('gwNextRound', async ({ roomCode, pointsData = {}, boardSize, autoFit } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    if (!requireGuessWhoHost(socket, room)) {
      return socket.emit('gwErrorMsg', 'Only the host can start the next round.');
    }

    awardGuessWhoPoints(room, pointsData);

    try {
      await prepareGuessWhoRound(room, {
        boardSize,
        autoFit,
        selectionMode: 'random',
        selectedFolderIds: Array.isArray(room.selectedFolderIds) && room.selectedFolderIds.length > 0 ? room.selectedFolderIds : undefined
      });
      emitGuessWhoState(code);
    } catch (error) {
      socket.emit('gwErrorMsg', error.message || 'Could not start the next Guess Who round.');
    }
  });

  socket.on('gwReturnToLobby', ({ roomCode, pointsData = {} } = {}) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    if (!requireGuessWhoHost(socket, room)) {
      return socket.emit('gwErrorMsg', 'Only the host can return to the lobby.');
    }

    awardGuessWhoPoints(room, pointsData);
    room.status = 'lobby';
    room.board = [];
    room.messages = [];
    room.players.forEach(player => {
      player.selectedCharacterId = null;
    });
    emitGuessWhoState(code);
  });

  socket.on('gwResetScores', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    if (!requireGuessWhoHost(socket, room)) {
      return socket.emit('gwErrorMsg', 'Only the host can reset scores.');
    }

    room.players.forEach(player => { player.score = 0; });
    emitGuessWhoState(code);
  });

  socket.on('gwLeaveRoom', (roomCode) => {
    const code = normalizeRoomCode(roomCode);
    const room = guessWhoRooms[code];
    if (!room) return;

    const index = room.players.findIndex(player => player.id === socket.id);
    if (index === -1) return;

    const removedPlayer = room.players.splice(index, 1)[0];
    clearGuessWhoPlayerTimer(code, removedPlayer.playerId);
    socket.leave(guessWhoChannel(code));

    if (room.players.length === 0) {
      deleteGuessWhoRoom(code);
      return;
    }

    if (removedPlayer.isHost && !room.players.some(player => player.isHost)) {
      room.players[0].isHost = true;
    }

    // Guess Who needs exactly two active players, so return the remaining player to lobby.
    room.status = 'lobby';
    room.board = [];
    room.messages = [];
    room.players.forEach(player => {
      player.selectedCharacterId = null;
    });

    emitGuessWhoState(code);
  });

  socket.on('disconnect', () => {
    let handledDisconnect = false;

    for (const code in rooms) {
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);

      if (!player) continue;

      handledDisconnect = true;
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

    if (handledDisconnect) return;

    for (const code in guessWhoRooms) {
      const room = guessWhoRooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (!player) continue;

      player.offline = true;
      player.disconnectedAt = Date.now();
      emitGuessWhoState(code);

      clearGuessWhoPlayerTimer(code, player.playerId);
      const key = guessWhoTimerKey(code, player.playerId);

      const timer = setTimeout(() => {
        const currentRoom = guessWhoRooms[code];
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

        emitGuessWhoState(code);

        if (currentRoom.players.every(p => p.offline)) {
          scheduleGuessWhoRoomCleanup(code);
        }

        guessWhoDisconnectTimers.delete(key);
      }, DISCONNECT_GRACE_MS);

      guessWhoDisconnectTimers.set(key, timer);

      if (room.players.every(p => p.offline)) {
        scheduleGuessWhoRoomCleanup(code);
      }

      break;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
