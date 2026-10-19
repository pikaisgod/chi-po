const readline = require('readline/promises');

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValues = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function buildDeck() {
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, value: rankValues[rank] });
    }
  }

  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function drawCard(deck) {
  return deck.shift();
}

function formatCard(card) {
  return `${card.rank}${card.suit}`;
}

function formatHand(hand) {
  return hand.map((card) => formatCard(card)).join(' | ');
}

function compareScores(a, b) {
  const maxLength = Math.max(a.length, b.length);

  for (let i = 0; i < maxLength; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;

    if (left !== right) {
      return left > right ? 1 : -1;
    }
  }

  return 0;
}

function evaluateFiveCardHand(cards) {
  const sortedValues = [...cards].map((card) => card.value).sort((a, b) => b - a);
  const counts = {};

  for (const card of cards) {
    counts[card.value] = (counts[card.value] || 0) + 1;
  }

  const groups = Object.entries(counts)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const flush = cards.every((card) => card.suit === cards[0].suit);
  const uniqueSorted = [...new Set(sortedValues)].sort((a, b) => a - b);
  let straightHigh = null;

  if (uniqueSorted.length >= 5) {
    const wheel = [2, 3, 4, 5, 14];
    const isWheelStraight = wheel.every((value) => uniqueSorted.includes(value));

    if (isWheelStraight) {
      straightHigh = 5;
    }

    for (let i = 0; i <= uniqueSorted.length - 5; i++) {
      const chunk = uniqueSorted.slice(i, i + 5);
      const isSequential = chunk[4] - chunk[0] === 4 && new Set(chunk).size === 5;
      if (isSequential) {
        straightHigh = chunk[4];
        break;
      }
    }
  }

  const highCards = [...sortedValues];

  if (
    flush &&
    straightHigh === 14 &&
    cards.some((card) => card.value === 10) &&
    cards.some((card) => card.value === 11) &&
    cards.some((card) => card.value === 12) &&
    cards.some((card) => card.value === 13) &&
    cards.some((card) => card.value === 14)
  ) {
    return { name: 'Royal Flush', score: [9, 14] };
  }

  if (flush && straightHigh !== null) {
    return { name: 'Straight Flush', score: [8, straightHigh] };
  }

  if (groups[0].count === 4) {
    return { name: 'Four of a Kind', score: [7, groups[0].value, groups[1].value ?? 0] };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return { name: 'Full House', score: [6, groups[0].value, groups[1].value] };
  }

  if (flush) {
    return { name: 'Flush', score: [5, ...highCards] };
  }

  if (straightHigh !== null) {
    return { name: 'Straight', score: [4, straightHigh] };
  }

  if (groups[0].count === 3) {
    const rest = groups.slice(1).map((entry) => entry.value).sort((a, b) => b - a);
    return { name: 'Three of a Kind', score: [3, groups[0].value, ...rest] };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairValues = groups.slice(0, 2).map((entry) => entry.value).sort((a, b) => b - a);
    const kicker = groups[2]?.value ?? 0;
    return { name: 'Two Pair', score: [2, ...pairValues, kicker] };
  }

  if (groups[0].count === 2) {
    const kickers = groups.slice(1).map((entry) => entry.value).sort((a, b) => b - a);
    return { name: 'One Pair', score: [1, groups[0].value, ...kickers] };
  }

  return { name: 'High Card', score: [0, ...highCards] };
}

function bestFiveCardHand(cards) {
  let best = null;

  for (let i = 0; i < cards.length - 4; i++) {
    for (let j = i + 1; j < cards.length - 3; j++) {
      for (let k = j + 1; k < cards.length - 2; k++) {
        for (let l = k + 1; l < cards.length - 1; l++) {
          for (let m = l + 1; m < cards.length; m++) {
            const combo = [cards[i], cards[j], cards[k], cards[l], cards[m]];
            const result = evaluateFiveCardHand(combo);

            if (!best || compareScores(result.score, best.score) > 0) {
              best = { ...result, cards: combo };
            }
          }
        }
      }
    }
  }

  return best;
}

async function askQuestion(rl, prompt) {
  const answer = await rl.question(prompt);
  return answer.trim();
}

const STARTING_CHIPS = 1000;
const ANTE = 10;

function getPot(players) {
  return players.reduce((total, player) => total + player.handBet, 0);
}

function commitChips(player, amount) {
  const committed = Math.min(player.chips, amount);
  player.chips -= committed;
  player.streetBet += committed;
  player.handBet += committed;
  return committed;
}

