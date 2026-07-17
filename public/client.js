const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

// --------------------------
// Shared state and helpers
// --------------------------
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
let guessWhoRoomCode = '';
let guessWhoPlayers = [];
let guessWhoBoard = [];
let guessWhoMessages = [];
let guessWhoStatus = 'lobby';
let guessWhoRoundId = 0;
let guessWhoMySecret = null;
let guessWhoRevealedSecrets = [];
let guessWhoSelectedCharacterId = '';
let guessWhoEliminated = new Set();
let guessWhoLibraryCount = 0;
let guessWhoLibrary = [];
let guessWhoFolders = [];
let guessWhoManualSelected = new Set();
let guessWhoLibraryFilter = '';
let guessWhoRandomFolderSelected = new Set();
let guessWhoManualFolderFilterSelected = new Set();
let guessWhoLobbyFolderFilter = 'all';
let viewportUpdateTimer = null;

const appCard = document.getElementById('app-card');
const screens = Array.from(document.querySelectorAll('.screen'));

function showScreen(screenId, wide = false) {
  screens.forEach(screen => screen.classList.add('hidden'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.remove('hidden');

  const isGameSelect = screenId === 'game-select-screen';
  const shouldUseWideCard = wide || isGameSelect;

  appCard.classList.toggle('home-card', isGameSelect);
  appCard.classList.toggle('narrow', !shouldUseWideCard);
  appCard.classList.toggle('guesswho-play-layout', ['gw-selection-screen', 'gw-game-screen'].includes(screenId));

  if (['gw-lobby-screen', 'gw-selection-screen', 'gw-game-screen'].includes(screenId)) {
    setTimeout(sendGuessWhoViewportInfo, 150);
  }
}

function setActiveGame(gameType) {
  if (gameType) {
    localStorage.setItem('party-activeGame', gameType);
  } else {
    localStorage.removeItem('party-activeGame');
  }
}

function getSavedName() {
  return localStorage.getItem('imposter-playerName') || '';
}

function saveName(name) {
  localStorage.setItem('imposter-playerName', name);
  if (playerNameInput) playerNameInput.value = name;
  if (gwPlayerNameInput) gwPlayerNameInput.value = name;
}

function textOrDash(value) {
  return value || '-';
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (typeof text === 'string') element.textContent = text;
  return element;
}

function setMessage(element, message) {
  if (element) element.textContent = message || '';
}

function getTimeLabel(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
}

// --------------------------
// Game select
// --------------------------
const selectImposterBtn = document.getElementById('select-imposter-btn');
const selectGuessWhoBtn = document.getElementById('select-guesswho-btn');
const selectAdminBtn = document.getElementById('select-admin-btn');
const backFromImposterSetupBtn = document.getElementById('back-from-imposter-setup-btn');
const backFromGwSetupBtn = document.getElementById('back-from-gw-setup-btn');
const backFromAdminBtn = document.getElementById('back-from-admin-btn');

function showGameSelect() {
  showScreen('game-select-screen', false);
  setActiveGame('');
}

selectImposterBtn.addEventListener('click', () => {
  showScreen('setup-screen', false);
  setMessage(setupError, '');
});

selectGuessWhoBtn.addEventListener('click', async () => {
  showScreen('gw-setup-screen', false);
  setMessage(gwSetupError, '');
  updateGuessWhoAutoFitNote();
  if (gwAutoFitCheckbox) gwBoardSizeInput.disabled = gwAutoFitCheckbox.checked;
  if (gwNextAutoFit) gwNextBoardSize.disabled = gwNextAutoFit.checked;
  await refreshGuessWhoLibraryCount();
});

selectAdminBtn.addEventListener('click', async () => {
  showScreen('admin-screen', true);
  await loadAdminLibrary();
});

backFromImposterSetupBtn.addEventListener('click', showGameSelect);
backFromGwSetupBtn.addEventListener('click', showGameSelect);
backFromAdminBtn.addEventListener('click', showGameSelect);

// --------------------------
// Imposter DOM elements
// --------------------------
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
const imposterRevealMessage = document.getElementById('imposter-reveal-message');
const gamePlayerList = document.getElementById('game-player-list');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');

// --------------------------
// Guess Who DOM elements
// --------------------------
const gwSetupError = document.getElementById('gw-setup-error');
const gwPlayerNameInput = document.getElementById('gw-player-name');
const gwRoomCodeInput = document.getElementById('gw-room-code-input');
const gwCreateRoomBtn = document.getElementById('gw-create-room-btn');
const gwJoinRoomBtn = document.getElementById('gw-join-room-btn');
const gwLibraryCount = document.getElementById('gw-library-count');
const gwLibraryCountLobby = document.getElementById('gw-library-count-lobby');
const gwDisplayRoomCode = document.getElementById('gw-display-room-code');
const gwPlayerList = document.getElementById('gw-player-list');
const gwGamePlayerList = document.getElementById('gw-game-player-list');
const gwLobbyStatus = document.getElementById('gw-lobby-status');
const gwHostControls = document.getElementById('gw-host-controls');
const gwBoardSourceSelect = document.getElementById('gw-board-source');
const gwRandomOptions = document.getElementById('gw-random-options');
const gwManualOptions = document.getElementById('gw-manual-options');
const gwAutoFitCheckbox = document.getElementById('gw-auto-fit');
const gwAutoFitNote = document.getElementById('gw-auto-fit-note');
const gwBoardSizeInput = document.getElementById('gw-board-size');
const gwCharacterSearch = document.getElementById('gw-character-search');
const gwCharacterPicker = document.getElementById('gw-character-picker');
const gwRandomFolderOptions = document.getElementById('gw-random-folder-options');
const gwManualFolderOptions = document.getElementById('gw-manual-folder-options');
const gwLobbyFolderFilter = document.getElementById('gw-lobby-folder-filter');
const gwLobbyLibrarySearch = document.getElementById('gw-lobby-library-search');
const gwLobbyLibraryGrid = document.getElementById('gw-lobby-library-grid');
const gwLobbyBrowserCount = document.getElementById('gw-lobby-browser-count');
const gwSelectedCount = document.getElementById('gw-selected-count');
const gwSelectVisibleBtn = document.getElementById('gw-select-visible-btn');
const gwClearSelectionBtn = document.getElementById('gw-clear-selection-btn');
const gwStartRoundBtn = document.getElementById('gw-start-round-btn');
const gwResetScoresBtn = document.getElementById('gw-reset-scores-btn');
const gwLobbyError = document.getElementById('gw-lobby-error');
const gwLeaveLobbyBtn = document.getElementById('gw-leave-lobby-btn');
const gwSelectionRoomCode = document.getElementById('gw-selection-room-code');
const gwSelectionHelp = document.getElementById('gw-selection-help');
const gwSelectedSecretPreview = document.getElementById('gw-selected-secret-preview');
const gwSelectionGrid = document.getElementById('gw-selection-grid');
const gwConfirmSecretBtn = document.getElementById('gw-confirm-secret-btn');
const gwSelectionError = document.getElementById('gw-selection-error');
const gwLeaveSelectionBtn = document.getElementById('gw-leave-selection-btn');
const gwGameRoomCode = document.getElementById('gw-game-room-code');
const gwMySecret = document.getElementById('gw-my-secret');
const gwBoardGrid = document.getElementById('gw-board-grid');
const gwChatBox = document.getElementById('gw-chat-box');
const gwChatForm = document.getElementById('gw-chat-form');
const gwChatInput = document.getElementById('gw-chat-input');
const gwRevealBtn = document.getElementById('gw-reveal-btn');
const gwRevealedPanel = document.getElementById('gw-revealed-panel');
const gwRevealGrid = document.getElementById('gw-reveal-grid');
const gwPointsPanel = document.getElementById('gw-points-panel');
const gwPointInputs = document.getElementById('gw-point-inputs');
const gwNextAutoFit = document.getElementById('gw-next-auto-fit');
const gwNextBoardSize = document.getElementById('gw-next-board-size');
const gwNextRoundBtn = document.getElementById('gw-next-round-btn');
const gwReturnLobbyBtn = document.getElementById('gw-return-lobby-btn');
const gwGameError = document.getElementById('gw-game-error');
const gwLeaveGameBtn = document.getElementById('gw-leave-game-btn');

// --------------------------
// Admin DOM elements
// --------------------------
const adminPasswordInput = document.getElementById('admin-password-input');
const adminNewFolderName = document.getElementById('admin-new-folder-name');
const adminCreateFolderBtn = document.getElementById('admin-create-folder-btn');
const adminActiveFolderSelect = document.getElementById('admin-active-folder-select');
const adminFileInput = document.getElementById('admin-file-input');
const adminFolderInput = document.getElementById('admin-folder-input');
const adminUploadBtn = document.getElementById('admin-upload-btn');
const adminStatus = document.getElementById('admin-status');
const adminError = document.getElementById('admin-error');
const adminLibraryCount = document.getElementById('admin-library-count');
const adminFolderCount = document.getElementById('admin-folder-count');
const adminFolderList = document.getElementById('admin-folder-list');
const adminLibraryFolderFilter = document.getElementById('admin-library-folder-filter');
const adminLibrarySearch = document.getElementById('admin-library-search');
const adminLibraryGrid = document.getElementById('admin-library-grid');

const savedName = getSavedName();
if (savedName) {
  playerNameInput.value = savedName;
  gwPlayerNameInput.value = savedName;
}

// --------------------------
// Mobile/reconnect handling
// --------------------------
function resetSetupButtons() {
  createRoomBtn.disabled = false;
  createRoomBtn.textContent = 'Create New Imposter Game';
  joinRoomBtn.disabled = false;
  joinRoomBtn.textContent = 'Join Imposter Game';
  gwCreateRoomBtn.disabled = false;
  gwCreateRoomBtn.textContent = 'Create Guess Who Room';
  gwJoinRoomBtn.disabled = false;
  gwJoinRoomBtn.textContent = 'Join Guess Who Room';
}

function getActiveRoomCode() {
  return currentRoomCode || localStorage.getItem('imposter-roomCode') || '';
}

function getActiveGuessWhoRoomCode() {
  return guessWhoRoomCode || localStorage.getItem('guesswho-roomCode') || '';
}

function rememberRoom(code) {
  if (!code) return;
  currentRoomCode = code;
  localStorage.setItem('imposter-roomCode', code);
  localStorage.setItem('party-activeGame', 'imposter');
  displayRoomCode.textContent = code;
}

function rememberGuessWhoRoom(code) {
  if (!code) return;
  guessWhoRoomCode = code;
  localStorage.setItem('guesswho-roomCode', code);
  localStorage.setItem('party-activeGame', 'guessWho');
  gwDisplayRoomCode.textContent = code;
  gwSelectionRoomCode.textContent = code;
  gwGameRoomCode.textContent = code;
}

function requestCurrentState() {
  if (intentionallyLeftRoom) return;

  let activeGame = localStorage.getItem('party-activeGame');
  const imposterRoom = getActiveRoomCode();
  const guessWhoRoom = getActiveGuessWhoRoomCode();

  // Be forgiving after refreshes or old localStorage states. The old site only had
  // imposter rooms, so some browsers may have an imposter room saved without
  // party-activeGame being set.
  if (!activeGame) {
    activeGame = guessWhoRoom ? 'guessWho' : (imposterRoom ? 'imposter' : '');
  }

  if (activeGame === 'guessWho' && !guessWhoRoom && imposterRoom) {
    activeGame = 'imposter';
  }

  if (activeGame === 'imposter' && !imposterRoom && guessWhoRoom) {
    activeGame = 'guessWho';
  }

  if (!socket.connected) {
    socket.connect();
    return;
  }

  const now = Date.now();
  if (now - lastStateSyncRequest < 300) return;
  lastStateSyncRequest = now;

  if (activeGame === 'guessWho' && guessWhoRoom) {
    socket.emit('gwSyncState', { roomCode: guessWhoRoom, playerId: myPlayerId });
    return;
  }

  if (activeGame === 'imposter' && imposterRoom) {
    socket.emit('syncState', { roomCode: imposterRoom, playerId: myPlayerId });
  }
}

function recoverFromMobileResume() {
  const activeGame = localStorage.getItem('party-activeGame');
  const hasActiveRoom = activeGame === 'guessWho'
    ? getActiveGuessWhoRoomCode()
    : (getActiveRoomCode() || getActiveGuessWhoRoomCode());
  if (!hasActiveRoom || intentionallyLeftRoom) return;

  const timeHidden = Date.now() - lastVisibilityChange;
  if (socket.connected && timeHidden > 1000) {
    socket.disconnect();
    setTimeout(() => socket.connect(), 150);
    return;
  }

  setTimeout(requestCurrentState, 250);
}

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

// --------------------------
// Imposter Game UI and events
// --------------------------
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    setMessage(setupError, 'Please enter a name first.');
    return;
  }

  setMessage(setupError, '');
  intentionallyLeftRoom = false;
  createRoomBtn.disabled = true;
  createRoomBtn.textContent = 'Creating...';

  saveName(name);
  setActiveGame('imposter');
  socket.emit('createRoom', { name, playerId: myPlayerId });
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();

  if (!name) {
    setMessage(setupError, 'Please enter a name first.');
    return;
  }

  if (!code) {
    setMessage(setupError, 'Please enter a room code.');
    return;
  }

  setMessage(setupError, '');
  intentionallyLeftRoom = false;
  joinRoomBtn.disabled = true;
  joinRoomBtn.textContent = 'Joining...';

  saveName(name);
  setActiveGame('imposter');
  socket.emit('joinRoom', { roomCode: code, playerName: name, playerId: myPlayerId });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  const selectedCategories = Array.from(document.querySelectorAll('#lobby-categories input:checked')).map(cb => cb.value);
  const imposterCount = document.getElementById('imposter-count').value;
  const gameMode = document.getElementById('mode-select').value;

  if (selectedCategories.length === 0) {
    setMessage(lobbyError, 'Please select at least one category.');
    return;
  }

  setMessage(lobbyError, '');
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
    row.style = 'display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; gap: 12px;';

    const label = document.createElement('span');
    label.style = 'font-size: 14px; color: #fff;';
    label.textContent = `${player.name} (${player.score || 0} pts)`;

    const input = document.createElement('input');
    input.type = 'number';
    input.dataset.id = player.playerId;
    input.value = '0';
    input.style = 'width: 90px; padding: 6px; margin: 0; background: #121214; border: 1px solid #323238; color: white; border-radius: 8px;';

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
  setActiveGame('');

  currentRoomCode = '';
  amIHost = false;
  resetSetupButtons();
  showScreen('game-select-screen', false);
}

