const http = require('http');
const fs = require('fs');
const path = require('path');
const { RoomService } = require('./room-service');

const publicDirectory = path.join(__dirname, '..', 'public');
const rooms = new RoomService();
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wav': 'audio/wav',
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function serveFile(response, filename) {
  const filePath = path.join(publicDirectory, filename);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] });
    response.end(content);
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
      } else if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readJson(request);
        sendJson(response, 200, rooms.createRoom(body));
      } else if (request.method === 'POST' && url.pathname === '/api/rooms/join') {
        const body = await readJson(request);
        sendJson(response, 200, rooms.joinRoom(body));
      } else if (request.method === 'GET' && /^\/api\/rooms\/[A-Z0-9]+$/.test(url.pathname)) {
        const code = url.pathname.split('/').pop();
        sendJson(response, 200, rooms.stateFor(code, getToken(request)));
      } else if (request.method === 'POST' && /^\/api\/rooms\/[A-Z0-9]+\/(start|action|new-game|chat|deck)$/.test(url.pathname)) {
        const [, code, operation] = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/(start|action|new-game|chat|deck)$/);
        const token = getToken(request);
        if (operation === 'start') {
          sendJson(response, 200, rooms.startGame(code, token));
        } else if (operation === 'new-game') {
          sendJson(response, 200, rooms.newGame(code, token));
        } else {
          const body = await readJson(request);
          if (operation === 'chat') {
            sendJson(response, 200, rooms.sendChat(code, token, body.message));
          } else if (operation === 'deck') {
            sendJson(response, 200, rooms.setDeckDesign(code, token, body.deckId));
          } else {
            sendJson(response, 200, rooms.action(code, token, body.action, body.cardIds));
          }
        }
      } else if (request.method === 'GET' && url.pathname === '/') {
        serveFile(response, 'index.html');
      } else if (request.method === 'GET' && ['/app.js', '/style.css', '/audio/turn-notification.wav'].includes(url.pathname)) {
        serveFile(response, url.pathname.slice(1));
      } else {
        sendJson(response, 404, { error: 'Not found.' });
      }
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });
}

function getToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/);
  if (!match) throw new Error('Join a room before continuing.');
  return match[1];
}

function start() {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, () => {
    console.log(`Chi Po is ready on port ${port}`);
  });
}

if (require.main === module) start();

module.exports = { createServer, start };
