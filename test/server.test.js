const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');

test('serves the game and supports authenticated phone room flow', async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Create a room/);
  assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { status: 'ok' });
  const turnSound = await fetch(`${baseUrl}/audio/turn-notification.wav`);
  assert.equal(turnSound.status, 200);
  assert.equal(turnSound.headers.get('content-type'), 'audio/wav');
  assert.ok((await turnSound.arrayBuffer()).byteLength > 44);
  for (const sound of [
    'awhhhhhhh',
    'bing',
    'bullshit',
    'chinese-time',
    'femboys',
    'here-we-go-again',
    'its-my-turn',
  ]) {
    const audio = await fetch(`${baseUrl}/audio/${sound}.m4a`);
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('content-type'), 'audio/mp4');
    assert.ok((await audio.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await fetch(`${baseUrl}/audio/not-a-notification.m4a`)).status, 404);

  const hostResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Host', maxPlayers: 2 }),
  });
  assert.equal(hostResponse.status, 200);
  const host = await hostResponse.json();
  const guestResponse = await fetch(`${baseUrl}/api/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Friend', code: host.roomCode }),
  });
  assert.equal(guestResponse.status, 200);
  const guest = await guestResponse.json();

  const deckResponse = await fetch(`${baseUrl}/api/rooms/${host.roomCode}/deck`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${guest.token}`,
    },
    body: JSON.stringify({ deckId: 'violet' }),
  });
  assert.equal(deckResponse.status, 200);
  assert.equal((await deckResponse.json()).lobbyPlayers.find((player) => player.isYou).deckId, 'violet');

  const chatResponse = await fetch(`${baseUrl}/api/rooms/${host.roomCode}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${guest.token}`,
    },
    body: JSON.stringify({ message: 'Hi from my phone!' }),
  });
  assert.equal(chatResponse.status, 200);
  assert.equal((await chatResponse.json()).chat[0].text, 'Hi from my phone!');

  const unauthorized = await fetch(`${baseUrl}/api/rooms/${host.roomCode}`);
  assert.equal(unauthorized.status, 400);
  const started = await fetch(`${baseUrl}/api/rooms/${host.roomCode}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${host.token}` },
    body: '{}',
  });
  assert.equal(started.status, 200);
  assert.equal((await started.json()).stage, 'playing');
  const hostStateResponse = await fetch(`${baseUrl}/api/rooms/${host.roomCode}`, {
    headers: { Authorization: `Bearer ${host.token}` },
  });
  const hostState = await hostStateResponse.json();
  assert.equal(hostState.players.find((player) => player.name === 'Friend').deckId, 'violet');
  assert.equal(typeof hostState.turnSequence, 'number');

  const guestStateResponse = await fetch(`${baseUrl}/api/rooms/${host.roomCode}`, {
    headers: { Authorization: `Bearer ${guest.token}` },
  });
  const guestState = await guestStateResponse.json();
  assert.equal(guestState.hand.length, 26);
  assert.equal(guestState.players.some((player) => Object.hasOwn(player, 'hand')), false);
});