leaveLobbyBtn.addEventListener('click', leaveCurrentRoom);
leaveGameBtn.addEventListener('click', leaveCurrentRoom);

function handleLobbyEntry(code, players) {
  rememberRoom(code);
  resetSetupButtons();
  showScreen('lobby-screen', false);
  revealBanner.classList.add('hidden');
  revealBanner.style.display = 'none';
  updatePlayerList(players || []);
}

function appendOfflineTag(parent, isOffline) {
  if (!isOffline) return;

  const offline = document.createElement('span');
  offline.className = 'offline-tag';
  offline.textContent = '(Offline)';
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
    lobbyName.textContent = `${player.name} (${player.score || 0} pts)`;
    lobbyName.style.color = '#fff';
    appendOfflineTag(lobbyName, player.offline);
    lobbyItem.appendChild(lobbyName);

    if (player.isHost) {
      const hostTag = document.createElement('span');
      hostTag.textContent = 'HOST';
      hostTag.className = 'host-tag';
      lobbyItem.appendChild(hostTag);
    }

    playerList.appendChild(lobbyItem);

    const gameItem = document.createElement('li');
    gameItem.className = rowClass;

    const gameName = document.createElement('span');
    gameName.style.color = '#fff';
    gameName.textContent = player.name;
    appendOfflineTag(gameName, player.offline);

    const gameScore = document.createElement('span');
    gameScore.style = 'color: #00b37e; font-weight: bold;';
    gameScore.textContent = `${player.score || 0} pts`;

    gameItem.appendChild(gameName);
    gameItem.appendChild(gameScore);
    gamePlayerList.appendChild(gameItem);
  });
}

