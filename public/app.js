const handElement = document.querySelector('#hand-cards');
const playedElement = document.querySelector('#played-hand');
const selectedCards = new Set();
let savedRoom = null;
try {
  savedRoom = JSON.parse(localStorage.getItem('chiPoRoom') || 'null');
} catch (error) {
  localStorage.removeItem('chiPoRoom');
}
let credentials = savedRoom && typeof savedRoom.roomCode === 'string' && typeof savedRoom.token === 'string'
  ? savedRoom
  : null;
let currentState = null;
let busy = false;
const queryRoom = new URLSearchParams(window.location.search).get('room');
if (queryRoom && credentials?.roomCode !== queryRoom.toUpperCase()) {
  credentials = null;
  localStorage.removeItem('chiPoRoom');
}

function makeCard(card, selectable = false) {
  const element = document.createElement(selectable ? 'button' : 'div');
  element.className = `playing-card${['♥', '♦'].includes(card.suit) ? ' red' : ''}`;
  if (selectable) {
    element.type = 'button';
    element.classList.add('card-choice');
    element.dataset.cardId = card.id;
    element.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
    element.setAttribute('aria-pressed', String(selectedCards.has(card.id)));
    if (selectedCards.has(card.id)) element.classList.add('selected');
  }
  const rank = document.createElement('span');
  rank.textContent = card.rank;
  const suit = document.createElement('span');
  suit.className = 'card-suit';
  suit.textContent = card.suit;
  element.append(rank, suit);
  return element;
}

function showScreen(screen) {
  document.querySelector('#room-setup').hidden = screen !== 'setup';
  document.querySelector('#room-lobby').hidden = screen !== 'lobby';
  document.querySelector('#game-layout').hidden = screen !== 'game';
}

function renderLobby(state) {
  showScreen('lobby');
  document.querySelector('#room-code-display').textContent = state.roomCode;
  document.querySelector('#room-player-total').textContent = `${state.lobbyPlayers.length} / ${state.maxPlayers}`;
  document.querySelector('#lobby-message').textContent = state.message;
  document.querySelector('#start-game-button').hidden = !state.isHost;
  document.querySelector('#start-game-button').disabled = busy || state.lobbyPlayers.length < 2;
  document.querySelector('#lobby-error').textContent = '';
  const roster = document.querySelector('#room-roster');
  roster.replaceChildren();
  for (const player of state.lobbyPlayers) {
    const item = document.createElement('li');
    const playerName = document.createElement('span');
    playerName.textContent = player.name + (player.isYou ? ' (you)' : '');
    const badge = document.createElement('span');
    badge.className = player.isHost ? 'host-badge' : 'player-badge';
    badge.textContent = player.isHost ? 'HOST' : 'JOINED';
    item.append(playerName, badge);
    roster.append(item);
  }
}

function renderGame(state) {
  showScreen('game');
  selectedCards.forEach((cardId) => {
    if (!state.hand.some((card) => card.id === cardId)) selectedCards.delete(cardId);
  });
  document.querySelector('#game-number').textContent = `GAME ${String(state.gameNumber).padStart(2, '0')}`;
  document.querySelector('#table-room-code').textContent = `ROOM ${state.roomCode}`;
  document.querySelector('#table-message').textContent = state.message;
  document.querySelector('#direction').textContent = state.direction.toUpperCase();
  document.querySelector('#trick-leader').textContent = `LEAD ${state.leadPlayerName || '—'}`;
  document.querySelector('#players-in-game').textContent = `${state.playerCount} PLAYERS`;
  document.querySelector('#burn-note').textContent = `${state.burnedCardCount} CARD${state.burnedCardCount === 1 ? '' : 'S'} BURNED`;
  document.querySelector('#finish-line').textContent = state.playerCount === 2 ? 'FIRST OUT WINS' : 'LAST PLAYER OUT LOSES';
  document.querySelector('#hand-count').textContent = `${state.handCount} cards`;
  document.querySelector('#status-cards').textContent = String(state.handCount);
  document.querySelector('#status-direction').textContent = state.directionLocked
    ? state.direction
    : `${state.direction} · pending first beat`;
  document.querySelector('#status-places').textContent = state.finishOrder.length
    ? state.finishOrder.join(' → ')
    : '—';
  document.querySelector('#status-play').textContent = state.currentPlay?.name || 'Lead a hand';

  for (const [index, player] of state.players.entries()) {
    const seat = document.querySelector(`#seat-${index}`);
    if (!seat) continue;
    seat.hidden = false;
    seat.classList.toggle('is-out', player.isOut);
    seat.classList.toggle('is-active', player.isTurn);
    seat.classList.toggle('is-you', player.id === state.yourPlayerId);
    seat.querySelector('.avatar').textContent = player.id === state.yourPlayerId
      ? 'YOU'
      : player.name.slice(0, 2).toUpperCase();
    seat.querySelector('.player-name').textContent = player.name;
    seat.querySelector('.player-count').textContent = player.isOut
      ? `OUT · #${player.finishPlace}`
      : `${player.handCount} card${player.handCount === 1 ? '' : 's'}`;
    const status = seat.querySelector('.seat-status');
    status.textContent = player.isOut ? `#${player.finishPlace}` : player.isTurn ? 'YOUR TURN' : '';
  }
  for (let index = state.players.length; index < 4; index++) {
    document.querySelector(`#seat-${index}`).hidden = true;
  }

  handElement.replaceChildren();
  for (const card of state.hand) handElement.append(makeCard(card, true));

  playedElement.replaceChildren();
  if (state.currentPlay) {
    const label = document.createElement('span');
    label.className = 'played-by';
    label.textContent = `${state.currentPlay.playerName} · ${state.currentPlay.name}`;
    playedElement.append(label);
    const cards = document.createElement('div');
    cards.className = 'played-cards';
    for (const card of state.currentPlay.cards) cards.append(makeCard(card));
    playedElement.append(cards);
  } else {
    const waiting = document.createElement('span');
    waiting.className = 'waiting-play';
    waiting.textContent = state.stage === 'finished' ? 'GAME OVER' : 'LEAD A HAND';
    playedElement.append(waiting);
  }

  const log = document.querySelector('#game-log');
  log.replaceChildren();
  if (state.log.length === 0) {
    const item = document.createElement('li');
    item.className = 'empty-log';
    item.textContent = 'Plays will appear here.';
    log.append(item);
  } else {
    for (const entry of [...state.log].reverse()) {
      const item = document.createElement('li');
      item.textContent = entry;
      log.append(item);
    }
  }

  const active = state.canAct && !busy && state.stage === 'playing';
  document.querySelector('#play-button').disabled = !active;
  document.querySelector('#pass-button').disabled = !active || !state.currentPlay;
  document.querySelector('#action-title').textContent = state.stage === 'finished'
    ? 'Game over'
    : state.canAct ? 'Your turn' : 'Waiting for your turn';
  document.querySelector('#new-game-button').disabled = busy || !state.isHost;
  document.querySelector('#error-message').textContent = '';
  if (state.openingLead && state.canAct) {
    document.querySelector('#action-title').textContent = 'Your lead must include 3♦';
  }
}

