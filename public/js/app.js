const WS_PROTO = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = WS_PROTO + '//' + location.host + '/ws';

let socket = null;
let playerId = null;
let isHost = false;
let isDrawer = false;
let drawerId = null;
let canvasInstance = null;
let players = [];

const $ = id => document.getElementById(id);

// --- Initialization & Session ---

window.addEventListener('load', () => {
  const savedName = localStorage.getItem('scribbl_nickname');
  if (!savedName) {
    $('nickname-popup').classList.remove('hidden');
  } else {
    $('nickname-show').textContent = savedName;
    $('nickname').value = savedName; // Fallback
  }

  const room = sessionStorage.getItem('scribbl_room');
  if (room && savedName) {
    connect(savedName, room);
  }
});

$('popup-go').addEventListener('click', () => {
  const name = $('popup-nickname').value.trim();
  if (!name) return;
  localStorage.setItem('scribbl_nickname', name);
  $('nickname-show').textContent = name;
  $('nickname-popup').classList.add('hidden');
});

$('edit-name').addEventListener('click', () => {
  $('popup-nickname').value = localStorage.getItem('scribbl_nickname') || '';
  $('nickname-popup').classList.remove('hidden');
});

function clearSession() {
  sessionStorage.removeItem('scribbl_room');
  sessionStorage.removeItem('scribbl_session');
}

function showScreen(id) {
  ['lobby', 'waiting', 'game'].forEach(s => $(s).classList.toggle('hidden', s !== id));
}

// --- Connection ---

function connect(name, code) {
  socket = new WebSocket(WS_URL);
  socket.onopen = () => {
    if (code) {
      send('join_room', { code, name });
    } else {
      send('create_room', { name });
    }
  };
  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleMessage(msg);
    } catch (err) {
      /* ignore bad messages */
    }
  };
  socket.onclose = () => {
    socket = null;
    if (!$('game').classList.contains('hidden') || !$('waiting').classList.contains('hidden')) {
      addChatMsg(null, 'system', 'disconnected from server');
    }
  };
}

function send(type, payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

function handleMessage(msg) {
  const p = msg.payload || {};
  switch (msg.type) {
    case 'room_joined': onRoomJoined(p); break;
    case 'player_joined': onPlayerJoined(p); break;
    case 'player_left': onPlayerLeft(p); break;
    case 'game_started': onGameStarted(p); break;
    case 'new_round': onNewRound(p); break;
    case 'word_options': onWordOptions(p); break;
    case 'your_word': onYourWord(p); break;
    case 'word_hint': onWordHint(p); break;
    case 'draw': onDraw(p); break;
    case 'draw_history': onDrawHistory(p); break;
    case 'clear_canvas': onClearCanvas(p); break;
    case 'chat': onChat(p); break;
    case 'timer': onTimer(p); break;
    case 'round_ended': onRoundEnded(p); break;
    case 'game_over': onGameOver(p); break;
    case 'error': onError(p); break;
  }
}

/* ---- Lobby ---- */

$('create-room').addEventListener('click', () => {
  const name = localStorage.getItem('scribbl_nickname') || 'Player';
  $('lobby-error').classList.add('hidden');
  connect(name, null);
});

$('join-room').addEventListener('click', () => {
  const name = localStorage.getItem('scribbl_nickname') || 'Player';
  const code = $('room-code').value.trim().toUpperCase();
  if (!code) { showError('enter a room code'); return; }
  $('lobby-error').classList.add('hidden');
  connect(name, code);
});

$('room-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-room').click(); });
$('popup-nickname').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('popup-go').click(); });

