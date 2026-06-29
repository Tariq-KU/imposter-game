const socket = io();

let currentRoomCode = '';
let amIHost = false;

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const setupError = document.getElementById('setup-error');
const lobbyError = document.getElementById('lobby-error');

const displayRoomCode = document.getElementById('display-room-code');
const playerList = document.getElementById('player-list');
const hostControls = document.getElementById('host-controls');
const lobbyWaitMsg = document.getElementById('lobby-wait-msg');

const gameCategoryReveal = document.getElementById('game-category-reveal');
const roleDisplayCard = document.getElementById('role-display-card');
const wordDisplayArea = document.getElementById('word-display-area');
const gameWordReveal = document.getElementById('game-word-reveal');
const playAgainBtn = document.getElementById('play-again-btn');

// --- Event Listeners ---

document.getElementById('create-room-btn').addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return setupError.innerText = 'Please enter a name first.';
  setupError.innerText = '';
  socket.emit('createRoom', name);
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) return setupError.innerText = 'Please enter a name first.';
  if (!code) return setupError.innerText = 'Please enter a room code.';
  setupError.innerText = '';
  socket.emit('joinRoom', { roomCode: code, playerName: name });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  const category = document.getElementById('category-select').value;
  const imposterCount = document.getElementById('imposter-count').value;
  lobbyError.innerText = '';
  socket.emit('startGame', { roomCode: currentRoomCode, category, imposterCount });
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('resetGame', currentRoomCode);
});

// --- Server Communication (Socket Socket Listeners) ---

socket.on('roomCreated', ({ roomCode, players }) => {
  currentRoomCode = roomCode;
  amIHost = true;
  transitionToLobby(players);
});

socket.on('roomUpdated', ({ players }) => {
  updatePlayerList(players);
});

socket.on('joinRoomSuccess', ({ roomCode, players }) => {
  currentRoomCode = roomCode;
  amIHost = false;
  transitionToLobby(players);
});

// Generic override room list data update
socket.on('roomUpdated', ({ players }) => {
  updatePlayerList(players);
});

// Re-map join event to catch data cleanly
socket.on('roomUpdated', ({ players }) => {
  updatePlayerList(players);
});
socket.on('roomCreated', ({ roomCode, players }) => { handleLobbyEntry(roomCode, players, true); });
socket.on('roomUpdated', ({ players }) => { updatePlayerList(players); });

// Explicit fallback mapping for clean room entry synchronization
function handleLobbyEntry(code, players, isHostRole){
  currentRoomCode = code;
  amIHost = isHostRole;
  displayRoomCode.innerText = code;
  setupScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');

  if (amIHost) {
    hostControls.classList.remove('hidden');
    lobbyWaitMsg.classList.add('hidden');
    playAgainBtn.classList.remove('hidden');
  } else {
    hostControls.classList.add('hidden');
    lobbyWaitMsg.classList.remove('hidden');
    playAgainBtn.classList.add('hidden');
  }
  updatePlayerList(players);
}

socket.on('roomCreated', ({ roomCode, players }) => { handleLobbyEntry(roomCode, players, true); });
socket.on('roomUpdated', ({ players }) => { updatePlayerList(players); });
// Fix socket mapping payload variations
socket.on('roomCreated', (data) => { handleLobbyEntry(data.roomCode, data.players, true); });
socket.on('roomUpdated', (data) => { updatePlayerList(data.players); });

// Handle standard validation failures
socket.on('errorMsg', (msg) => {
  setupError.innerText = msg;
  lobbyError.innerText = msg;
});

socket.on('gameStarted', ({ role, word, category }) => {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  gameCategoryReveal.innerText = category;
  roleDisplayCard.innerText = role === 'Imposter' ? 'YOU ARE THE IMPOSTER!' : 'YOU ARE CREWMATE';

  if (role === 'Imposter') {
    roleDisplayCard.className = 'role-box role-imposter';
    wordDisplayArea.classList.add('hidden');
  } else {
    roleDisplayCard.className = 'role-box role-crewmate';
    wordDisplayArea.classList.remove('hidden');
    gameWordReveal.innerText = word;
  }
});

socket.on('gameReset', ({ players }) => {
  handleLobbyEntry(currentRoomCode, players, amIHost);
});

function transitionToLobby(players){
  handleLobbyEntry(currentRoomCode, players, amIHost);
}

function updatePlayerList(players){
  // Find your current state in the active roster list
  const me = players.find(p => p.id === socket.id);
  if (me) {
    amIHost = me.isHost;
    if (amIHost) {
      hostControls.classList.remove('hidden');
      lobbyWaitMsg.classList.add('hidden');
      playAgainBtn.classList.remove('hidden');
    } else {
      hostControls.classList.add('hidden');
      lobbyWaitMsg.classList.remove('hidden');
      playAgainBtn.classList.add('hidden');
    }
  }

  playerList.innerHTML = '';
  players.forEach((player) => {
    const li = document.createElement('li');
    li.innerText = player.name;
    if (player.isHost) {
      const span = document.createElement('span');
      span.innerText = 'HOST';
      span.className = 'host-tag';
      li.appendChild(span);
    }
    playerList.appendChild(li);
  });
}
