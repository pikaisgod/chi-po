const { randomBytes, randomUUID } = require('crypto');
const { WebGame } = require('./web-game');

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_LIMIT = 8 * 60 * 60 * 1000;
const MAX_ROOMS = 1000;

function randomRoomCode() {
  return Array.from(randomBytes(6), (byte) => ROOM_CODE_CHARACTERS[byte % ROOM_CODE_CHARACTERS.length]).join('');
}

function randomToken() {
  return randomBytes(32).toString('hex');
}

class RoomService {
  constructor() {
    this.rooms = new Map();
  }

  pruneRooms() {
    const expiry = Date.now() - ROOM_IDLE_LIMIT;
    for (const [code, room] of this.rooms) {
      if (room.lastActivity < expiry) this.rooms.delete(code);
    }
    if (this.rooms.size >= MAX_ROOMS) throw new Error('The server is full right now. Try again later.');
  }

  getRoom(code) {
    const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    const room = this.rooms.get(normalizedCode);
    if (!room) throw new Error('Room not found. Check the code and try again.');
    room.lastActivity = Date.now();
    return room;
  }

  findPlayer(room, token) {
    const player = room.players.find((entry) => entry.token === token);
    if (!player) throw new Error('This device is not in the room. Join with the room code again.');
    return player;
  }

  createRoom({ name, maxPlayers }) {
    const playerName = this.validateName(name);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
      throw new Error('Choose a room size from 2 to 4 players.');
    }
    this.pruneRooms();
    let code = randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();
    const host = { id: randomUUID(), token: randomToken(), name: playerName, isHost: true };
    const room = {
      code,
      maxPlayers,
      players: [host],
      game: null,
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    return { roomCode: code, token: host.token, state: this.state(room, host) };
  }

  joinRoom({ code, name }) {
    const room = this.getRoom(code);
    const playerName = this.validateName(name);
    if (room.game) throw new Error('That game has already started.');
    if (room.players.length >= room.maxPlayers) throw new Error('That room is full.');
    if (room.players.some((player) => player.name.toLowerCase() === playerName.toLowerCase())) {
      throw new Error('That name is already being used in this room.');
    }
    const player = { id: randomUUID(), token: randomToken(), name: playerName, isHost: false };
    room.players.push(player);
    return { roomCode: room.code, token: player.token, state: this.state(room, player) };
  }

  startGame(code, token) {
    const room = this.getRoom(code);
    const player = this.findPlayer(room, token);
    if (!player.isHost) throw new Error('Only the room host can start the game.');
    if (room.players.length < 2) throw new Error('Invite at least one friend before starting.');
    room.game = new WebGame(room.players.map((entry) => ({
      id: entry.id,
      name: entry.name,
      isHuman: true,
    })));
    return this.state(room, player);
  }

  action(code, token, action, cardIds) {
    const room = this.getRoom(code);
    const player = this.findPlayer(room, token);
    if (!room.game) throw new Error('The host has not started the game yet.');
    room.game.action(action, cardIds, player.id);
    return this.state(room, player);
  }

  newGame(code, token) {
    const room = this.getRoom(code);
    const player = this.findPlayer(room, token);
    if (!player.isHost) throw new Error('Only the room host can start a new game.');
    if (!room.game) throw new Error('The game has not started yet.');
    room.game.startNewGame(room.players.length);
    return this.state(room, player);
  }

  stateFor(code, token) {
    const room = this.getRoom(code);
    const player = this.findPlayer(room, token);
    return this.state(room, player);
  }

  state(room, viewer) {
    const result = room.game
      ? room.game.view(viewer.id)
      : {
        stage: 'lobby',
        message: room.players.length < 2
          ? 'Share the room code with your friends. The host can start once someone joins.'
          : 'Waiting for the host to start the game.',
        players: room.players.map((player) => ({
          id: player.id,
          name: player.name,
          isHost: player.isHost,
          isYou: player.id === viewer.id,
        })),
      };
    return {
      ...result,
      roomCode: room.code,
      maxPlayers: room.maxPlayers,
      isHost: viewer.isHost,
      yourPlayerId: viewer.id,
      lobbyPlayers: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        isYou: player.id === viewer.id,
      })),
    };
  }

  validateName(name) {
    if (typeof name !== 'string') throw new Error('Enter a player name.');
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 20) {
      throw new Error('Player names must be between 1 and 20 characters.');
    }
    return trimmed;
  }
}

module.exports = { RoomService };