function getHandStrength(player, community) {
  const cards = [...player.hand, ...community];
  if (cards.length >= 5) return bestFiveCardHand(cards).score[0];

  const [first, second] = player.hand;
  return (first.value === second.value ? 2 : 0) +
    (Math.max(first.value, second.value) >= 12 ? 1 : 0) +
    (Math.abs(first.value - second.value) <= 2 ? 0.5 : 0);
}

function getAiAction(player, community, currentBet) {
  const owed = currentBet - player.streetBet;
  const strength = getHandStrength(player, community);

  if (owed > 0) {
    if (strength < 1 && Math.random() < 0.7) return { action: 'fold' };
    if (strength >= 2 && player.chips > owed + 20 && Math.random() < 0.2) {
      return { action: 'raise', amount: Math.min(20, player.chips - owed) };
    }
    return { action: 'call' };
  }

  if (player.chips > 0 && (strength >= 2 || Math.random() < 0.18)) {
    return { action: 'bet', amount: Math.min(10 + Math.floor(Math.random() * 21), player.chips) };
  }
  return { action: 'check' };
}

async function getPlayerAction(rl, player, currentBet, pot) {
  while (true) {
    const balance = `Chips: $${player.chips} | Pot: $${pot}`;
    const owed = currentBet - player.streetBet;

    if (owed > 0) {
      const answer = (await askQuestion(
        rl,
        `${balance} | To call: $${owed}. Choose call, raise, or fold: `,
      )).toLowerCase();
      if (answer === 'fold') return { action: 'fold' };
      if (answer === 'call') return { action: 'call' };
      if (answer === 'raise' && player.chips > owed) {
        const amount = Number(await askQuestion(rl, 'Raise by how many chips? '));
        if (Number.isInteger(amount) && amount > 0) return { action: 'raise', amount };
      }
      console.log('Enter call, raise, or fold. A raise amount must be a positive whole number.');
    } else {
      const answer = (await askQuestion(
        rl,
        `${balance} | Choose check, bet, or fold: `,
      )).toLowerCase();
      if (answer === 'check') return { action: 'check' };
      if (answer === 'fold') return { action: 'fold' };
      if (answer === 'bet' && player.chips > 0) {
        const amount = Number(await askQuestion(rl, 'Bet how many chips? '));
        if (Number.isInteger(amount) && amount > 0) return { action: 'bet', amount };
      }
      console.log('Enter check, bet, or fold. A bet amount must be a positive whole number.');
    }
  }
}

async function runBettingRound(rl, players, community, streetName) {
  for (const player of players) player.streetBet = 0;
  let currentBet = 0;
  let pending = players.filter((player) => !player.folded && player.chips > 0);
  console.log(`\n${streetName} betting | Pot: $${getPot(players)}`);

  while (pending.length > 0) {
    const player = pending.shift();
    if (player.folded || player.chips === 0) continue;
    const result = player.isHuman
      ? await getPlayerAction(rl, player, currentBet, getPot(players))
      : getAiAction(player, community, currentBet);

    if (result.action === 'fold') {
      player.folded = true;
      console.log(`${player.name} folds.`);
      continue;
    }
    if (result.action === 'check') {
      console.log(`${player.name} checks.`);
      continue;
    }
    if (result.action === 'call') {
      const owed = currentBet - player.streetBet;
      const committed = commitChips(player, owed);
      console.log(`${player.name} calls $${committed}${committed < owed ? ' all-in' : ''}.`);
      continue;
    }

    const owed = currentBet - player.streetBet;
    const wager = result.action === 'raise' ? owed + result.amount : result.amount;
    const committed = commitChips(player, wager);
    if (player.streetBet > currentBet) {
      currentBet = player.streetBet;
      console.log(`${player.name} ${result.action === 'raise' ? 'raises' : 'bets'} to $${currentBet}.`);
      pending = players.filter(
        (other) =>
          other !== player &&
          !other.folded &&
          other.chips > 0 &&
          other.streetBet < currentBet,
      );
    } else {
      console.log(`${player.name} bets $${committed} and is all-in.`);
    }
  }

  return players.filter((player) => !player.folded).length > 1;
}