function showError(msg) {
  const el = $('lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ---- Waiting Room ---- */

$('leave-waiting').addEventListener('click', () => {
  clearSession();
  if (socket) { socket.close(); socket = null; }
  showScreen('lobby');
});

/* ---- Game ---- */

$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  send('chat', { message: text });
  input.value = '';
}

/* ---- Handlers ---- */

function onRoomJoined(p) {
  sessionStorage.setItem('scribbl_room', p.code);
  sessionStorage.setItem('scribbl_session', 'active');
  
  playerId = p.playerId;
  isHost = playerId === p.hostId;
  players = p.players || [];

  if (p.game && p.game.state && p.game.state !== 'waiting') {
    showScreen('game');
    $('game-room-code').textContent = p.code;
    initGameView(p);
    return;
  }

  showScreen('waiting');
  $('waiting-code').textContent = p.code;
  updateWaitingPlayers(players);
  $('start-game-btn').classList.toggle('hidden', !isHost || players.length < 2);

  $('start-game-btn').onclick = () => send('start_game', {});
}

function onPlayerJoined(p) {
  if (p.players) players = p.players;
  if (!$('waiting').classList.contains('hidden')) {
    updateWaitingPlayers(players);
    $('start-game-btn').classList.toggle('hidden', !isHost || players.length < 2);
  } else if (!$('game').classList.contains('hidden')) {
    renderScores();
  }
}

function onPlayerLeft(p) {
  if (p.players) players = p.players;
  if (p.hostId !== undefined) isHost = playerId === p.hostId;

  if (!$('waiting').classList.contains('hidden')) {
    updateWaitingPlayers(players);
    $('start-game-btn').classList.toggle('hidden', !isHost || players.length < 2);
  } else if (!$('game').classList.contains('hidden')) {
    renderScores();
  }
}

function updateWaitingPlayers(players) {
  const list = $('waiting-player-list');
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = '<span>' + esc(p.name) + '</span>' + (p.host ? '<span class="host-badge">host</span>' : '');
    list.appendChild(li);
  });
  $('waiting-count').textContent = players.length + ' player' + (players.length !== 1 ? 's' : '');
}

function initGameView(p) {
  if (!canvasInstance) {
    canvasInstance = new Canvas('draw-canvas', 'toolbar');
  }
  canvasInstance.disable();
  canvasInstance.clear();

  const game = p.game || {};
  if (game.drawerId) drawerId = game.drawerId;
  isDrawer = drawerId === playerId;

  $('timer-display').textContent = game.timer != null ? game.timer : '--';
  $('drawer-name').textContent = getPlayerName(drawerId) || '--';
  $('round-info').textContent = (game.round || 0) + '/' + (game.maxRounds || 0);
  $('word-hint').textContent = '';
  renderScores();
}

function onGameStarted(p) {
  $('start-game-btn').classList.add('hidden');
  showScreen('game');
  $('game-room-code').textContent = $('waiting-code').textContent;
  initGameView(p);
}

function onNewRound(p) {
  if ($('game').classList.contains('hidden')) {
    showScreen('game');
    initGameView(p);
  }
  
  drawerId = p.drawerId;
  isDrawer = drawerId === playerId;
  $('round-info').textContent = p.round + '/' + p.maxRounds;
  $('timer-display').textContent = '--';
  $('drawer-name').textContent = getPlayerName(drawerId) || '--';
  $('word-hint').textContent = '';

  if (!canvasInstance) {
    canvasInstance = new Canvas('draw-canvas', 'toolbar');
  }
  canvasInstance.disable();
  canvasInstance.clearHistory();
  $('word-pick').classList.add('hidden');
  $('word-reveal').classList.add('hidden');
  renderScores();
  addChatMsg(null, 'system', getPlayerName(drawerId) + ' is drawing!');
}

function onWordOptions(p) {
  if (!isDrawer) return;
  const container = $('word-options');
  container.innerHTML = '';
  $('word-pick').classList.remove('hidden');
  $('word-reveal').classList.add('hidden');

  (p.options || []).forEach(word => {
    const btn = document.createElement('button');
    btn.textContent = word;
    btn.addEventListener('click', () => {
      send('select_word', { word });
      $('word-pick').classList.add('hidden');
    });
    container.appendChild(btn);
  });
}