function displayActiveGameData(data) {
  if (data.roomCode) rememberRoom(data.roomCode);
  if (data.players) updatePlayerList(data.players);

  if (data.selectedCategories && amIHost) {
    document.querySelectorAll('#continue-categories input[type="checkbox"]').forEach(cb => {
      cb.checked = data.selectedCategories.includes(cb.value);
    });
  }

  showScreen('game-screen', false);
  continuePanel.classList.add('hidden');

  gameCategoryReveal.textContent = data.category;
  currentGameMode = data.mode;

  gameHostControls.classList.add('hidden');
  revealImposterBtn.classList.add('hidden');

  if (data.mode === 'hidden') {
    document.getElementById('role-title').textContent = 'Your Secret Word';
    roleDisplayCard.style.display = 'none';
    roleDisplayCard.textContent = '';
    roleDisplayCard.className = 'hidden';

    wordDisplayArea.classList.remove('hidden');
    gameWordReveal.textContent = data.word;
    gameInstructions.textContent = 'Everyone has a word! One person has a DIFFERENT word. Describe yours carefully!';
  } else {
    document.getElementById('role-title').textContent = 'Your Role Assignment';
    roleDisplayCard.style.display = 'block';
    roleDisplayCard.classList.remove('hidden');

    if (data.role === 'Imposter') {
      roleDisplayCard.textContent = 'YOU ARE THE IMPOSTER!';
      roleDisplayCard.className = 'role-box role-imposter';
      wordDisplayArea.classList.add('hidden');
    } else {
      roleDisplayCard.textContent = 'YOU ARE CREWMATE';
      roleDisplayCard.className = 'role-box role-crewmate';
      wordDisplayArea.classList.remove('hidden');
      gameWordReveal.textContent = data.word;
    }

    gameInstructions.textContent = 'Discuss and find the Imposter!';
  }

  if (data.imposterRevealed) {
    showImposterReveal({
      imposterNames: data.imposterNames,
      isCurrentPlayerImposter: data.isCurrentPlayerImposter,
      crewmateWord: data.revealedCrewmateWord
    });
  } else {
    revealBanner.classList.add('hidden');
    revealBanner.style.display = 'none';

    if (amIHost) {
      revealImposterBtn.textContent = data.mode === 'hidden' ? 'End Round & Reveal (Host Only)' : 'End Round (Host Only)';
      revealImposterBtn.classList.remove('hidden');
    }
  }
}

function showImposterReveal(payload) {
  revealBanner.classList.remove('hidden');
  revealBanner.style.display = 'block';

  const revealData = payload && typeof payload === 'object'
    ? payload
    : { imposterNames: payload, isCurrentPlayerImposter: false, crewmateWord: null };

  const imposterNames = revealData.imposterNames || '-';

  if (revealData.isCurrentPlayerImposter) {
    revealedImposterName.textContent = `${imposterNames} (That's YOU!)`;
    setMessage(
      imposterRevealMessage,
      revealData.crewmateWord ? `Crewmate word: ${revealData.crewmateWord}` : 'You were the Imposter.'
    );
  } else {
    revealedImposterName.textContent = imposterNames;
    setMessage(imposterRevealMessage, 'The Imposter can now see the Crewmate word.');
  }

  revealImposterBtn.classList.add('hidden');
  if (amIHost) {
    gameHostControls.classList.remove('hidden');
  }
}

socket.on('rejoinFailed', () => {
  localStorage.removeItem('imposter-roomCode');
  currentRoomCode = '';
  resetSetupButtons();
  showScreen('setup-screen', false);
  setMessage(setupError, 'Could not rejoin the previous room. It may have expired.');
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
  setMessage(setupError, msg);
  setMessage(lobbyError, msg);
  resetSetupButtons();
});

socket.on('gameStarted', displayActiveGameData);
socket.on('imposterRevealed', showImposterReveal);
socket.on('gameReset', ({ roomCode, players }) => {
  handleLobbyEntry(roomCode || currentRoomCode, players);
});


function clampNumber(value, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed)) return min;
  return Math.max(min, Math.min(parsed, max));
}

function estimateGuessWhoBoardCapacity() {
  const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 390);
  const viewportHeight = Math.max(520, window.innerHeight || document.documentElement.clientHeight || 720);
  const isMobile = viewportWidth < 760;

  const boardWidth = isMobile
    ? viewportWidth - 28
    : Math.min(viewportWidth - 420, 1060);

  const cardWidth = isMobile ? 74 : 104;
  const cardHeight = isMobile ? 98 : 124;
  const gap = isMobile ? 6 : 10;
  const reservedHeight = isMobile ? 265 : 210;

  const columns = Math.max(isMobile ? 3 : 5, Math.floor((boardWidth + gap) / (cardWidth + gap)));
  const rows = Math.max(3, Math.floor((viewportHeight - reservedHeight) / (cardHeight + gap)));

  return clampNumber(columns * rows, 6, 60);
}

function updateGuessWhoAutoFitNote() {
  const estimate = estimateGuessWhoBoardCapacity();
  if (gwAutoFitNote) {
    gwAutoFitNote.textContent = `Auto-fit estimate for this device: about ${estimate} characters. The server uses the smaller estimate between both players.`;
  }
}

