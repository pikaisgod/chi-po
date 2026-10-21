const test = require('node:test');
const assert = require('node:assert/strict');
const { WebGame, buildDeck, classifyPlay, comparePlays } = require('../src/web-game');

const deck = buildDeck();
const card = (rank, suit) => deck.find((entry) => entry.rank === rank && entry.suit === suit);

test('deck uses the Chi Po rank and suit order', () => {
  assert.equal(deck.length, 52);
  assert.deepEqual(
    deck.filter((entry) => entry.suit === '♦').map((entry) => entry.rank),
    ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  );
  assert.equal(card('3', '♦').rankValue, 0);
  assert.equal(card('2', '♠').rankValue, 12);
  assert.equal(card('3', '♦').suitValue, 0);
  assert.equal(card('3', '♠').suitValue, 3);
});

test('classifies pairs, triples, straights, boats, and bombs', () => {
  assert.equal(classifyPlay([card('3', '♦'), card('3', '♠')]).type, 'pair');
  assert.equal(classifyPlay([card('4', '♦'), card('4', '♣'), card('4', '♠')]).type, 'three');
  assert.equal(classifyPlay(['3', '4', '5', '6', '7'].map((rank) => card(rank, '♦'))).type, 'straight');
  assert.equal(classifyPlay([
    card('5', '♦'), card('5', '♣'), card('5', '♠'), card('7', '♦'), card('7', '♣'),
  ]).type, 'boat');
  assert.equal(classifyPlay(['♦', '♣', '♥', '♠'].map((suit) => card('6', suit))).type, 'bomb');
  assert.equal(classifyPlay(['A', '2', '3', '4', '5'].map((rank) => card(rank, '♦'))), null);
});

test('records and displays a played straight from low rank to high rank', () => {
  const game = new WebGame();
  game.runAiTurns = () => {};
  game.startNewGame(2);
  const player = game.players[0];
  const straight = ['3', '4', '5', '6', '7'].map((rank) => card(rank, '♦'));
  player.hand = [...straight];
  game.turnIndex = 0;
  game.openingLead = false;
  game.directionLocked = true;
  game.currentPlay = null;

  game.playCards(player, straight.slice().reverse().map((entry) => entry.id));

  assert.deepEqual(game.currentPlay.cards.map((entry) => entry.rank), ['3', '4', '5', '6', '7']);
  assert.ok(game.log.some((entry) => entry.includes('3♦ 4♦ 5♦ 6♦ 7♦')));
});

test('increments turn sequence when the game advances to another player', () => {
  const game = new WebGame();
  game.runAiTurns = () => {};
  game.startNewGame(2);
  const previousSequence = game.turnSequence;
  const player = game.players[game.turnIndex];
  const openingCard = player.hand.find((entry) => entry.id === '3-♦');

  game.playCards(player, [openingCard.id]);

  assert.equal(game.turnSequence, previousSequence + 1);
});

test('compares same-rank pairs by their highest suit and handles cross-type plays', () => {
  const lowPair = classifyPlay([card('5', '♦'), card('5', '♥')]);
  const highPair = classifyPlay([card('5', '♣'), card('5', '♠')]);
  assert.equal(comparePlays(highPair, lowPair), 1);

  const straight = classifyPlay(['3', '4', '5', '6', '7'].map((rank) => card(rank, '♠')));
  const boat = classifyPlay([
    card('3', '♦'), card('3', '♣'), card('3', '♥'), card('4', '♦'), card('4', '♣'),
  ]);
  const bomb = classifyPlay(['♦', '♣', '♥', '♠'].map((suit) => card('8', suit)));
  assert.equal(comparePlays(boat, straight), 1);
  assert.equal(comparePlays(bomb, boat), 1);
  assert.equal(comparePlays(straight, boat), -1);
});

test('deals evenly and burns only an undealable remainder', () => {
  for (const [playerCount, expectedHandSize, expectedBurn] of [[2, 26, 0], [3, 17, 1], [4, 13, 0]]) {
    const game = new WebGame();
    game.runAiTurns = () => {};
    const state = game.startNewGame(playerCount);
    assert.equal(state.burnedCardCount, expectedBurn);
    assert.ok(state.players.every((player) => player.handCount === expectedHandSize));
    assert.ok(game.players.some((player) => player.hand.some((entry) => entry.id === '3-♦')));
  }
});

test('the opening player must include 3♦ and the first successful response sets direction', () => {
  const game = new WebGame();
  game.startNewGame(4);
  const threeOfDiamonds = card('3', '♦');
  game.players[0].hand = [threeOfDiamonds, card('4', '♦')];
  game.players[3].hand = [card('4', '♣')];
  game.turnIndex = 0;
  game.leadIndex = 0;
  game.openingLead = true;
  game.directionLocked = false;
  game.currentPlay = null;
  assert.throws(() => game.playCards(game.players[0], ['4-♦']), /must include the 3♦/);
  game.playCards(game.players[0], ['3-♦']);
  game.turnIndex = 3;
  game.playCards(game.players[3], ['4-♣']);
  assert.equal(game.direction, -1);
  assert.equal(game.directionLocked, true);
});

