const SUITS = [
  { symbol: '♦', name: 'Diamonds', value: 0 },
  { symbol: '♣', name: 'Clubs', value: 1 },
  { symbol: '♥', name: 'Hearts', value: 2 },
  { symbol: '♠', name: 'Spades', value: 3 },
];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const RANK_VALUES = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));
const HAND_NAMES = {
  single: 'High card',
  pair: 'Pair',
  three: 'Three of a kind',
  straight: 'Straight',
  boat: 'Boat',
  bomb: 'Four of a kind · Bomb',
};

function buildDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank}-${suit.symbol}`,
      rank,
      rankValue: RANK_VALUES[rank],
      suit: suit.symbol,
      suitValue: suit.value,
    })),
  );
}

function shuffle(cards) {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function compareCards(left, right) {
  return left.rankValue - right.rankValue || left.suitValue - right.suitValue;
}

function classifyPlay(cards) {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 5) return null;
  const sorted = [...cards].sort(compareCards);
  const counts = new Map();
  for (const card of sorted) counts.set(card.rankValue, (counts.get(card.rankValue) || 0) + 1);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);

  if (sorted.length === 1) {
    return { type: 'single', rank: sorted[0].rankValue, suit: sorted[0].suitValue };
  }
  if (sorted.length === 2 && groups[0][1] === 2) {
    return {
      type: 'pair',
      rank: groups[0][0],
      suit: Math.max(...sorted.map((card) => card.suitValue)),
    };
  }
  if (sorted.length === 3 && groups[0][1] === 3) {
    return {
      type: 'three',
      rank: groups[0][0],
      suit: Math.max(...sorted.map((card) => card.suitValue)),
    };
  }
  if (sorted.length === 4 && groups[0][1] === 4) {
    return {
      type: 'bomb',
      rank: groups[0][0],
      suit: Math.max(...sorted.map((card) => card.suitValue)),
    };
  }
  if (sorted.length === 5 && groups[0][1] === 3 && groups[1][1] === 2) {
    return { type: 'boat', rank: groups[0][0], suit: 0 };
  }
  if (sorted.length === 5 && groups.length === 5) {
    const values = sorted.map((card) => card.rankValue);
    if (values.every((value, index) => index === 0 || value === values[index - 1] + 1)) {
      const highCard = sorted[sorted.length - 1];
      return { type: 'straight', rank: highCard.rankValue, suit: highCard.suitValue };
    }
  }
  return null;
}

function comparePlays(challenger, current) {
  if (!challenger || !current) return 0;
  if (challenger.type === 'bomb' && current.type !== 'bomb') return 1;
  if (current.type === 'bomb' && challenger.type !== 'bomb') return -1;
  if (challenger.type === 'boat' && current.type === 'straight') return 1;
  if (current.type === 'boat' && challenger.type === 'straight') return -1;
  if (challenger.type !== current.type) return -1;
  return challenger.rank - current.rank || challenger.suit - current.suit;
}

function combinations(cards, size, start = 0, prefix = [], result = []) {
  if (prefix.length === size) {
    result.push(prefix);
    return result;
  }
  for (let index = start; index <= cards.length - (size - prefix.length); index++) {
    combinations(cards, size, index + 1, [...prefix, cards[index]], result);
  }
  return result;
}

function findPlays(hand, currentPlay = null, mustContain = null) {
  const candidates = [];
  for (let size = 1; size <= 5; size++) {
    for (const cards of combinations(hand, size)) {
      if (mustContain && !cards.some((card) => card.id === mustContain)) continue;
      const play = classifyPlay(cards);
      if (!play) continue;
      if (currentPlay && comparePlays(play, currentPlay) <= 0) continue;
      candidates.push({ cards, play });
    }
  }
  return candidates.sort((left, right) =>
    left.cards.length - right.cards.length ||
    left.play.rank - right.play.rank ||
    left.play.suit - right.play.suit,
  );
}

function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

class WebGame {
  constructor(playerConfig = null) {
    this.playerConfig = playerConfig;
    this.startNewGame(playerConfig ? playerConfig.length : 4);
  }

  startNewGame(playerCount = 4) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
      throw new Error('Choose a table with 2, 3, or 4 players.');
    }

    const playerNames = ['You', 'AI 1', 'AI 2', 'AI 3'];
    const configuredPlayers = this.playerConfig || playerNames.slice(0, playerCount).map((name, index) => ({
      id: index === 0 ? 'you' : `ai-${index}`,
      name,
      isHuman: index === 0,
    }));
    this.players = configuredPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      isHuman: player.isHuman,
      hand: [],
      finishPlace: null,
      isOut: false,
    }));
    this.gameNumber = (this.gameNumber || 0) + 1;
    this.turnSequence = 0;
    this.log = [];
    this.direction = 1;
    this.directionLocked = false;
    this.currentPlay = null;
    this.lastPlayerIndex = null;
    this.passCount = 0;
    this.openingLead = true;
    this.initialResponseOrder = [];
    this.finishOrder = [];

    const deck = shuffle(buildDeck());
    const dealCount = Math.floor(deck.length / playerCount) * playerCount;
    this.burnedCardCount = deck.length - dealCount;
    const starterCardIndex = deck.findIndex((card) => card.id === '3-♦');
    if (starterCardIndex >= dealCount) [deck[0], deck[starterCardIndex]] = [deck[starterCardIndex], deck[0]];
    for (let index = 0; index < dealCount; index++) {
      this.players[index % playerCount].hand.push(deck[index]);
    }
    for (const player of this.players) player.hand.sort(compareCards);

    const starter = this.players.findIndex((player) => player.hand.some((card) => card.id === '3-♦'));
    if (starter < 0) throw new Error('The 3♦ was not dealt to a player.');
    this.turnIndex = starter;
    this.leadIndex = starter;
    for (let distance = 1; distance < playerCount; distance++) {
      const clockwise = (starter + distance) % playerCount;
      const counterClockwise = (starter - distance + playerCount) % playerCount;
      if (!this.initialResponseOrder.includes(clockwise)) this.initialResponseOrder.push(clockwise);
      if (!this.initialResponseOrder.includes(counterClockwise)) this.initialResponseOrder.push(counterClockwise);
    }
    this.stage = 'playing';
    this.message = `${this.players[starter].name} has the 3♦ and leads. Their first play must include it.`;
    this.log.push(`Game ${this.gameNumber}: dealt ${dealCount} cards; ${this.burnedCardCount} card burned.`);
    this.runAiTurns();
    return this.view();
  }

  activePlayerCount() {
    return this.players.filter((player) => !player.isOut).length;
  }

  passesNeeded() {
    const lastPlayerIsActive = this.lastPlayerIndex !== null && !this.players[this.lastPlayerIndex].isOut;
    return this.activePlayerCount() - (lastPlayerIsActive ? 1 : 0);
  }

  nextActiveIndex(fromIndex, direction = this.direction) {
    for (let step = 1; step <= this.players.length; step++) {
      const index = (fromIndex + direction * step + this.players.length * 2) % this.players.length;
      if (!this.players[index].isOut) return index;
    }
    return fromIndex;
  }

  advanceTurn() {
    if (!this.directionLocked && this.currentPlay) {
      const position = this.initialResponseOrder.indexOf(this.turnIndex);
      for (let step = 1; step <= this.initialResponseOrder.length; step++) {
        const index = this.initialResponseOrder[(position + step) % this.initialResponseOrder.length];
        if (!this.players[index].isOut) {
          this.turnIndex = index;
          this.turnSequence++;
          return;
        }
      }
    }
    this.turnIndex = this.nextActiveIndex(this.turnIndex);
    this.turnSequence++;
  }

  action(action, cardIds = [], playerId = 'you') {
    const player = this.players[this.turnIndex];
    if (this.stage !== 'playing' || !player || !player.isHuman || player.id !== playerId) {
      throw new Error('It is not your turn.');
    }

    if (action === 'pass') {
      if (!this.currentPlay || player === this.players[this.lastPlayerIndex]) {
        throw new Error('You cannot pass when leading a new play.');
      }
      this.log.push(`${player.name} passes.`);
      this.passCount++;
      if (this.passCount >= this.passesNeeded()) {
        this.startNextTrick();
      } else {
        this.advanceTurn();
      }
    } else if (action === 'play') {
      this.playCards(player, cardIds);
    } else {
      throw new Error('Choose to play selected cards or pass.');
    }

    this.runAiTurns();
    return this.view(playerId);
  }

  playCards(player, cardIds) {
    if (!Array.isArray(cardIds) || cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) {
      throw new Error('Select the cards you want to play.');
    }
    const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
    if (cards.some((card) => !card)) throw new Error('One or more selected cards are not in your hand.');
    const play = classifyPlay(cards);
    if (!play) {
      throw new Error('Those cards do not make a legal hand.');
    }
    if (this.openingLead && !cards.some((card) => card.id === '3-♦')) {
      throw new Error('The opening play must include the 3♦.');
    }
    if (this.currentPlay && comparePlays(play, this.currentPlay) <= 0) {
      throw new Error('That hand does not beat the current play.');
    }

    const previousPlay = this.currentPlay;
    const playedCards = play.type === 'straight' ? [...cards].sort(compareCards) : cards;
    player.hand = player.hand.filter((card) => !cardIds.includes(card.id));
    this.currentPlay = { ...play, cards: playedCards, playerId: player.id, playerName: player.name };
    this.lastPlayerIndex = this.turnIndex;
    this.passCount = 0;
    const handName = HAND_NAMES[play.type];
    this.log.push(`${player.name} plays ${handName}: ${playedCards.map(cardLabel).join(' ')}.`);

    if (this.openingLead) this.openingLead = false;
    else if (!this.directionLocked && previousPlay) {
      this.directionLocked = true;
      const clockwiseDistance = (this.turnIndex - this.leadIndex + this.players.length) % this.players.length;
      this.direction = clockwiseDistance <= Math.floor(this.players.length / 2) ? 1 : -1;
      this.log.push(`Direction set ${this.direction === 1 ? 'clockwise' : 'counter-clockwise'} by the first player to beat the opening hand.`);
    }

    if (player.hand.length === 0) {
      player.isOut = true;
      player.finishPlace = this.finishOrder.length + 1;
      this.finishOrder.push(player.name);
      this.log.push(`${player.name} finishes in place ${player.finishPlace}.`);
      const finishTarget = this.players.length === 2 ? 1 : this.players.length - 1;
      if (this.finishOrder.length >= finishTarget) {
        this.stage = 'finished';
        const lastPlayer = this.players.find((entry) => !entry.isOut);
        this.message = lastPlayer
          ? `${this.finishOrder.join(' → ')} finish. ${lastPlayer.name} is the last player with cards.`
          : `${this.finishOrder.join(' → ')} finish.`;
        return;
      }
    }

    this.advanceTurn();
    this.message = `${player.name} played ${handName}.`;
  }

  startNextTrick() {
    if (!this.directionLocked) {
      this.directionLocked = true;
      this.direction = 1;
      this.log.push('No one beat the opening hand; play defaults to clockwise.');
    }
    this.currentPlay = null;
    this.passCount = 0;
    this.openingLead = false;
    this.turnIndex = this.players[this.lastPlayerIndex] && !this.players[this.lastPlayerIndex].isOut
      ? this.lastPlayerIndex
      : this.nextActiveIndex(this.lastPlayerIndex);
    this.turnSequence++;
    this.leadIndex = this.turnIndex;
    const player = this.players[this.turnIndex];
    this.message = `Everyone passed. ${player.name} leads a new hand.`;
    this.log.push(this.message);
  }

  chooseAiMove(player) {
    const requiredCard = this.openingLead ? '3-♦' : null;
    let options = findPlays(player.hand, this.currentPlay, requiredCard);
    if (this.openingLead) return options[0] || null;
    if (!this.currentPlay) return options[0] || null;
    if (options.length === 0 || Math.random() < 0.34) return null;
    return options[0];
  }

  runAiTurns() {
    let safety = 0;
    while (this.stage === 'playing' && !this.players[this.turnIndex].isHuman && safety < 500) {
      safety++;
      const player = this.players[this.turnIndex];
      const choice = this.chooseAiMove(player);
      if (choice) {
        this.playCards(player, choice.cards.map((card) => card.id));
      } else if (this.currentPlay && player !== this.players[this.lastPlayerIndex]) {
        this.log.push(`${player.name} passes.`);
        this.passCount++;
        if (this.passCount >= this.passesNeeded()) this.startNextTrick();
        else this.advanceTurn();
      } else {
        const legalLead = findPlays(player.hand, null)[0];
        if (!legalLead) throw new Error(`${player.name} has no legal hand to lead.`);
        this.playCards(player, legalLead.cards.map((card) => card.id));
      }
    }
    if (safety >= 500) throw new Error('The game could not advance after too many AI turns.');
  }

  view(viewerId = 'you') {
    return {
      gameNumber: this.gameNumber,
      stage: this.stage,
      playerCount: this.players.length,
      direction: this.direction === 1 ? 'Clockwise' : 'Counter-clockwise',
      directionLocked: this.directionLocked,
      turnPlayerId: this.players[this.turnIndex]?.id,
      turnSequence: this.turnSequence,
      canAct: this.stage === 'playing' && this.players[this.turnIndex]?.id === viewerId,
      openingLead: this.openingLead,
      currentPlay: this.currentPlay
        ? {
          type: this.currentPlay.type,
          name: HAND_NAMES[this.currentPlay.type],
          cards: this.currentPlay.cards,
          playerName: this.currentPlay.playerName,
        }
        : null,
      leadPlayerName: this.players[this.leadIndex]?.name,
      hand: this.players.find((player) => player.id === viewerId)?.hand || [],
      handCount: this.players.find((player) => player.id === viewerId)?.hand.length || 0,
      message: this.message,
      log: this.log.slice(-12),
      finishOrder: this.finishOrder,
      burnedCardCount: this.burnedCardCount,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        handCount: player.hand.length,
        isOut: player.isOut,
        finishPlace: player.finishPlace,
        isHuman: player.isHuman,
        isTurn: player.id === this.players[this.turnIndex]?.id && this.stage === 'playing',
      })),
    };
  }
}

module.exports = {
  WebGame,
  buildDeck,
  classifyPlay,
  comparePlays,
  findPlays,
};