function sendGuessWhoViewportInfo() {
  const activeRoom = getActiveGuessWhoRoomCode();
  if (!activeRoom || !socket.connected) return;

  socket.emit('gwUpdateViewport', {
    roomCode: activeRoom,
    playerId: myPlayerId,
    boardCapacity: estimateGuessWhoBoardCapacity()
  });

  updateGuessWhoAutoFitNote();
}

window.addEventListener('resize', () => {
  clearTimeout(viewportUpdateTimer);
  viewportUpdateTimer = setTimeout(sendGuessWhoViewportInfo, 250);
});

// --------------------------
// Guess Who library/admin
// --------------------------
async function getGuessWhoLibraryData() {
  const response = await fetch('/api/guess-who/characters');
  if (!response.ok) throw new Error('Could not load Guess Who characters.');
  const data = await response.json();

  return {
    characters: Array.isArray(data.characters) ? data.characters : [],
    folders: Array.isArray(data.folders) ? data.folders : []
  };
}

function updateGuessWhoLibraryState(data) {
  guessWhoLibrary = Array.isArray(data.characters) ? data.characters : [];
  guessWhoFolders = Array.isArray(data.folders) ? data.folders : [];
  guessWhoLibraryCount = guessWhoLibrary.length;

  if (guessWhoFolders.length === 0) {
    guessWhoFolders = [{ id: 'uncategorized', name: 'Uncategorized', characterCount: guessWhoLibrary.length }];
  }

  const folderIds = new Set(guessWhoFolders.map(folder => folder.id));

  guessWhoRandomFolderSelected = new Set([...guessWhoRandomFolderSelected].filter(id => folderIds.has(id)));
  guessWhoManualFolderFilterSelected = new Set([...guessWhoManualFolderFilterSelected].filter(id => folderIds.has(id)));

  if (guessWhoRandomFolderSelected.size === 0) {
    guessWhoFolders.forEach(folder => guessWhoRandomFolderSelected.add(folder.id));
  }

  if (guessWhoManualFolderFilterSelected.size === 0) {
    guessWhoFolders.forEach(folder => guessWhoManualFolderFilterSelected.add(folder.id));
  }

  if (guessWhoLobbyFolderFilter !== 'all' && !folderIds.has(guessWhoLobbyFolderFilter)) {
    guessWhoLobbyFolderFilter = 'all';
  }

  const selectedIds = new Set(guessWhoLibrary.map(character => character.id));
  guessWhoManualSelected = new Set([...guessWhoManualSelected].filter(id => selectedIds.has(id)));
}

function getFolderById(folderId) {
  return guessWhoFolders.find(folder => folder.id === folderId) || null;
}

function getCharacterFolderName(character) {
  return character.folderName || getFolderById(character.folderId)?.name || 'Uncategorized';
}

async function refreshGuessWhoLibraryCount() {
  try {
    const data = await getGuessWhoLibraryData();
    updateGuessWhoLibraryState(data);
    gwLibraryCount.textContent = `${guessWhoLibraryCount} saved Guess Who characters available.`;
    gwLibraryCountLobby.textContent = `Library count: ${guessWhoLibraryCount} across ${guessWhoFolders.length} folder(s)`;
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
    updateGuessWhoAutoFitNote();
    return guessWhoLibraryCount;
  } catch (error) {
    gwLibraryCount.textContent = 'Could not load character library.';
    gwLibraryCountLobby.textContent = 'Library count: unavailable';
    return 0;
  }
}

function renderFolderCheckboxes(container, selectedSet, onChange) {
  if (!container) return;

  container.innerHTML = '';
  if (guessWhoFolders.length === 0) {
    container.appendChild(createElement('p', 'small-note', 'No folders yet. Create folders in the admin page.'));
    return;
  }

  guessWhoFolders.forEach(folder => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedSet.has(folder.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedSet.add(folder.id);
      } else {
        selectedSet.delete(folder.id);
      }
      if (selectedSet.size === 0) {
        checkbox.checked = true;
        selectedSet.add(folder.id);
        setMessage(gwLobbyError, 'At least one folder must stay selected.');
      }
      onChange?.();
    });

    const text = createElement('span', '', `${folder.name} (${folder.characterCount || 0})`);
    text.dir = 'auto';
    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function renderGuessWhoFolderControls() {
  renderFolderCheckboxes(gwRandomFolderOptions, guessWhoRandomFolderSelected, () => {
    setMessage(gwLobbyError, '');
  });

  renderFolderCheckboxes(gwManualFolderOptions, guessWhoManualFolderFilterSelected, () => {
    renderGuessWhoCharacterPicker();
  });

  renderGuessWhoLobbyFolderFilterOptions();
}

function renderGuessWhoLobbyFolderFilterOptions() {
  if (!gwLobbyFolderFilter) return;

  gwLobbyFolderFilter.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = `All folders (${guessWhoLibrary.length})`;
  gwLobbyFolderFilter.appendChild(allOption);

  guessWhoFolders.forEach(folder => {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = `${folder.name} (${folder.characterCount || 0})`;
    gwLobbyFolderFilter.appendChild(option);
  });

  gwLobbyFolderFilter.value = guessWhoLobbyFolderFilter;
}

function getGuessWhoLobbyVisibleCharacters() {
  const query = (gwLobbyLibrarySearch?.value || '').trim().toLowerCase();
  return guessWhoLibrary.filter(character => {
    const folderMatches = guessWhoLobbyFolderFilter === 'all' || character.folderId === guessWhoLobbyFolderFilter;
    const queryMatches = !query || character.name.toLowerCase().includes(query) || getCharacterFolderName(character).toLowerCase().includes(query);
    return folderMatches && queryMatches;
  });
}

function renderSmallCharacterCard(character, options = {}) {
  const card = createElement(options.button ? 'button' : 'div', 'picker-card');
  if (options.button) card.type = 'button';
  if (options.selected) card.classList.add('selected');

  const img = document.createElement('img');
  img.src = character.imageUrl;
  img.alt = character.name;
  img.loading = 'lazy';

  const name = createElement('div', 'name', character.name);
  name.dir = 'auto';

  const folder = createElement('div', 'folder-name', getCharacterFolderName(character));
  folder.dir = 'auto';

  card.appendChild(img);
  card.appendChild(name);
  if (options.showFolder !== false) card.appendChild(folder);
  return card;
}

function renderGuessWhoLobbyLibraryBrowser() {
  if (!gwLobbyLibraryGrid) return;

  const visible = getGuessWhoLobbyVisibleCharacters();
  gwLobbyLibraryGrid.innerHTML = '';
  if (gwLobbyBrowserCount) gwLobbyBrowserCount.textContent = `${visible.length}`;

  if (guessWhoLibrary.length === 0) {
    gwLobbyLibraryGrid.appendChild(createElement('p', 'small-note', 'No characters uploaded yet.'));
    return;
  }

  if (visible.length === 0) {
    gwLobbyLibraryGrid.appendChild(createElement('p', 'small-note', 'No characters match this folder/search.'));
    return;
  }

  visible.forEach(character => {
    gwLobbyLibraryGrid.appendChild(renderSmallCharacterCard(character));
  });
}