function render(state) {
  currentState = state;
  if (state.stage === 'lobby') renderLobby(state);
  else renderGame(state);
}

async function request(path, data, useRoomToken = true) {
  const headers = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (useRoomToken && credentials) headers.Authorization = `Bearer ${credentials.token}`;
  const response = await fetch(path, {
    method: data ? 'POST' : 'GET',
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function saveRoom(result) {
  credentials = { roomCode: result.roomCode, token: result.token };
  localStorage.setItem('chiPoRoom', JSON.stringify(credentials));
  render(result.state);
}

async function performRoomAction(path, data) {
  if (busy || !credentials) return;
  busy = true;
  if (currentState?.stage === 'lobby') {
    document.querySelector('#lobby-error').textContent = '';
    document.querySelector('#start-game-button').disabled = true;
  } else {
    document.querySelector('#error-message').textContent = '';
    document.querySelector('#play-button').disabled = true;
    document.querySelector('#pass-button').disabled = true;
  }
  try {
    const state = await request(`/api/rooms/${credentials.roomCode}/${path}`, data);
    busy = false;
    render(state);
  } catch (error) {
    busy = false;
    if (currentState) render(currentState);
    if (currentState?.stage === 'lobby') document.querySelector('#lobby-error').textContent = error.message;
    else document.querySelector('#error-message').textContent = error.message;
  }
}

document.querySelector('#create-room-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.querySelector('#room-error');
  error.textContent = '';
  try {
    const result = await request('/api/rooms', {
      name: document.querySelector('#create-name').value,
      maxPlayers: Number(document.querySelector('#room-size').value),
    }, false);
    saveRoom(result);
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.querySelector('#join-room-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.querySelector('#room-error');
  error.textContent = '';
  try {
    const result = await request('/api/rooms/join', {
      name: document.querySelector('#join-name').value,
      code: document.querySelector('#join-code').value,
    }, false);
    saveRoom(result);
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.querySelector('#start-game-button').addEventListener('click', () => {
  performRoomAction('start', {});
});
document.querySelector('#new-game-button').addEventListener('click', () => {
  performRoomAction('new-game', {});
});
document.querySelector('#play-button').addEventListener('click', () => {
  performRoomAction('action', { action: 'play', cardIds: [...selectedCards] });
});
document.querySelector('#pass-button').addEventListener('click', () => {
  performRoomAction('action', { action: 'pass' });
});
document.querySelector('#copy-invite').addEventListener('click', async () => {
  const invite = new URL(window.location.href);
  invite.searchParams.set('room', credentials.roomCode);
  try {
    await navigator.clipboard.writeText(invite.toString());
    document.querySelector('#invite-feedback').textContent = 'Invite link copied. Send it to your friends.';
  } catch (error) {
    document.querySelector('#invite-feedback').textContent = `Copy this code instead: ${credentials.roomCode}`;
  }
});

handElement.addEventListener('click', (event) => {
  const card = event.target.closest('button[data-card-id]');
  if (!card || busy || !currentState?.canAct) return;
  if (selectedCards.has(card.dataset.cardId)) selectedCards.delete(card.dataset.cardId);
  else selectedCards.add(card.dataset.cardId);
  card.classList.toggle('selected', selectedCards.has(card.dataset.cardId));
  card.setAttribute('aria-pressed', String(selectedCards.has(card.dataset.cardId)));
});

async function refreshRoom() {
  if (!credentials || busy || document.hidden) return;
  try {
    render(await request(`/api/rooms/${credentials.roomCode}`));
  } catch (error) {
    const errorElement = currentState?.stage === 'lobby'
      ? document.querySelector('#lobby-error')
      : document.querySelector('#error-message');
    errorElement.textContent = error.message;
  }
}

if (queryRoom) document.querySelector('#join-code').value = queryRoom.toUpperCase();

if (credentials) {
  showScreen('lobby');
  request(`/api/rooms/${credentials.roomCode}`)
    .then(render)
    .catch((error) => {
      credentials = null;
      localStorage.removeItem('chiPoRoom');
      showScreen('setup');
      document.querySelector('#room-error').textContent = error.message;
    });
} else {
  showScreen('setup');
}

window.setInterval(refreshRoom, 1200);
