// One place for all mutable game state. Modules read and write fields here; none of
// them keeps a second copy of the round, the score or the economy.
export function createGameState() {
  return {
    // 'menu' | 'buy' | 'live' | 'roundEnd' | 'matchEnd'
    phase: 'menu',
    round: 1,
    roundTime: 0, // seconds left in the current phase
    buyTime: 14,
    roundLength: 100,
    score: { you: 0, foe: 0 },
    winsToTakeMatch: 5,
    money: 800,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    // bomb: null | { site: 'A'|'B', position, fuse, plantedBy: 'you', defuse: 0..1 }
    bomb: null,
    plantProgress: 0, // 0..1 while the player holds E inside a site
    plantSite: null,
    elapsed: 0,
    roundEndReason: '',
    roundEndWinner: null, // 'you' | 'foe'
    matchWinner: null,
    // transient per-frame events the HUD drains
    feed: [],
    message: '',
    messageUntil: 0,
    shake: 0,
  };
}

export const ECONOMY = {
  roundWin: 3250,
  roundLoss: 1900,
  kill: 300,
  plant: 300,
  startMoney: 800,
};