function renderAdminFolderSelects() {
  const selects = [adminActiveFolderSelect, adminLibraryFolderFilter];
  selects.forEach(select => {
    if (!select) return;
    const oldValue = select.value;
    select.innerHTML = '';

    if (select === adminLibraryFolderFilter) {
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = `All folders (${guessWhoLibrary.length})`;
      select.appendChild(allOption);
    }

    guessWhoFolders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = `${folder.name} (${folder.characterCount || 0})`;
      select.appendChild(option);
    });

    if ([...select.options].some(option => option.value === oldValue)) {
      select.value = oldValue;
    } else if (select.options.length > 0) {
      select.selectedIndex = 0;
    }
  });
}

function renderAdminFolders() {
  if (!adminFolderList) return;

  adminFolderCount.textContent = `${guessWhoFolders.length}`;
  adminFolderList.innerHTML = '';

  guessWhoFolders.forEach(folder => {
    const row = createElement('div', 'folder-admin-row');
    const info = document.createElement('div');
    const title = createElement('div', 'folder-title', folder.name);
    title.dir = 'auto';
    const meta = createElement('div', 'folder-meta', `${folder.characterCount || 0} character(s)`);
    info.appendChild(title);
    info.appendChild(meta);

    const renameBtn = createElement('button', 'secondary-btn', 'Rename');
    renameBtn.type = 'button';
    renameBtn.addEventListener('click', () => renameAdminFolder(folder));

    const deleteBtn = createElement('button', 'danger-btn', folder.id === 'uncategorized' ? 'Protected' : 'Delete');
    deleteBtn.type = 'button';
    deleteBtn.disabled = folder.id === 'uncategorized';
    deleteBtn.addEventListener('click', () => deleteAdminFolder(folder));

    row.appendChild(info);
    row.appendChild(renameBtn);
    row.appendChild(deleteBtn);
    adminFolderList.appendChild(row);
  });
}

function getAdminVisibleCharacters() {
  const folderId = adminLibraryFolderFilter?.value || 'all';
  const query = (adminLibrarySearch?.value || '').trim().toLowerCase();

  return guessWhoLibrary.filter(character => {
    const folderMatches = folderId === 'all' || character.folderId === folderId;
    const queryMatches = !query || character.name.toLowerCase().includes(query) || getCharacterFolderName(character).toLowerCase().includes(query);
    return folderMatches && queryMatches;
  });
}

function renderAdminCharacters() {
  adminLibraryCount.textContent = `${guessWhoLibrary.length}`;
  adminLibraryGrid.innerHTML = '';

  const visible = getAdminVisibleCharacters();
  if (guessWhoLibrary.length === 0) {
    const empty = createElement('p', 'small-note', 'No characters uploaded yet. Create a folder above, then upload images into it.');
    adminLibraryGrid.appendChild(empty);
    return;
  }

  if (visible.length === 0) {
    adminLibraryGrid.appendChild(createElement('p', 'small-note', 'No characters match this folder/search.'));
    return;
  }

  visible.forEach(character => {
    const card = createElement('div', 'admin-card');
    const img = document.createElement('img');
    img.src = character.imageUrl;
    img.alt = character.name;
    img.loading = 'lazy';

    const name = createElement('div', 'name', character.name);
    name.dir = 'auto';
    const folderName = createElement('div', 'folder-name', getCharacterFolderName(character));
    folderName.dir = 'auto';
    const deleteBtn = createElement('button', 'danger-btn', 'Delete');
    deleteBtn.addEventListener('click', () => deleteAdminCharacter(character.id, character.name));

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(folderName);
    card.appendChild(deleteBtn);
    adminLibraryGrid.appendChild(card);
  });
}

async function loadAdminLibrary() {
  setMessage(adminError, '');
  setMessage(adminStatus, '');

  try {
    const data = await getGuessWhoLibraryData();
    updateGuessWhoLibraryState(data);
    renderAdminFolderSelects();
    renderAdminFolders();
    renderAdminCharacters();
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
  } catch (error) {
    setMessage(adminError, error.message || 'Could not load admin library.');
  }
}

function getAdminPassword() {
  return adminPasswordInput.value.trim();
}

async function adminJsonRequest(url, options = {}) {
  const password = getAdminPassword();
  if (!password) throw new Error('Enter the admin upload password first.');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': password,
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed with status ${response.status}.`);
  return data;
}

async function createAdminFolder() {
  const name = adminNewFolderName.value.trim();
  if (!name) {
    setMessage(adminError, 'Enter a folder name first.');
    return;
  }

  try {
    const data = await adminJsonRequest('/api/admin/guess-who/folders', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    updateGuessWhoLibraryState(data);
    adminNewFolderName.value = '';
    setMessage(adminStatus, `Created folder "${name}".`);
    renderAdminFolderSelects();
    renderAdminFolders();
    renderAdminCharacters();
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
  } catch (error) {
    setMessage(adminError, error.message || 'Could not create folder.');
  }
}

async function renameAdminFolder(folder) {
  const newName = prompt('New folder name:', folder.name);
  if (!newName || !newName.trim()) return;

  try {
    const data = await adminJsonRequest(`/api/admin/guess-who/folders/${encodeURIComponent(folder.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName.trim() })
    });
    updateGuessWhoLibraryState(data);
    setMessage(adminStatus, `Renamed folder to "${newName.trim()}".`);
    renderAdminFolderSelects();
    renderAdminFolders();
    renderAdminCharacters();
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
  } catch (error) {
    setMessage(adminError, error.message || 'Could not rename folder.');
  }
}

async function deleteAdminFolder(folder) {
  if (!confirm(`Delete folder "${folder.name}" and all ${folder.characterCount || 0} character(s) inside it?`)) return;

  try {
    const data = await adminJsonRequest(`/api/admin/guess-who/folders/${encodeURIComponent(folder.id)}`, {
      method: 'DELETE'
    });
    updateGuessWhoLibraryState(data);
    setMessage(adminStatus, `Deleted folder "${folder.name}".`);
    renderAdminFolderSelects();
    renderAdminFolders();
    renderAdminCharacters();
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
  } catch (error) {
    setMessage(adminError, error.message || 'Could not delete folder.');
  }
}

async function uploadAdminImages(files) {
  const password = getAdminPassword();
  if (!password) {
    setMessage(adminError, 'Enter the admin upload password first.');
    return;
  }

  if (!files || files.length === 0) {
    setMessage(adminError, 'Choose images or a folder first.');
    return;
  }

  const folderId = adminActiveFolderSelect.value;
  if (!folderId) {
    setMessage(adminError, 'Create or choose a folder before uploading.');
    return;
  }

  const formData = new FormData();
  formData.append('folderId', folderId);
  Array.from(files).forEach(file => {
    formData.append('images', file, file.name);
  });

  adminUploadBtn.disabled = true;
  adminUploadBtn.textContent = 'Uploading...';
  setMessage(adminError, '');
  setMessage(adminStatus, '');

  try {
    const response = await fetch('/api/admin/guess-who/upload', {
      method: 'POST',
      headers: { 'x-admin-password': password },
      body: formData
    });

    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.message || responseText || `Upload failed with status ${response.status}.`);
    }

    updateGuessWhoLibraryState(data);
    setMessage(adminStatus, `Uploaded ${data.added?.length || 0} character image(s).`);
    adminFileInput.value = '';
    adminFolderInput.value = '';
    renderAdminFolderSelects();
    renderAdminFolders();
    renderAdminCharacters();
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
  } catch (error) {
    setMessage(adminError, error.message || 'Upload failed.');
  } finally {
    adminUploadBtn.disabled = false;
    adminUploadBtn.textContent = 'Upload Selected Images';
  }
}

