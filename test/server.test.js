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

  const unauthorized = await fetch(`${baseUrl}/api/rooms/${host.roomCode}`);
  assert.equal(unauthorized.status, 400);
  const started = await fetch(`${baseUrl}/api/rooms/${host.roomCode}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${host.token}` },
    body: '{}',
  });
  assert.equal(started.status, 200);
  assert.equal((await started.json()).stage, 'playing');

  const guestStateResponse = await fetch(`${baseUrl}/api/rooms/${host.roomCode}`, {
    headers: { Authorization: `Bearer ${guest.token}` },
  });
  const guestState = await guestStateResponse.json();
  assert.equal(guestState.hand.length, 26);
  assert.equal(guestState.players.some((player) => Object.hasOwn(player, 'hand')), false);
});
