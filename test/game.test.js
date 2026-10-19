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