async function deleteAdminCharacter(id, name) {
  if (!getAdminPassword()) {
    setMessage(adminError, 'Enter the admin upload password first.');
    return;
  }

  if (!confirm(`Delete ${name}?`)) return;

  try {
    const response = await fetch(`/api/admin/guess-who/characters/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': getAdminPassword() }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Delete failed.');

    updateGuessWhoLibraryState(data);
    setMessage(adminStatus, `Deleted ${name}.`);
    renderAdminFolderSelects();
    renderAdminFolders();
    renderAdminCharacters();
    renderGuessWhoFolderControls();
    renderGuessWhoCharacterPicker();
    renderGuessWhoLobbyLibraryBrowser();
  } catch (error) {
    setMessage(adminError, error.message || 'Delete failed.');
  }
}

adminCreateFolderBtn.addEventListener('click', createAdminFolder);
adminUploadBtn.addEventListener('click', () => {
  const files = [...Array.from(adminFileInput.files), ...Array.from(adminFolderInput.files)];
  uploadAdminImages(files);
});
if (adminLibraryFolderFilter) adminLibraryFolderFilter.addEventListener('change', renderAdminCharacters);
if (adminLibrarySearch) adminLibrarySearch.addEventListener('input', renderAdminCharacters);
if (gwLobbyFolderFilter) gwLobbyFolderFilter.addEventListener('change', () => {
  guessWhoLobbyFolderFilter = gwLobbyFolderFilter.value;
  renderGuessWhoLobbyLibraryBrowser();
});
if (gwLobbyLibrarySearch) gwLobbyLibrarySearch.addEventListener('input', renderGuessWhoLobbyLibraryBrowser);

// --------------------------
// Guess Who UI and events
// --------------------------
gwCreateRoomBtn.addEventListener('click', () => {
  const name = gwPlayerNameInput.value.trim();
  if (!name) {
    setMessage(gwSetupError, 'Please enter a name first.');
    return;
  }

  saveName(name);
  setActiveGame('guessWho');
  intentionallyLeftRoom = false;
  gwCreateRoomBtn.disabled = true;
  gwCreateRoomBtn.textContent = 'Creating...';
  setMessage(gwSetupError, '');
  socket.emit('gwCreateRoom', { name, playerId: myPlayerId, boardCapacity: estimateGuessWhoBoardCapacity() });
});

gwJoinRoomBtn.addEventListener('click', () => {
  const name = gwPlayerNameInput.value.trim();
  const code = gwRoomCodeInput.value.trim().toUpperCase();

  if (!name) {
    setMessage(gwSetupError, 'Please enter a name first.');
    return;
  }

  if (!code) {
    setMessage(gwSetupError, 'Please enter a room code.');
    return;
  }

  saveName(name);
  setActiveGame('guessWho');
  intentionallyLeftRoom = false;
  gwJoinRoomBtn.disabled = true;
  gwJoinRoomBtn.textContent = 'Joining...';
  setMessage(gwSetupError, '');
  socket.emit('gwJoinRoom', { roomCode: code, playerName: name, playerId: myPlayerId, boardCapacity: estimateGuessWhoBoardCapacity() });
});

function getGuessWhoRoundOptions() {
  const selectionMode = gwBoardSourceSelect.value === 'selected' ? 'selected' : 'random';

  if (selectionMode === 'selected') {
    const selectedCharacterIds = [...guessWhoManualSelected];
    if (selectedCharacterIds.length < 6) {
      setMessage(gwLobbyError, 'Select at least 6 characters, or switch back to randomize.');
      return null;
    }

    if (selectedCharacterIds.length > 60) {
      setMessage(gwLobbyError, 'Select 60 characters or fewer.');
      return null;
    }

    return { selectionMode, selectedCharacterIds };
  }

  const selectedFolderIds = [...guessWhoRandomFolderSelected];
  if (selectedFolderIds.length === 0) {
    setMessage(gwLobbyError, 'Select at least one folder for the random board.');
    return null;
  }

  return {
    selectionMode: 'random',
    selectedFolderIds,
    autoFit: Boolean(gwAutoFitCheckbox.checked),
    boardSize: gwBoardSizeInput.value
  };
}

gwStartRoundBtn.addEventListener('click', () => {
  setMessage(gwLobbyError, '');
  sendGuessWhoViewportInfo();

  const options = getGuessWhoRoundOptions();
  if (!options) return;

  socket.emit('gwStartSelection', {
    roomCode: guessWhoRoomCode,
    ...options
  });
});

gwResetScoresBtn.addEventListener('click', () => {
  if (confirm('Reset Guess Who scores to zero?')) {
    socket.emit('gwResetScores', guessWhoRoomCode);
  }
});

gwConfirmSecretBtn.addEventListener('click', () => {
  if (!guessWhoSelectedCharacterId) return;
  socket.emit('gwSelectCharacter', {
    roomCode: guessWhoRoomCode,
    characterId: guessWhoSelectedCharacterId
  });
});

gwChatForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = gwChatInput.value.trim();
  if (!text) return;

  socket.emit('gwChatMessage', { roomCode: guessWhoRoomCode, text });
  gwChatInput.value = '';
});

gwRevealBtn.addEventListener('click', () => {
  socket.emit('gwRevealCharacters', guessWhoRoomCode);
});

gwNextRoundBtn.addEventListener('click', () => {
  sendGuessWhoViewportInfo();
  socket.emit('gwNextRound', {
    roomCode: guessWhoRoomCode,
    pointsData: collectGuessWhoPoints(),
    boardSize: gwNextBoardSize.value,
    autoFit: Boolean(gwNextAutoFit.checked)
  });
});

gwReturnLobbyBtn.addEventListener('click', () => {
  socket.emit('gwReturnToLobby', {
    roomCode: guessWhoRoomCode,
    pointsData: collectGuessWhoPoints()
  });
});

function leaveGuessWhoRoom() {
  intentionallyLeftRoom = true;

  if (guessWhoRoomCode) {
    socket.emit('gwLeaveRoom', guessWhoRoomCode);
  }

  localStorage.removeItem('guesswho-roomCode');
  setActiveGame('');
  guessWhoRoomCode = '';
  guessWhoPlayers = [];
  guessWhoBoard = [];
  guessWhoMessages = [];
  guessWhoEliminated = new Set();
  guessWhoMySecret = null;
  resetSetupButtons();
  showScreen('game-select-screen', false);
}

gwLeaveLobbyBtn.addEventListener('click', leaveGuessWhoRoom);
gwLeaveSelectionBtn.addEventListener('click', leaveGuessWhoRoom);
gwLeaveGameBtn.addEventListener('click', leaveGuessWhoRoom);

function collectGuessWhoPoints() {
  const points = {};
  gwPointInputs.querySelectorAll('input[type="number"]').forEach(input => {
    points[input.dataset.id] = parseInt(input.value, 10) || 0;
  });
  return points;
}

function guessWhoEliminatedKey() {
  return `gw-eliminated-${guessWhoRoomCode}-${guessWhoRoundId}-${myPlayerId}`;
}

function loadGuessWhoEliminated() {
  try {
    const saved = JSON.parse(localStorage.getItem(guessWhoEliminatedKey()) || '[]');
    guessWhoEliminated = new Set(Array.isArray(saved) ? saved : []);
  } catch (error) {
    guessWhoEliminated = new Set();
  }
}

function saveGuessWhoEliminated() {
  localStorage.setItem(guessWhoEliminatedKey(), JSON.stringify([...guessWhoEliminated]));
}


function updateGuessWhoBoardSourceUI() {
  const manual = gwBoardSourceSelect.value === 'selected';
  gwManualOptions.classList.toggle('hidden', !manual);
  gwRandomOptions.classList.toggle('hidden', manual);
  renderGuessWhoFolderControls();
  renderGuessWhoCharacterPicker();
}

function getFilteredGuessWhoLibrary() {
  const query = guessWhoLibraryFilter.trim().toLowerCase();
  return guessWhoLibrary.filter(character => {
    const folderMatches = guessWhoManualFolderFilterSelected.has(character.folderId || 'uncategorized');
    const queryMatches = !query || character.name.toLowerCase().includes(query) || getCharacterFolderName(character).toLowerCase().includes(query);
    return folderMatches && queryMatches;
  });
}

function renderGuessWhoCharacterPicker() {
  if (!gwCharacterPicker) return;

  const filtered = getFilteredGuessWhoLibrary();
  gwCharacterPicker.innerHTML = '';
  gwSelectedCount.textContent = `${guessWhoManualSelected.size} selected`;

  if (guessWhoLibrary.length === 0) {
    gwCharacterPicker.appendChild(createElement('p', 'small-note', 'No saved characters yet. Upload characters from the admin page first.'));
    return;
  }

  if (filtered.length === 0) {
    gwCharacterPicker.appendChild(createElement('p', 'small-note', 'No characters match this search.'));
    return;
  }

  filtered.forEach(character => {
    const card = renderSmallCharacterCard(character, {
      button: true,
      selected: guessWhoManualSelected.has(character.id)
    });
    card.dataset.id = character.id;
    card.addEventListener('click', () => {
      if (guessWhoManualSelected.has(character.id)) {
        guessWhoManualSelected.delete(character.id);
      } else {
        guessWhoManualSelected.add(character.id);
      }
      renderGuessWhoCharacterPicker();
    });

    gwCharacterPicker.appendChild(card);
  });
}

if (gwBoardSourceSelect) gwBoardSourceSelect.addEventListener('change', updateGuessWhoBoardSourceUI);
if (gwCharacterSearch) gwCharacterSearch.addEventListener('input', () => {
  guessWhoLibraryFilter = gwCharacterSearch.value;
  renderGuessWhoCharacterPicker();
});
if (gwSelectVisibleBtn) gwSelectVisibleBtn.addEventListener('click', () => {
  getFilteredGuessWhoLibrary().forEach(character => guessWhoManualSelected.add(character.id));
  renderGuessWhoCharacterPicker();
});
if (gwClearSelectionBtn) gwClearSelectionBtn.addEventListener('click', () => {
  guessWhoManualSelected.clear();
  renderGuessWhoCharacterPicker();
});
if (gwAutoFitCheckbox) gwAutoFitCheckbox.addEventListener('change', () => {
  gwBoardSizeInput.disabled = gwAutoFitCheckbox.checked;
});
if (gwNextAutoFit) gwNextAutoFit.addEventListener('change', () => {
  gwNextBoardSize.disabled = gwNextAutoFit.checked;
});

function renderGuessWhoPlayers() {
  const lists = [gwPlayerList, gwGamePlayerList];
  lists.forEach(list => { list.innerHTML = ''; });

  guessWhoPlayers.forEach(player => {
    lists.forEach(list => {
      const item = document.createElement('li');
      if (player.offline) item.className = 'offline-player';

      const left = document.createElement('span');
      left.textContent = `${player.name} (${player.score || 0} pts)`;
      appendOfflineTag(left, player.offline);
      item.appendChild(left);

      const badges = document.createElement('span');
      badges.style.display = 'flex';
      badges.style.gap = '6px';
      badges.style.alignItems = 'center';

      if (player.isHost) badges.appendChild(createElement('span', 'pill', 'HOST'));
      if (player.hasSelected && guessWhoStatus !== 'lobby') badges.appendChild(createElement('span', 'pill green', 'PICKED'));

      item.appendChild(badges);
      list.appendChild(item);
    });
  });

  const me = guessWhoPlayers.find(player => player.playerId === myPlayerId);
  const isHost = Boolean(me?.isHost);
  gwHostControls.classList.toggle('hidden', !isHost || guessWhoStatus !== 'lobby');
  gwRevealBtn.classList.toggle('hidden', !isHost || guessWhoStatus !== 'playing');
  gwPointsPanel.classList.toggle('hidden', !isHost);

  if (guessWhoPlayers.length < 2) {
    gwLobbyStatus.textContent = 'Waiting for the second player...';
  } else {
    gwLobbyStatus.textContent = isHost ? 'Both players are here. Start character selection.' : 'Waiting for the host to start.';
  }
}

function createCharacterCard(character, options = {}) {
  const card = createElement('button', 'character-card');
  card.type = 'button';
  card.dataset.id = character.id;

  if (options.selected) card.classList.add('selected');
  if (options.eliminated) card.classList.add('eliminated');

  const img = document.createElement('img');
  img.src = character.imageUrl;
  img.alt = character.name;
  img.loading = 'lazy';

  const name = createElement('div', 'name', character.name);
  name.dir = 'auto';
  card.appendChild(img);
  card.appendChild(name);
  return card;
}

function renderGuessWhoSelection() {
  gwSelectionGrid.innerHTML = '';
  gwConfirmSecretBtn.disabled = !guessWhoSelectedCharacterId;

  if (guessWhoMySecret) {
    gwSelectionHelp.textContent = 'You picked your secret character. Waiting for the other player.';
    gwSelectedSecretPreview.classList.remove('hidden');
    gwSelectedSecretPreview.innerHTML = '';
    gwSelectedSecretPreview.appendChild(renderSecretCardContent(guessWhoMySecret, 'Your secret character'));
    gwConfirmSecretBtn.disabled = true;
  } else {
    gwSelectionHelp.textContent = 'Choose one character. The other player will not see your choice.';
    gwSelectedSecretPreview.classList.add('hidden');
  }

  guessWhoBoard.forEach(character => {
    const card = createCharacterCard(character, {
      selected: character.id === guessWhoSelectedCharacterId || character.id === guessWhoMySecret?.id
    });

    card.disabled = Boolean(guessWhoMySecret);
    card.addEventListener('click', () => {
      if (guessWhoMySecret) return;
      guessWhoSelectedCharacterId = character.id;
      renderGuessWhoSelection();
    });

    gwSelectionGrid.appendChild(card);
  });
}

function renderSecretCardContent(character, labelText) {
  const wrapper = createElement('div', 'secret-card');
  const img = document.createElement('img');
  img.src = character.imageUrl;
  img.alt = character.name;

  const text = document.createElement('div');
  const label = createElement('div', 'small-note', labelText);
  const name = createElement('h3', '', character.name);
  name.dir = 'auto';
  name.style.margin = '3px 0 0 0';
  text.appendChild(label);
  text.appendChild(name);

  wrapper.appendChild(img);
  wrapper.appendChild(text);
  return wrapper;
}

function renderGuessWhoBoard() {
  gwBoardGrid.innerHTML = '';

  if (guessWhoMySecret) {
    gwMySecret.classList.remove('hidden');
    gwMySecret.innerHTML = '';
    gwMySecret.appendChild(renderSecretCardContent(guessWhoMySecret, 'Your secret character'));
  } else {
    gwMySecret.classList.add('hidden');
  }

  guessWhoBoard.forEach(character => {
    const card = createCharacterCard(character, {
      eliminated: guessWhoEliminated.has(character.id)
    });

    card.addEventListener('click', () => {
      if (guessWhoEliminated.has(character.id)) {
        guessWhoEliminated.delete(character.id);
      } else {
        guessWhoEliminated.add(character.id);
      }
      saveGuessWhoEliminated();
      renderGuessWhoBoard();
    });

    gwBoardGrid.appendChild(card);
  });
}

function renderGuessWhoMessages() {
  gwChatBox.innerHTML = '';

  guessWhoMessages.forEach(message => {
    const item = createElement('div', message.system ? 'chat-message system' : 'chat-message');

    if (message.system) {
      item.textContent = message.text;
    } else {
      const name = createElement('span', 'name', `${message.name}: `);
      const body = createElement('span', '', message.text);
      body.dir = 'auto';
      const time = createElement('span', 'small-note', ` ${getTimeLabel(message.timestamp)}`);
      item.appendChild(name);
      item.appendChild(body);
      item.appendChild(time);
    }

    gwChatBox.appendChild(item);
  });

  gwChatBox.scrollTop = gwChatBox.scrollHeight;
}

function renderGuessWhoReveal() {
  const isRevealed = guessWhoStatus === 'revealed';
  gwRevealedPanel.classList.toggle('hidden', !isRevealed);
  gwRevealGrid.innerHTML = '';

  if (!isRevealed) return;

  guessWhoRevealedSecrets.forEach(secret => {
    const panel = createElement('div', 'panel');
    if (secret.character) {
      panel.appendChild(renderSecretCardContent(secret.character, `${secret.name}'s character`));
    } else {
      panel.appendChild(createElement('p', 'small-note', `${secret.name} did not choose a character.`));
    }
    gwRevealGrid.appendChild(panel);
  });

  renderGuessWhoPointInputs();
}