function onYourWord(p) {
  if (!isDrawer) return;
  $('word-reveal').classList.remove('hidden');
  $('your-word').textContent = p.word;

  canvasInstance.enable(
    (prevX, prevY, x, y, color, size, type) => send('draw', { type, prevX, prevY, x, y, color, size }),
    () => send('clear_canvas', {})
  );
}

function onWordHint(p) {
  if (!isDrawer) {
    $('word-hint').textContent = p.hint;
  }
}

function onDraw(p) {
  canvasInstance.addAction(p);
}

function onDrawHistory(p) {
  if (canvasInstance) canvasInstance.setHistory(p.actions || []);
}

function onClearCanvas() {
  canvasInstance.clearHistory();
}

function onChat(p) {
  const type = p.isDrawer ? 'drawer-msg' : p.isCorrect ? 'correct' : 'normal';
  addChatMsg(p.playerId, type, p.name, p.message);
  if (p.scores) {
    Object.entries(p.scores).forEach(([id, score]) => {
      const pl = players.find(x => x.id === id);
      if (pl) pl.score = score;
    });
    renderScores();
  }
}

function addChatMsg(pid, type, name, message) {
  const container = $('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + type;

  if (type === 'system') {
    div.textContent = name || '';
  } else if (type === 'drawer-msg') {
    div.innerHTML = '<span class="chat-text">' + esc(name) + ' (drawer)</span>';
  } else {
    div.innerHTML = '<span class="chat-name">' + esc(name) + ':</span><span class="chat-text">' + esc(message) + '</span>';
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function onTimer(p) {
  $('timer-display').textContent = p.time != null ? p.time : '--';
}

function onRoundEnded(p) {
  canvasInstance.disable();
  canvasInstance.clearHistory();
  $('word-pick').classList.add('hidden');
  $('word-reveal').classList.add('hidden');
  $('word-hint').textContent = '';

  if (p.scores) {
    Object.entries(p.scores).forEach(([id, score]) => {
      const pl = players.find(x => x.id === id);
      if (pl) pl.score = score;
    });
    renderScores();
  }

  const overlay = $('round-overlay');
  overlay.classList.remove('hidden');
  $('round-word-reveal').textContent = p.word || '---';
  $('round-drawer-reveal').textContent = (getPlayerName(p.drawerId) || 'someone') + ' was drawing';

  setTimeout(() => overlay.classList.add('hidden'), 3000);
}

function onGameOver(p) {
  canvasInstance.disable();
  canvasInstance.clearHistory();
  $('word-hint').textContent = '';

  const overlay = $('game-over-overlay');
  const list = $('final-scores');
  list.innerHTML = '';

  const sorted = Object.entries(p.scores || {}).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([id, score]) => {
    const li = document.createElement('li');
    li.innerHTML = esc(getPlayerName(id) || id) + ' <span class="score-val">' + score + ' pts</span>';
    list.appendChild(li);
  });

  overlay.classList.remove('hidden');
}

$('back-to-lobby').addEventListener('click', () => {
  $('game-over-overlay').classList.add('hidden');
  clearSession();
  if (socket) { socket.close(); socket = null; }
  showScreen('lobby');
  canvasInstance = null;
  players = [];
});

function onError(p) {
  if (p.message === 'Room not found') {
    clearSession();
    showError('room not found');
    if (socket) { socket.close(); socket = null; }
    showScreen('lobby');
  }
}

/* ---- Helpers ---- */

function renderScores() {
  const container = $('scores-list');
  container.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'score-item' + (p.id === drawerId ? ' drawer' : '');
    div.innerHTML = '<span>' + esc(p.name) + '</span><span class="score-pts">' + p.score + '</span>';
    container.appendChild(div);
  });
}

function getPlayerName(id) {
  const p = players.find(x => x.id === id);
  return p ? p.name : null;
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
