# Chi Po

A browser-based multiplayer Chi Po game for 2–4 friends. Each player joins the
same private room from their own phone or computer. The project uses Node.js
built-ins and has no external dependencies.

## Run locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). Set the `PORT` environment
variable to use a different port. Local play requires every device to be able
to reach the computer running the server.

## Publish for friends on different networks

The included `render.yaml` configures a small public Render web service:

1. Create a GitHub repository and upload this project.
2. In Render, choose **New** → **Blueprint** and connect that repository.
3. Deploy the `chi-po` service defined by `render.yaml`.
4. Open the Render URL, create a room, and send the invite link or room code to
   your friends. They can join from their phones using mobile data or Wi-Fi.

Render's free service may sleep when idle; the first visit after inactivity can
take a little while to wake up. Room and game state is held in server memory,
so an application restart clears active rooms.

## How to play online

- One person creates a room and chooses a capacity from 2 to 4. Friends join
  with the link or six-character room code and choose a name.
- Each player can choose a built-in card-back design in the lobby. Their
  selected design appears on their hidden cards for everyone in the room.
- The host starts when at least two players have joined. The 3♦ holder leads.
- Each player sees only their own hand. The browser refreshes the shared game
  state while players take turns. Room chat is available in both the lobby and
  the game; messages are limited to 300 characters.
- A room's host can start a new game after the current game ends.

## Rules implemented

- The deck is dealt evenly; any leftover card is burned. The opening play must
  include 3♦.
- Card ranks go 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2. Suits ascend ♦, ♣, ♥, ♠.
- Legal hands are a single, a pair of two equal ranks, three of a kind, a
  five-card straight, a boat (three of a kind plus a pair), or four of a kind
  (a bomb). Straights use five consecutive ranks and do not wrap.
- Beat the current hand with the same type. A boat beats a straight, and a bomb
  beats any hand; only a higher bomb beats a bomb. When everyone else passes,
  the last player to play leads the next hand.
- The first player to beat the opening play sets direction for that game. If
  nobody beats it, direction defaults to clockwise.
- With two players, the first player out wins. With three or four, play
  continues until all but one player has gone out; the remaining player loses.

## Project structure

- `index.js` - starts the game server
- `src/web-game.js` - card rules and game state
- `src/room-service.js` - private rooms and player identities
- `src/server.js` - web server and room API
- `public/` - browser interface
- `render.yaml` - Render deployment configuration

Run the built-in tests with `npm test`.

## Turn sound

The browser plays `public/audio/turn-notification.wav` when it becomes your
turn. Replace that WAV file with another WAV audio file to change the alert;
keep the same filename and location. Players can toggle turn sound on or off
in the game, and the preference is saved on their device. If a browser blocks
audio before the player interacts with the page, tap the sound toggle once to
enable it.