function renderGuessWhoPointInputs() {
  gwPointInputs.innerHTML = '';
  guessWhoPlayers.forEach(player => {
    const row = document.createElement('div');
    row.style = 'display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px;';

    const label = createElement('span', '', `${player.name} (${player.score || 0} pts)`);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '0';
    input.dataset.id = player.playerId;
    input.style.width = '92px';
    input.style.margin = '0';

    row.appendChild(label);
    row.appendChild(input);
    gwPointInputs.appendChild(row);
  });
}

function handleGuessWhoState(state) {
  rememberGuessWhoRoom(state.roomCode);
  resetSetupButtons();

  const oldRoundId = guessWhoRoundId;
  guessWhoPlayers = state.players || [];
  guessWhoBoard = state.board || [];
  guessWhoMessages = state.messages || [];
  guessWhoStatus = state.status || 'lobby';
  guessWhoRoundId = state.roundId || 0;
  guessWhoMySecret = state.mySecret || null;
  guessWhoRevealedSecrets = state.revealedSecrets || [];

  if (oldRoundId !== guessWhoRoundId) {
    guessWhoSelectedCharacterId = '';
    loadGuessWhoEliminated();
  }

  renderGuessWhoPlayers();
  setMessage(gwSetupError, '');
  setMessage(gwLobbyError, '');
  setMessage(gwSelectionError, '');
  setMessage(gwGameError, '');

  if (guessWhoStatus === 'lobby') {
    showScreen('gw-lobby-screen', true);
    refreshGuessWhoLibraryCount();
    updateGuessWhoBoardSourceUI();
    return;
  }

  if (guessWhoStatus === 'selecting') {
    showScreen('gw-selection-screen', true);
    renderGuessWhoSelection();
    return;
  }

  showScreen('gw-game-screen', true);
  renderGuessWhoBoard();
  renderGuessWhoMessages();
  renderGuessWhoReveal();
  renderGuessWhoPlayers();
}

