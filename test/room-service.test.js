const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomService } = require('../src/room-service');
const { findPlays } = require('../src/web-game');

test('creates a private room and lets friends join up to its capacity', () => {
  const rooms = new RoomService();
  const host = rooms.createRoom({ name: 'Host', maxPlayers: 2 });
  assert.match(host.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(host.state.stage, 'lobby');
  assert.equal(host.state.lobbyPlayers.length, 1);

  const guest = rooms.joinRoom({ code: host.roomCode.toLowerCase(), name: 'Friend' });
  assert.equal(guest.state.lobbyPlayers.length, 2);
  assert.throws(() => rooms.joinRoom({ code: host.roomCode, name: 'Another friend' }), /room is full/);

  const largerRoom = rooms.createRoom({ name: 'Host', maxPlayers: 3 });
  rooms.joinRoom({ code: largerRoom.roomCode, name: 'Friend' });
  assert.throws(() => rooms.joinRoom({ code: largerRoom.roomCode, name: 'Host' }), /already being used/);
});

test('only the host can start and a player only receives their own hand', () => {
  const rooms = new RoomService();
  const host = rooms.createRoom({ name: 'Host', maxPlayers: 3 });
  const guest = rooms.joinRoom({ code: host.roomCode, name: 'Friend' });
  assert.throws(() => rooms.startGame(host.roomCode, guest.token), /Only the room host/);
  const state = rooms.startGame(host.roomCode, host.token);
  assert.equal(state.stage, 'playing');
  assert.equal(state.players.length, 2);
  assert.equal(state.hand.length, 26);

  const guestState = rooms.stateFor(host.roomCode, guest.token);
  assert.equal(guestState.hand.length, 26);
  assert.equal(guestState.handCount, 26);
  assert.equal(guestState.players.some((player) => player.hand), false);
  assert.equal(guestState.players.find((player) => player.id === guestState.yourPlayerId).handCount, 26);
});

test('validates turn ownership, applies actions, and protects room membership', () => {
  const rooms = new RoomService();
  const host = rooms.createRoom({ name: 'Host', maxPlayers: 2 });
  const guest = rooms.joinRoom({ code: host.roomCode, name: 'Friend' });
  rooms.startGame(host.roomCode, host.token);
  const room = rooms.getRoom(host.roomCode);
  const starter = room.game.players[room.game.turnIndex];
  const starterIdentity = room.players.find((player) => player.id === starter.id);
  const otherIdentity = room.players.find((player) => player.id !== starter.id);

  assert.throws(
    () => rooms.action(host.roomCode, otherIdentity.token, 'pass', []),
    /It is not your turn/,
  );
  const result = rooms.action(host.roomCode, starterIdentity.token, 'play', ['3-♦']);
  assert.equal(result.currentPlay.playerName, starter.name);
  assert.equal(result.currentPlay.cards[0].id, '3-♦');
  assert.throws(() => rooms.stateFor(host.roomCode, 'invalid-token'), /not in the room/);

  const activePlayer = room.game.players[room.game.turnIndex];
  const activeIdentity = room.players.find((player) => player.id === activePlayer.id);
  const options = findPlays(activePlayer.hand, room.game.currentPlay);
  if (options.length) {
    rooms.action(host.roomCode, activeIdentity.token, 'play', options[0].cards.map((card) => card.id));
  } else {
    rooms.action(host.roomCode, activeIdentity.token, 'pass', []);
  }
  assert.equal(rooms.stateFor(host.roomCode, guest.token).stage, 'playing');
});

test('validates room sizes and player names', () => {
  const rooms = new RoomService();
  assert.throws(() => rooms.createRoom({ name: 'Host', maxPlayers: 1 }), /room size/);
  assert.throws(() => rooms.createRoom({ name: ' ', maxPlayers: 2 }), /Player names/);
  const host = rooms.createRoom({ name: 'Host', maxPlayers: 2 });
  rooms.joinRoom({ code: host.roomCode, name: 'Friend' });
  assert.throws(() => rooms.startGame(host.roomCode, 'not-the-host-token'), /not in the room/);
});