function createOpeningRaceGame() {
  const players = Array.from({ length: 4 }, (_, index) => ({
    id: `player-${index}`,
    name: `Player ${index}`,
    isHuman: true,
  }));
  const game = new WebGame(players);
  game.runAiTurns = () => {};
  game.startNewGame(4);

  const starterIndex = game.players.findIndex((player) => player.hand.some((entry) => entry.id === '3-♦'));
  const clockwiseIndex = (starterIndex + 1) % 4;
  const oppositeIndex = (starterIndex + 2) % 4;
  const counterClockwiseIndex = (starterIndex + 3) % 4;
  game.players[starterIndex].hand = [card('3', '♦'), card('7', '♦')];
  game.players[clockwiseIndex].hand = [card('4', '♦'), card('2', '♦'), card('2', '♣')];
  game.players[oppositeIndex].hand = [card('6', '♦')];
  game.players[counterClockwiseIndex].hand = [card('5', '♦')];
  game.playCards(game.players[starterIndex], ['3-♦']);

  return { game, starterIndex, clockwiseIndex, oppositeIndex, counterClockwiseIndex };
}

test('both sides can race, and the first legal response sets direction', () => {
  const clockwiseRace = createOpeningRaceGame();
  const { game, clockwiseIndex: clockwiseWinner, counterClockwiseIndex } = clockwiseRace;
  assert.equal(game.view(game.players[clockwiseWinner].id).canAct, true);
  assert.equal(game.view(game.players[counterClockwiseIndex].id).canAct, true);

  assert.throws(
    () => game.action('play', ['2-♦', '2-♣'], game.players[clockwiseWinner].id),
    /does not beat the current play/,
  );
  assert.equal(game.directionLocked, false);
  game.action('play', ['4-♦'], game.players[clockwiseWinner].id);
  assert.equal(game.direction, 1);
  assert.equal(game.directionLocked, true);
  assert.equal(game.initialResponseOpen, false);

  const counterClockwiseRace = createOpeningRaceGame();
  const { game: otherGame, counterClockwiseIndex: counterClockwiseWinner } = counterClockwiseRace;
  otherGame.action('play', ['5-♦'], otherGame.players[counterClockwiseWinner].id);
  assert.equal(otherGame.direction, -1);
  assert.equal(otherGame.directionLocked, true);
});

test('opening race passes are final, and all passes return the lead to the starter', () => {
  const { game, starterIndex, clockwiseIndex, oppositeIndex, counterClockwiseIndex } = createOpeningRaceGame();

  game.action('pass', [], game.players[clockwiseIndex].id);
  assert.equal(game.view(game.players[clockwiseIndex].id).canAct, false);
  assert.throws(() => game.action('pass', [], game.players[clockwiseIndex].id), /not your turn/);
  game.action('pass', [], game.players[oppositeIndex].id);
  game.action('pass', [], game.players[counterClockwiseIndex].id);

  assert.equal(game.currentPlay, null);
  assert.equal(game.turnIndex, starterIndex);
  assert.equal(game.direction, 1);
  assert.equal(game.initialResponseOpen, false);
});

test('a racing response after the winner is rejected and normal turns follow its direction', () => {
  const { game, starterIndex, clockwiseIndex, oppositeIndex, counterClockwiseIndex } = createOpeningRaceGame();
  game.action('play', ['5-♦'], game.players[counterClockwiseIndex].id);

  assert.equal(game.turnIndex, oppositeIndex);
  assert.throws(() => game.action('play', ['4-♦'], game.players[clockwiseIndex].id), /not your turn/);
  game.action('play', ['6-♦'], game.players[oppositeIndex].id);
  assert.equal(game.turnIndex, clockwiseIndex);
  assert.equal(game.turnIndex, (starterIndex + 1) % 4);
});

test('the last player leads the next trick, unless they have already gone out', () => {
  const game = new WebGame();
  game.startNewGame(3);

  game.lastPlayerIndex = 1;
  game.startNextTrick();
  assert.equal(game.turnIndex, 1);
  assert.equal(game.leadIndex, 1);

  game.players[0].isOut = true;
  game.lastPlayerIndex = 0;
  assert.equal(game.passesNeeded(), 2);
  game.startNextTrick();
  assert.equal(game.players[game.turnIndex].isOut, false);
  assert.equal(game.players[game.leadIndex].isOut, false);
});

test('ends at the correct finishing place for two, three, and four players', () => {
  for (const playerCount of [2, 3, 4]) {
    const game = new WebGame();
    game.runAiTurns = () => {};
    game.startNewGame(playerCount);
    game.players.forEach((player, index) => {
      player.hand = [card(String(index + 3), '♦')];
      player.isOut = false;
      player.finishPlace = null;
    });
    game.turnIndex = 0;
    game.leadIndex = 0;
    game.currentPlay = null;
    game.lastPlayerIndex = null;
    game.openingLead = false;
    game.directionLocked = true;
    game.finishOrder = [];
    game.stage = 'playing';

    for (let index = 0; index < playerCount - 1; index++) {
      const player = game.players[index];
      game.turnIndex = index;
      game.currentPlay = null;
      game.playCards(player, [player.hand[0].id]);
      assert.equal(game.stage === 'finished', index === playerCount - 2);
    }
    assert.equal(game.finishOrder.length, playerCount - 1);
    assert.equal(game.players[playerCount - 1].isOut, false);
  }
});
