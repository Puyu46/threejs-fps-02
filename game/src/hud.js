// The DOM HUD: crosshair, health, ammo, money, timer, score, kill feed, the buy menu
// and the one overlay panel. It never touches the simulation; main.js pushes numbers
// in and reads the play / buy callbacks out.
import { BUY_ITEMS } from './rounds.js';

const COPY = {
  start: {
    title: 'DUSTLINE — Ember Yard',
    copy: 'A dusk yard, two bomb sites, four defenders. Plant the charge at A or B — or clear the squad. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE — paused',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const extra = $('overlay-extra');
  const play = $('play');
  const buyPanel = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenades');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const moneyValue = $('money');
  const timerValue = $('timer');
  const scoreYou = $('score-you');
  const scoreFoe = $('score-foe');
  const roundNum = $('round-num');
  const feed = $('feed');
  const message = $('message');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const bombTimer = $('bomb-timer');
  const defuseBar = $('defuse-bar');
  const defuseFill = $('defuse-fill');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage');
  const crosshair = $('crosshair');
  let hitTimer = 0;
  let messageTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastGrenades = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastRound = -1;

  // Build the buy menu once; main.js refreshes the money line.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-name"></span><span class="buy-key"></span><span class="buy-price"></span>`;
    row.querySelector('.buy-name').textContent = item.name;
    row.querySelector('.buy-key').textContent = `[${BUY_ITEMS.indexOf(item) + 1}]`;
    row.querySelector('.buy-price').textContent = `$${item.price}`;
    row.addEventListener('click', () => callbacks.onBuy(item.id));
    buyList.appendChild(row);
  }
  $('buy-close').addEventListener('click', () => callbacks.onCloseBuy());

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(health, armor) {
      if (health === lastHealth && armor === lastArmor) return;
      lastHealth = health;
      lastArmor = armor;
      healthFill.style.width = `${Math.max(0, health)}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthNum.textContent = String(Math.max(0, Math.round(health)));
      armorNum.textContent = armor > 0 ? `◈ ${Math.round(armor)}` : '';
    },
    setAmmo(mag, reserve, name, grenades) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon && grenades === lastGrenades) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name;
      lastGrenades = grenades;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
      weaponName.textContent = name;
      grenadeCount.textContent = grenades > 0 ? `◉ ${grenades} frag` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds) {
      const text = formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', seconds <= 10);
    },
    setRound(round, score) {
      const text = `${score.you} : ${score.foe}`;
      if (text !== lastScore) {
        lastScore = text;
        scoreYou.textContent = String(score.you);
        scoreFoe.textContent = String(score.foe);
      }
      if (round !== lastRound) {
        lastRound = round;
        roundNum.textContent = `ROUND ${round}`;
      }
    },
    setScore(score) {
      this.setRound(lastRound < 0 ? 1 : lastRound, score);
    },
    feed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    announce(text, ms = 2200) {
      message.textContent = text;
      message.classList.add('on');
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => message.classList.remove('on'), ms);
    },
    clearAnnounce() {
      clearTimeout(messageTimer);
      message.textContent = '';
      message.classList.remove('on');
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setPlant(progress) {
      if (progress === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.min(100, progress * 100)}%`;
    },
    setBomb(fuse) {
      if (fuse === null || fuse === undefined) {
        bombTimer.hidden = true;
        return;
      }
      bombTimer.hidden = false;
      bombTimer.textContent = `◉ CHARGE ${formatTime(fuse)}`;
      bombTimer.classList.toggle('urgent', fuse <= 10);
    },
    setDefuse(progress) {
      if (progress === null) {
        defuseBar.hidden = true;
        return;
      }
      defuseBar.hidden = false;
      defuseFill.style.width = `${Math.min(100, progress * 100)}%`;
    },
    showBuy(open) {
      buyPanel.hidden = !open;
    },
    isBuyOpen() {
      return !buyPanel.hidden;
    },
    refreshBuy(owned, grenades, armor) {
      for (const row of buyList.children) {
        const id = row.dataset.id;
        const ownedNow = id === 'grenade' ? grenades >= 2 : id === 'armor' ? armor >= 100 : !!owned[id];
        row.classList.toggle('owned', ownedNow);
      }
    },
    showOverlay(mode, data = {}) {
      if (mode === 'roundEnd') {
        title.textContent = data.winner === 'you' ? 'Round won' : 'Round lost';
        copy.textContent = data.reason;
        extra.textContent = `Score ${data.score.you} — ${data.score.foe} · $${data.money}`;
        play.textContent = 'Next round';
      } else if (mode === 'matchEnd') {
        title.textContent = data.winner === 'you' ? 'Match won — the yard is yours' : 'Match lost — the Ember crew holds the yard';
        copy.textContent = `Final score ${data.score.you} — ${data.score.foe}. First to five rounds takes the match.`;
        extra.textContent = '';
        play.textContent = 'Play again';
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        extra.textContent = '';
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
