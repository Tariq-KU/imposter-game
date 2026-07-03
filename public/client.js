const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

// --- Persistence & Session Tracking ---
let myPlayerId = localStorage.getItem('imposter-playerId');
if (!myPlayerId) {
  myPlayerId = window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'p-' + Math.random().toString(36).slice(2, 11);
  localStorage.setItem('imposter-playerId', myPlayerId);
}

let currentRoomCode = '';
let amIHost = false;
let currentGameMode = 'standard';
let currentPlayers = [];
let intentionallyLeftRoom = false;
let lastStateSyncRequest = 0;
let lastVisibilityChange = Date.now();

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
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

// Game Elements
const gameCategoryReveal = document.getElementById('game-category-reveal');
const roleDisplayCard = document.getElementById('role-display-card');
const wordDisplayArea = document.getElementById('word-display-area');
const gameWordReveal = document.getElementById('game-word-reveal');
const gameInstructions = document.getElementById('game-instructions');
const revealImposterBtn = document.getElementById('reveal-imposter-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const showContinuePanelBtn = document.getElementById('show-continue-panel-btn');
const gameHostControls = document.getElementById('game-host-controls');
const continuePanel = document.getElementById('continue-panel');
const confirmContinueBtn = document.getElementById('confirm-continue-btn');
const cancelContinueBtn = document.getElementById('cancel-continue-btn');
const pointInputsContainer = document.getElementById('point-inputs-container');
const revealBanner = document.getElementById('reveal-banner');
const revealedImposterName = document.getElementById('revealed-imposter-name');
const gamePlayerList = document.getElementById('game-player-list');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');

// --- On Load Setup ---
const savedName = localStorage.getItem('imposter-playerName');
if (savedName) playerNameInput.value = savedName;

function resetSetupButtons() {
  createRoomBtn.disabled = false;
  createRoomBtn.innerText = 'Create New Game';
  joinRoomBtn.disabled = false;
  joinRoomBtn.innerText = 'Join Game';
}

function getActiveRoomCode() {
  return currentRoomCode || localStorage.getItem('imposter-roomCode') || '';
}

function rememberRoom(code) {
  if (!code) return;
  currentRoomCode = code;
  localStorage.setItem('imposter-roomCode', code);
  displayRoomCode.innerText = code;
}

function requestCurrentState() {
  const activeRoom = getActiveRoomCode();
  if (!activeRoom || intentionallyLeftRoom) return;

  if (!socket.connected) {
    socket.connect();
    return;
  }

  // Prevent duplicate bursts from visibilitychange + focus + reconnect firing together.
  const now = Date.now();
  if (now - lastStateSyncRequest < 300) return;
  lastStateSyncRequest = now;

  socket.emit('syncState', {
    roomCode: activeRoom,
    playerId: myPlayerId
  });
}

function recoverFromMobileResume() {
  const activeRoom = getActiveRoomCode();
  if (!activeRoom || intentionallyLeftRoom) return;

  const timeHidden = Date.now() - lastVisibilityChange;

  // A mobile browser can report the old socket as connected even though the tab was
  // frozen. A clean reconnect forces a fresh socket id, then the server resends state.
  if (socket.connected && timeHidden > 1000) {
    socket.disconnect();
    setTimeout(() => socket.connect(), 150);
    return;
  }

  setTimeout(requestCurrentState, 250);
}

// --- Socket Connection Lifecycle ---
socket.on('connect', () => {
  intentionallyLeftRoom = false;
  requestCurrentState();
});

socket.io.on('reconnect', () => {
  requestCurrentState();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    lastVisibilityChange = Date.now();
    return;
  }

  recoverFromMobileResume();
});

window.addEventListener('pageshow', () => {
  setTimeout(requestCurrentState, 250);
});

window.addEventListener('focus', () => {
  setTimeout(requestCurrentState, 250);
});

// --- Buttons ---
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    setupError.innerText = 'Please enter a name first.';
    return;
  }

  setupError.innerText = '';
  intentionallyLeftRoom = false;
  createRoomBtn.disabled = true;
  createRoomBtn.innerText = 'Creating...';

  localStorage.setItem('imposter-playerName', name);
  socket.emit('createRoom', { name, playerId: myPlayerId });
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();

  if (!name) {
    setupError.innerText = 'Please enter a name first.';
    return;
  }

  if (!code) {
    setupError.innerText = 'Please enter a room code.';
    return;
  }

  setupError.innerText = '';
  intentionallyLeftRoom = false;
  joinRoomBtn.disabled = true;
  joinRoomBtn.innerText = 'Joining...';

  localStorage.setItem('imposter-playerName', name);
  socket.emit('joinRoom', { roomCode: code, playerName: name, playerId: myPlayerId });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  const selectedCategories = Array.from(document.querySelectorAll('#lobby-categories input:checked')).map(cb => cb.value);
  const imposterCount = document.getElementById('imposter-count').value;
  const gameMode = document.getElementById('mode-select').value;

  if (selectedCategories.length === 0) {
    lobbyError.innerText = 'Please select at least one category.';
    return;
  }

  lobbyError.innerText = '';
  socket.emit('startGame', { roomCode: currentRoomCode, selectedCategories, imposterCount, gameMode });
});

resetScoresBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to reset all player scores back to 0?')) {
    socket.emit('resetScores', currentRoomCode);
  }
});

revealImposterBtn.addEventListener('click', () => {
  socket.emit('revealImposter', currentRoomCode);
});

showContinuePanelBtn.addEventListener('click', () => {
  pointInputsContainer.innerHTML = '';

  currentPlayers.forEach(player => {
    const row = document.createElement('div');
    row.style = 'display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;';

    const label = document.createElement('span');
    label.style = 'font-size: 14px; color: #fff;';
    label.innerText = `${player.name} (${player.score || 0} pts)`;

    const input = document.createElement('input');
    input.type = 'number';
    input.dataset.id = player.playerId;
    input.value = '0';
    input.style = 'width: 70px; padding: 6px; margin: 0; background: #121214; border: 1px solid #323238; color: white; border-radius: 4px;';

    row.appendChild(label);
    row.appendChild(input);
    pointInputsContainer.appendChild(row);
  });

  continuePanel.classList.remove('hidden');
  gameHostControls.classList.add('hidden');
  revealImposterBtn.classList.add('hidden');
});

cancelContinueBtn.addEventListener('click', () => {
  continuePanel.classList.add('hidden');
  gameHostControls.classList.remove('hidden');
});

confirmContinueBtn.addEventListener('click', () => {
  const inputs = pointInputsContainer.querySelectorAll('input[type="number"]');
  const pointsData = {};

  inputs.forEach(input => {
    pointsData[input.dataset.id] = parseInt(input.value, 10) || 0;
  });

  const nextCategories = Array.from(document.querySelectorAll('#continue-categories input:checked')).map(cb => cb.value);
  if (nextCategories.length === 0) {
    alert('Please select at least one category.');
    return;
  }

  socket.emit('continueGame', { roomCode: currentRoomCode, pointsData, nextCategories });
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('resetGame', currentRoomCode);
});

function leaveCurrentRoom() {
  intentionallyLeftRoom = true;

  if (currentRoomCode) {
    socket.emit('leaveRoom', currentRoomCode);
  }

  localStorage.removeItem('imposter-roomCode');

  lobbyScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');

  currentRoomCode = '';
  amIHost = false;
  resetSetupButtons();
}

leaveLobbyBtn.addEventListener('click', leaveCurrentRoom);
leaveGameBtn.addEventListener('click', leaveCurrentRoom);

// --- UI Rendering ---
function handleLobbyEntry(code, players) {
  rememberRoom(code);
  resetSetupButtons();

  setupScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  revealBanner.classList.add('hidden');
  revealBanner.style.display = 'none';

  updatePlayerList(players || []);
}

function appendOfflineTag(parent, isOffline) {
  if (!isOffline) return;

  const offline = document.createElement('span');
  offline.className = 'offline-tag';
  offline.innerText = '(Offline)';
  parent.appendChild(offline);
}

function updatePlayerList(players = []) {
  currentPlayers = players;
  const me = players.find(p => p.playerId === myPlayerId);

  if (me) {
    amIHost = me.isHost;
  }

  if (amIHost && !lobbyScreen.classList.contains('hidden')) {
    hostControls.classList.remove('hidden');
    lobbyWaitMsg.classList.add('hidden');
  } else if (!amIHost) {
    hostControls.classList.add('hidden');
    if (!lobbyScreen.classList.contains('hidden')) lobbyWaitMsg.classList.remove('hidden');
  }

  playerList.innerHTML = '';
  gamePlayerList.innerHTML = '';

  players.forEach(player => {
    const rowClass = player.offline ? 'offline-player' : '';

    const lobbyItem = document.createElement('li');
    lobbyItem.className = rowClass;

    const lobbyName = document.createElement('span');
    lobbyName.innerText = `${player.name} (${player.score || 0} pts)`;
    lobbyName.style.color = '#fff';
    appendOfflineTag(lobbyName, player.offline);
    lobbyItem.appendChild(lobbyName);

    if (player.isHost) {
      const hostTag = document.createElement('span');
      hostTag.innerText = 'HOST';
      hostTag.className = 'host-tag';
      lobbyItem.appendChild(hostTag);
    }

    playerList.appendChild(lobbyItem);

    const gameItem = document.createElement('li');
    gameItem.className = rowClass;

    const gameName = document.createElement('span');
    gameName.style.color = '#fff';
    gameName.innerText = player.name;
    appendOfflineTag(gameName, player.offline);

    const gameScore = document.createElement('span');
    gameScore.style = 'color: #00b37e; font-weight: bold;';
    gameScore.innerText = `${player.score || 0} pts`;

    gameItem.appendChild(gameName);
    gameItem.appendChild(gameScore);
    gamePlayerList.appendChild(gameItem);
  });
}