function awardPot(players, community) {
  const levels = [...new Set(players.map((player) => player.handBet).filter((amount) => amount > 0))]
    .sort((a, b) => a - b);
  let previousLevel = 0;

  for (const level of levels) {
    const contributors = players.filter((player) => player.handBet >= level);
    const pot = (level - previousLevel) * contributors.length;
    previousLevel = level;
    const eligible = contributors.filter((player) => !player.folded);
    if (eligible.length === 0) {
      eligible.push(...players.filter((player) => !player.folded));
    }
    if (eligible.length === 0) continue;

    let winners = [{ player: eligible[0], hand: bestFiveCardHand([...eligible[0].hand, ...community]) }];
    for (const player of eligible.slice(1)) {
      const hand = bestFiveCardHand([...player.hand, ...community]);
      const comparison = compareScores(hand.score, winners[0].hand.score);
      if (comparison > 0) winners = [{ player, hand }];
      else if (comparison === 0) winners.push({ player, hand });
    }

    const share = Math.floor(pot / winners.length);
    let remainder = pot % winners.length;
    for (const winner of winners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      winner.player.chips += payout;
      if (remainder > 0) remainder--;
      console.log(`${winner.player.name} wins $${payout} with ${winner.hand.name}.`);
    }
  }
}

async function playRound(rl, players) {
  const deck = shuffleDeck(buildDeck());
  const community = [];
  for (const player of players) {
    player.hand = [drawCard(deck), drawCard(deck)];
    player.handBet = 0;
    player.streetBet = 0;
    player.folded = false;
  }

  console.log('\n=== Texas Hold\'em ===');
  console.log(`Your chips: $${players[0].chips}`);
  console.log(`Your hole cards: ${formatHand(players[0].hand)}`);
  console.log(`${players.length - 1} AI opponents are at the table.`);

  for (const player of players) {
    const ante = commitChips(player, ANTE);
    player.streetBet = 0;
    console.log(`${player.name} antes $${ante}.`);
  }

  let hasContenders = await runBettingRound(rl, players, community, 'Pre-flop');
  if (hasContenders) {
    console.log('\nThe dealer burns a card and deals the flop...');
    drawCard(deck);
    community.push(drawCard(deck), drawCard(deck), drawCard(deck));
    console.log(`Flop: ${formatHand(community)}`);
    hasContenders = await runBettingRound(rl, players, community, 'Flop');
  }
  if (hasContenders) {
    console.log('\nThe dealer burns a card and deals the turn...');
    drawCard(deck);
    community.push(drawCard(deck));
    console.log(`Turn: ${formatHand(community)}`);
    hasContenders = await runBettingRound(rl, players, community, 'Turn');
  }
  if (hasContenders) {
    console.log('\nThe dealer burns a card and deals the river...');
    drawCard(deck);
    community.push(drawCard(deck));
    console.log(`River: ${formatHand(community)}`);
    await runBettingRound(rl, players, community, 'River');
  }

  if (players.filter((player) => !player.folded).length === 1) {
    const winner = players.find((player) => !player.folded);
    const pot = getPot(players);
    winner.chips += pot;
    console.log(`${winner.name} wins the $${pot} pot because everyone else folded.`);
  } else {
    console.log('\nFINAL HANDS');
    for (const player of players.filter((entry) => !entry.folded)) {
      const best = bestFiveCardHand([...player.hand, ...community]);
      console.log(`${player.name}: ${best.name} - ${formatHand(best.cards)}`);
    }
    awardPot(players, community);
  }

  console.log(`\nYour remaining chips: $${players[0].chips}`);
  for (const player of players.slice(1)) console.log(`${player.name}: $${player.chips}`);
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const players = [
    { name: 'You', chips: STARTING_CHIPS, isHuman: true },
    { name: 'AI 1', chips: STARTING_CHIPS, isHuman: false },
    { name: 'AI 2', chips: STARTING_CHIPS, isHuman: false },
    { name: 'AI 3', chips: STARTING_CHIPS, isHuman: false },
  ];
  let playAgain = true;

  while (playAgain && players[0].chips > 0) {
    const activePlayers = players.filter((player) => player.chips > 0);
    if (activePlayers.length < 2) break;
    await playRound(rl, activePlayers);
    if (players[0].chips === 0 || players.filter((player) => player.chips > 0).length < 2) break;
    const answer = await askQuestion(rl, '\nPlay another hand? (y/n): ');
    playAgain = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  if (players[0].chips === 0) console.log('\nYou are out of chips. Game over.');
  else if (players.filter((player) => player.chips > 0).length === 1) {
    console.log('\nYou have outlasted all of the AI players!');
  }
  console.log('\nThanks for playing Texas Hold\'em!');
  rl.close();
}

module.exports = {
  main,
  buildDeck,
  shuffleDeck,
  formatCard,
  bestFiveCardHand,
  evaluateFiveCardHand,
  compareScores,
  getAiAction,
  getPot,
  commitChips,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('An error occurred:', error);
    process.exit(1);
  });
}
