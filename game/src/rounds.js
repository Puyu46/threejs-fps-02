// Rounds and the economy: the buy phase, the live round, the plant, and the money.
// A round is won by eliminating the other squad, by the bomb exploding, or by the
// defenders holding until the clock runs out. First to five rounds takes the match.
import { ECONOMY } from './state.js';
import { SITES, PLAYER_SPAWN } from './world.js';
import { WEAPONS, GRENADE } from './weapons.js';

export const BUY_ITEMS = [
  { id: 'rifle', name: 'VK-7 Carbine', price: 2700, kind: 'weapon' },
  { id: 'smg', name: 'Hornet SMG', price: 1500, kind: 'weapon' },
  { id: 'shotgun', name: 'Breacher-12', price: 1100, kind: 'weapon' },
  { id: 'grenade', name: 'Spark Frag', price: 300, kind: 'grenade' },
  { id: 'armor', name: 'Plate Vest', price: 650, kind: 'armor' },
];

const PLANT_SECONDS = 4;
const BOMB_FUSE = 35;

export function createRounds(state, deps) {
  // deps: { player, weapons, bots, combat, hud, audio, onRoundEnd, onMatchEnd }
  const { player, weapons, bots, hud } = deps;

  function siteAt(position) {
    for (const key of ['A', 'B']) {
      const site = SITES[key];
      const dx = position.x - site.center.x;
      const dz = position.z - site.center.z;
      if (Math.hypot(dx, dz) <= site.radius) return key;
    }
    return null;
  }

  function startBuy() {
    state.phase = 'buy';
    state.roundTime = state.buyTime;
    state.bomb = null;
    state.plantProgress = 0;
    state.plantSite = null;
    player.reset(PLAYER_SPAWN);
    bots.reset();
    deps.combat.clear();
    weapons.refillAmmo();
    hud.setHealth(player.state.health, player.state.armor);
    hud.setAmmo(weapons.currentAmmo().mag, weapons.currentAmmo().reserve);
    hud.setMoney(state.money);
    hud.setRound(state.round, state.score);
    hud.setBomb(null);
    hud.setPlant(null);
    hud.setDefuse(null);
    hud.announce(`Round ${state.round} — buy phase`, 2600);
  }

  function startLive() {
    state.phase = 'live';
    state.roundTime = state.roundLength;
    hud.showBuy(false);
    hud.announce('Go — plant the charge at A or B', 2200);
  }

  function award(amount, reason) {
    state.money += amount;
    hud.setMoney(state.money);
    hud.feed(`+$${amount} — ${reason}`);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.roundTime = 4.5;
    state.roundEndWinner = winner;
    state.roundEndReason = reason;
    if (winner === 'you') {
      state.score.you += 1;
      award(ECONOMY.roundWin, 'round won');
      deps.audio.roundWin();
    } else {
      state.score.foe += 1;
      award(ECONOMY.roundLoss, 'round lost');
      deps.audio.roundLose();
    }
    hud.setRound(state.round, state.score);
    hud.showOverlay('roundEnd', { winner, reason, score: state.score, money: state.money });
    if (document.pointerLockElement) document.exitPointerLock();
    deps.onRoundEnd(winner, reason);
  }

  function endMatch() {
    state.phase = 'matchEnd';
    state.matchWinner = state.score.you >= state.winsToTakeMatch ? 'you' : 'foe';
    hud.showOverlay('matchEnd', { winner: state.matchWinner, score: state.score });
    if (document.pointerLockElement) document.exitPointerLock();
    deps.onMatchEnd(state.matchWinner);
  }

  function nextRound() {
    if (state.score.you >= state.winsToTakeMatch || state.score.foe >= state.winsToTakeMatch) {
      endMatch();
      return;
    }
    state.round += 1;
    startBuy();
    hud.hideOverlay();
    hud.showBuy(true);
  }

  function buy(id) {
    const item = BUY_ITEMS.find((entry) => entry.id === id);
    if (!item || state.phase !== 'buy') return false;
    if (state.money < item.price) {
      hud.announce('Not enough money', 1200);
      return false;
    }
    if (item.kind === 'weapon') {
      if (weapons.state.owned[id]) {
        hud.announce('Already owned', 1200);
        return false;
      }
      weapons.buy(id);
      weapons.select(id);
    } else if (item.kind === 'grenade') {
      if (!weapons.buyGrenade()) {
        hud.announce('Carrying the maximum', 1200);
        return false;
      }
    } else if (item.kind === 'armor') {
      if (player.state.armor >= 100) {
        hud.announce('Armour already full', 1200);
        return false;
      }
      player.state.armor = 100;
    }
    state.money -= item.price;
    hud.setMoney(state.money);
    hud.setHealth(player.state.health, player.state.armor);
    hud.setAmmo(weapons.currentAmmo().mag, weapons.currentAmmo().reserve);
    deps.audio.buy();
    return true;
  }

  // Hold E inside a site to plant. Returns 'planted' the frame the charge is set.
  function updatePlant(dt, holding) {
    if (state.phase !== 'live' || state.bomb) {
      state.plantProgress = 0;
      state.plantSite = null;
      hud.setPlant(null);
      return null;
    }
    const site = siteAt(player.state.position);
    if (!site || !holding) {
      state.plantProgress = Math.max(0, state.plantProgress - dt * 2);
      state.plantSite = site;
      hud.setPlant(state.plantProgress > 0 ? state.plantProgress : null);
      return null;
    }
    state.plantSite = site;
    state.plantProgress += dt / PLANT_SECONDS;
    hud.setPlant(state.plantProgress);
    if (state.plantProgress >= 1) {
      state.plantProgress = 0;
      hud.setPlant(null);
      const siteDef = SITES[site];
      state.bomb = {
        site,
        position: siteDef.center.clone(),
        fuse: BOMB_FUSE,
        defuse: 0,
        lastBeep: BOMB_FUSE,
      };
      state.plants += 1;
      award(ECONOMY.plant, 'charge planted');
      hud.announce(`Charge planted at ${site} — defend it`, 2600);
      deps.audio.plantBeep();
      bots.sendToBomb();
      return 'planted';
    }
    return null;
  }

  function tick(dt) {
    if (state.phase === 'buy') {
      state.roundTime -= dt;
      if (state.roundTime <= 0) startLive();
    } else if (state.phase === 'live') {
      state.roundTime -= dt;
      if (state.bomb) {
        state.bomb.fuse -= dt;
        hud.setBomb(state.bomb.fuse);
        const whole = Math.ceil(state.bomb.fuse);
        if (whole !== state.bomb.lastBeep) {
          state.bomb.lastBeep = whole;
          deps.audio.bombBeep();
        }
        if (state.bomb.fuse <= 0) {
          deps.combat.burst(state.bomb.position, 48, 11, '#f0a830');
          deps.audio.explosion();
          endRound('you', 'The charge detonated at site ' + state.bomb.site);
          return;
        }
      }
      if (state.roundTime <= 0) {
        endRound('foe', 'Time expired — the Ember crew held the yard');
      } else if (bots.aliveCount() === 0) {
        endRound('you', 'Squad eliminated — yard clear');
      }
    } else if (state.phase === 'roundEnd') {
      state.roundTime -= dt;
      if (state.roundTime <= 0) nextRound();
    }
  }

  return {
    startBuy,
    startLive,
    endRound,
    endMatch,
    nextRound,
    buy,
    updatePlant,
    tick,
    siteAt,
    award,
  };
}