function displayActiveGameData(data) {
  if (data.roomCode) rememberRoom(data.roomCode);
  if (data.players) updatePlayerList(data.players);

  // Sync the host's "Continue Game" checkboxes with the current server options.
  if (data.selectedCategories && amIHost) {
    document.querySelectorAll('#continue-categories input[type="checkbox"]').forEach(cb => {
      cb.checked = data.selectedCategories.includes(cb.value);
    });
  }

  lobbyScreen.classList.add('hidden');
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  continuePanel.classList.add('hidden');

  gameCategoryReveal.innerText = data.category;
  currentGameMode = data.mode;

  gameHostControls.classList.add('hidden');
  revealImposterBtn.classList.add('hidden');

  if (data.mode === 'hidden') {
    document.getElementById('role-title').innerText = 'Your Secret Word';
    roleDisplayCard.style.display = 'none';
    roleDisplayCard.innerText = '';
    roleDisplayCard.className = 'hidden';

    wordDisplayArea.classList.remove('hidden');
    gameWordReveal.innerText = data.word;
    gameInstructions.innerText = 'Everyone has a word! One person has a DIFFERENT word. Describe yours carefully!';
  } else {
    document.getElementById('role-title').innerText = 'Your Role Assignment';
    roleDisplayCard.style.display = 'block';
    roleDisplayCard.classList.remove('hidden');

    if (data.role === 'Imposter') {
      roleDisplayCard.innerText = 'YOU ARE THE IMPOSTER!';
      roleDisplayCard.className = 'role-box role-imposter';
      wordDisplayArea.classList.add('hidden');
    } else {
      roleDisplayCard.innerText = 'YOU ARE CREWMATE';
      roleDisplayCard.className = 'role-box role-crewmate';
      wordDisplayArea.classList.remove('hidden');
      gameWordReveal.innerText = data.word;
    }

    gameInstructions.innerText = 'Discuss and find the Imposter!';
  }

  if (data.imposterRevealed) {
    showImposterReveal(data.imposterNames);
  } else {
    revealBanner.classList.add('hidden');
    revealBanner.style.display = 'none';

    if (amIHost) {
      revealImposterBtn.innerText = data.mode === 'hidden' ? 'End Round & Reveal (Host Only)' : 'End Round (Host Only)';
      revealImposterBtn.classList.remove('hidden');
    }
  }
}

function showImposterReveal(imposterNames) {
  revealBanner.classList.remove('hidden');
  revealBanner.style.display = 'block';

  const myName = playerNameInput.value.trim() || localStorage.getItem('imposter-playerName');
  if (myName && imposterNames && imposterNames.includes(myName)) {
    revealedImposterName.innerText = `${imposterNames} (That's YOU!)`;
  } else {
    revealedImposterName.innerText = imposterNames || '-';
  }

  revealImposterBtn.classList.add('hidden');
  if (amIHost) {
    gameHostControls.classList.remove('hidden');
  }
}

// --- Socket Listeners ---
socket.on('rejoinFailed', () => {
  localStorage.removeItem('imposter-roomCode');
  currentRoomCode = '';
  setupScreen.classList.remove('hidden');
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  setupError.innerText = 'Could not rejoin the previous room. It may have expired.';
  resetSetupButtons();
});

socket.on('rejoinGame', displayActiveGameData);

socket.on('roomCreated', data => {
  handleLobbyEntry(data.roomCode, data.players);
});

socket.on('roomUpdated', data => {
  if (data.roomCode && !currentRoomCode) rememberRoom(data.roomCode);

  if (!setupScreen.classList.contains('hidden') && currentRoomCode) {
    handleLobbyEntry(currentRoomCode, data.players);
    return;
  }

  updatePlayerList(data.players);
});

socket.on('errorMsg', msg => {
  setupError.innerText = msg;
  lobbyError.innerText = msg;
  resetSetupButtons();
});

socket.on('gameStarted', displayActiveGameData);
socket.on('imposterRevealed', showImposterReveal);
socket.on('gameReset', ({ roomCode, players }) => {
  handleLobbyEntry(roomCode || currentRoomCode, players);
});