socket.on('gwState', handleGuessWhoState);

socket.on('gwChatMessage', message => {
  if (!guessWhoMessages.some(existing => existing.id === message.id)) {
    guessWhoMessages.push(message);
    guessWhoMessages = guessWhoMessages.slice(-100);
    renderGuessWhoMessages();
  }
});

socket.on('gwErrorMsg', message => {
  setMessage(gwSetupError, message);
  setMessage(gwLobbyError, message);
  setMessage(gwSelectionError, message);
  setMessage(gwGameError, message);
  resetSetupButtons();
});

socket.on('gwRejoinFailed', () => {
  localStorage.removeItem('guesswho-roomCode');
  guessWhoRoomCode = '';
  resetSetupButtons();
  showScreen('gw-setup-screen', false);
  setMessage(gwSetupError, 'Could not rejoin the previous Guess Who room. It may have expired.');
});

// --------------------------
// Initial view
// --------------------------
updateGuessWhoBoardSourceUI();
updateGuessWhoAutoFitNote();
if (gwAutoFitCheckbox) gwBoardSizeInput.disabled = gwAutoFitCheckbox.checked;
if (gwNextAutoFit) gwNextBoardSize.disabled = gwNextAutoFit.checked;

(function init() {
  let activeGame = localStorage.getItem('party-activeGame');
  const hasImposterRoom = localStorage.getItem('imposter-roomCode');
  const hasGuessWhoRoom = localStorage.getItem('guesswho-roomCode');

  if (!activeGame) {
    activeGame = hasGuessWhoRoom ? 'guessWho' : (hasImposterRoom ? 'imposter' : '');
  }

  if (activeGame === 'imposter' && hasImposterRoom) {
    localStorage.setItem('party-activeGame', 'imposter');
    showScreen('setup-screen', false);
    requestCurrentState();
    return;
  }

  if (activeGame === 'guessWho' && hasGuessWhoRoom) {
    localStorage.setItem('party-activeGame', 'guessWho');
    showScreen('gw-setup-screen', false);
    requestCurrentState();
    return;
  }

  if (hasImposterRoom) {
    localStorage.setItem('party-activeGame', 'imposter');
    showScreen('setup-screen', false);
    requestCurrentState();
    return;
  }

  if (hasGuessWhoRoom) {
    localStorage.setItem('party-activeGame', 'guessWho');
    showScreen('gw-setup-screen', false);
    requestCurrentState();
    return;
  }

  showGameSelect();
})();
