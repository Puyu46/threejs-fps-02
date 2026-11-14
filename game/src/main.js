// DUSTLINE — Ember Yard. Boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. The game is a round-based tactical FPS: the player
// (Vanguard) attacks two bomb sites against four Ember crew bots, with money, a buy
// menu, and a plant/defuse objective. First to five rounds takes the match.
//
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, range } from './rng.js';
import { createGameState, ECONOMY } from './state.js';
import { createWorld, SITES, PLAYER_SPAWN } from './world.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createRounds, BUY_ITEMS } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

window.addEventListener('error', (event) => {
  const fatal = document.getElementById('fatal');
  if (fatal) fatal.textContent = `ERROR: ${event.message}`;
  document.title = `ERROR: ${event.message}`;
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createGameState();
const world = createWorld(scene);
const audio = createAudio();
const player = createPlayer(world.colliders, PLAYER_SPAWN);
const weapons = createWeapons(camera);
const combat = createCombat(scene, world);
const hud = createHud({
  onBuy: (id) => {
    if (rounds.buy(id)) hud.refreshBuy(weapons.state.owned, weapons.state.grenades, player.state.armor);
  },
  onCloseBuy: () => closeBuy(),
});
const input = createInput(renderer.domElement, onLockChange);

const body = player.state;
const muzzle = new THREE.Vector3();
const aimDir = new THREE.Vector3();
let buyOpen = false;
let prevFiring = false;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();

function openBuy() {
  if (state.phase !== 'buy') return;
  buyOpen = true;
  hud.showBuy(true);
  hud.refreshBuy(weapons.state.owned, weapons.state.grenades, player.state.armor);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuy() {
  buyOpen = false;
  hud.showBuy(false);
  if (state.phase === 'buy' || state.phase === 'live') input.requestLock();
}

function startMatch() {
  state.score = { you: 0, foe: 0 };
  state.round = 1;
  state.money = ECONOMY.startMoney;
  state.kills = 0;
  state.deaths = 0;
  state.plants = 0;
  state.matchWinner = null;
  player.state.armor = 0;
  weapons.resetToPistol();
  rounds.startBuy();
  openBuy();
  hud.setMoney(state.money);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (!buyOpen && (state.phase === 'live' || state.phase === 'buy')) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu') {
    startMatch();
    input.requestLock();
  } else if (state.phase === 'roundEnd') {
    rounds.nextRound();
    input.requestLock();
  } else if (state.phase === 'matchEnd') {
    startMatch();
    input.requestLock();
  } else {
    input.requestLock();
  }
});

const bots = createBots(scene, world, random, {
  onBotKilled(bot, part) {
    state.kills += 1;
    state.money += ECONOMY.kill;
    hud.setMoney(state.money);
    hud.feed(`You eliminated ${bot.name}${part === 'head' ? ' — headshot' : ''}  +$${ECONOMY.kill}`);
    audio.kill();
    if (bots.aliveCount() === 0 && state.phase === 'live') {
      // endRound is called by rounds.tick; the check there fires on the next step.
    }
  },
  onBotShot(bot, distance, playerSpeed) {
    // A burst round: accuracy falls with distance and with the player's speed.
    const accuracy = Math.max(0.08, Math.min(0.34, 0.34 - distance * 0.006))
      * (playerSpeed > 3.5 ? 0.55 : 1)
      * (body.crouching ? 0.8 : 1);
    const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
    const to = new THREE.Vector3(body.position.x, body.position.y + body.eye - 0.25, body.position.z);
    if (random() < accuracy) {
      const amount = 9 + random() * 6;
      applyPlayerDamage(amount);
    } else {
      // Miss: the tracer passes just wide of the player.
      to.x += (random() - 0.5) * 1.6;
      to.y += (random() - 0.5) * 1.2;
      to.z += (random() - 0.5) * 1.6;
    }
    combat.shoot(from, to.clone().sub(from).normalize(), 0.004, random, [], null);
    audio.enemyShot(distance);
  },
  onDefuseTick(bot, progress) {
    hud.setDefuse(progress);
    if (Math.floor(progress * 10) !== Math.floor((progress - 0.016) * 10)) audio.defuseBeep();
  },
  onDefused(bot) {
    const site = state.bomb ? state.bomb.site : '';
    hud.setDefuse(null);
    state.bomb = null;
    state.defuses += 1;
    hud.announce(`${bot.name} defused the charge`, 2600);
    rounds.endRound('foe', `${bot.name} defused the charge at site ${site}`);
  },
});

const rounds = createRounds(state, {
  player,
  weapons,
  bots,
  combat,
  hud,
  audio,
  onRoundEnd() {},
  onMatchEnd() {},
});

function applyPlayerDamage(amount) {
  if (!body.alive || state.phase !== 'live') return;
  const absorbed = Math.min(body.armor, amount * 0.35);
  body.armor -= absorbed;
  body.health -= (amount - absorbed);
  hud.setHealth(body.health, body.armor);
  hud.damage();
  state.shake = Math.min(1, state.shake + 0.25);
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    state.deaths += 1;
    rounds.endRound('foe', 'You were eliminated');
  }
}

function damageBot(bot, part, distance) {
  const def = weapons.def();
  const mult = part === 'head' ? def.headMul : part === 'legs' ? def.legMul : 1;
  const falloff = distance > def.range * 0.6
    ? Math.max(0.55, 1 - ((distance - def.range * 0.6) / (def.range * 0.4)) * 0.45)
    : 1;
  const killed = bots.damage(bot, part, def.damage * mult * falloff);
  hud.hitMarker(killed, shot ? 4000 : 90);
  if (!killed) audio.hit();
}

function muzzlePosition() {
  camera.getWorldDirection(aimDir);
  muzzle.copy(camera.position).addScaledVector(aimDir, 0.5);
  muzzle.x += Math.cos(body.yaw) * 0.18;
  muzzle.z -= Math.sin(body.yaw) * 0.18;
  muzzle.y -= 0.12;
  return muzzle;
}

function shootPlayer(spread) {
  const def = weapons.def();
  if (weapons.state.current === 'grenade') {
    if (weapons.state.grenades <= 0) return;
    weapons.state.grenades -= 1;
    weapons.state.cooldown = 0.6;
    camera.getWorldDirection(aimDir);
    combat.throwGrenade(muzzlePosition(), aimDir, 13);
    audio.shot('smg');
    hud.setAmmo(weapons.currentAmmo().mag, weapons.currentAmmo().reserve, 'Spark Frag', weapons.state.grenades);
    if (weapons.state.grenades === 0) weapons.select(lastPrimaryOwned());
    return;
  }
  if (!weapons.takeRound()) {
    audio.dryClick();
    return;
  }
  camera.getWorldDirection(aimDir);
  const from = muzzlePosition();
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    combat.shoot(from, aimDir, spread, random, bots.bots, (bot, part, distance) => damageBot(bot, part, distance));
  }
  weapons.pullTrigger();
  player.recoil(def.kick + random() * 0.003, (random() * 2 - 1) * 0.003);
  audio.shot(def.id);
  bots.hearNoise(body.position, 28);
  hud.setAmmo(weapons.currentAmmo().mag, weapons.currentAmmo().reserve, def.name, weapons.state.grenades);
}

function lastPrimaryOwned() {
  for (const id of ['rifle', 'smg', 'shotgun']) if (weapons.state.owned[id]) return id;
  return 'pistol';
}

function selectSlot(slot) {
  if (slot === 1) {
    weapons.select(lastPrimaryOwned());
  } else if (slot === 2) {
    weapons.select('pistol');
  } else if (slot === 3) {
    weapons.select('grenade');
  }
}

function cycleWeapon(direction) {
  const slots = [1, 2, 3].filter((slot) => {
    if (slot === 1) return true;
    if (slot === 2) return true;
    return weapons.state.grenades > 0;
  });
  const current = weapons.state.current === 'grenade' ? 3 : (weapons.state.current === 'pistol' ? 2 : 1);
  const index = slots.indexOf(current);
  const next = slots[(index + direction + slots.length) % slots.length];
  selectSlot(next);
}

function explodeGrenade(point) {
  audio.explosion();
  state.shake = 1;
  bots.hearNoise(point, 30);
  const radius = 6.5;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.position.distanceTo(point);
    if (d < radius) {
      const amount = 15 + 105 * (1 - d / radius);
      const killed = bots.damage(bot, 'torso', amount);
      if (killed) hud.feed(`Frag got ${bot.name}`);
    }
  }
  const playerDistance = new THREE.Vector3(body.position.x, body.position.y + 0.8, body.position.z).distanceTo(point);
  if (playerDistance < radius) {
    applyPlayerDamage(15 + 105 * (1 - playerDistance / radius));
  }
}

function syncCamera() {
  const shakeX = state.shake > 0 ? (random() - 0.5) * state.shake * 0.02 : 0;
  const shakeY = state.shake > 0 ? (random() - 0.5) * state.shake * 0.02 : 0;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + shakeY, body.yaw + shakeX, 0, 'YXZ');
  state.shake = Math.max(0, state.shake - 0.03);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function step(dt) {
  state.elapsed += dt;
  const keys = input.state.keys;
  const pressed = input.takePressed();
  const inGame = state.phase === 'buy' || state.phase === 'live';

  if (inGame && !shot) {
    if (pressed.has('KeyB') && state.phase === 'buy') {
      if (buyOpen) closeBuy();
      else openBuy();
    }
    if (buyOpen) {
      for (let i = 0; i < BUY_ITEMS.length; i += 1) {
        if (pressed.has(`Digit${i + 1}`)) {
          if (rounds.buy(BUY_ITEMS[i].id)) hud.refreshBuy(weapons.state.owned, weapons.state.grenades, body.armor);
        }
      }
    } else {
      if (pressed.has('Digit1')) selectSlot(1);
      if (pressed.has('Digit2')) selectSlot(2);
      if (pressed.has('Digit3')) selectSlot(3);
      const wheel = input.takeWheel();
      if (wheel !== 0) cycleWeapon(wheel > 0 ? 1 : -1);
      if (pressed.has('KeyR')) {
        weapons.reload();
        audio.reload();
      }
    }
  }

  if (state.phase === 'live' && body.alive) {
    const planting = rounds.updatePlant(dt, keys.has('KeyE'));
    if (planting === 'planted') hud.setBomb(state.bomb.fuse);
  } else {
    rounds.updatePlant(dt, false);
  }

  player.step(dt, keys);
  weapons.step(dt);
  bots.step(dt, state.elapsed, {
    playerPos: body.position,
    playerAlive: body.alive && state.phase === 'live',
    playerCrouching: body.crouching,
    playerSpeed: player.groundSpeed(),
    bomb: state.bomb,
  });
  combat.step(dt, explodeGrenade, world.colliders);
  rounds.tick(dt);
  // The buy panel can also be opened by the round flow; keep the flag in sync.
  buyOpen = hud.isBuyOpen();

  // HUD readouts, refreshed every fixed step.
  hud.setTimer(state.roundTime);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(state.money);
  const ammoNow = weapons.currentAmmo();
  const nameNow = weapons.state.current === 'grenade' ? 'Spark Frag' : weapons.def().name;
  hud.setAmmo(ammoNow.mag, ammoNow.reserve, nameNow, weapons.state.grenades);
  hud.setCrosshairSpread(4 + weapons.spread(player.groundSpeed()) * 900);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const firing = input.state.firing && state.phase === 'live';
    const def = weapons.def();
    if (firing && body.alive) {
      if (def.auto) {
        if (weapons.ready()) shootPlayer(weapons.spread(player.groundSpeed()));
      } else if (!prevFiring && weapons.ready()) {
        shootPlayer(weapons.spread(player.groundSpeed()));
      }
    }
    prevFiring = firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    startMatch();
    hud.hideOverlay();
    body.position.set(0, 0, 15.5);
    body.yaw = 0.06;
    settle(20);
  } else if (name === 'play') {
    startMatch();
    buyOpen = false;
    hud.showBuy(false);
    rounds.startLive();
    hud.hideOverlay();
    body.position.set(0, 0, 8);
    body.yaw = 0.12;
    body.pitch = -0.01;
    weapons.buy('rifle');
    weapons.select('rifle');
    state.money = 2100; // the kill below adds $300, so the shot shows $2,400
    // Stage the fight in the Mid doorway: one bot engaging through the gap,
    // one patrolling, one down. The engaging bot is already hurt (30 HP), so
    // the one rifle round the shot fires genuinely eliminates it.
    const [b0, b1, b2, b3] = bots.bots;
    b0.position.set(0.5, 0, -5);
    b0.health = 30;
    b0.state = 'engage';
    b0.seenAt = state.elapsed;
    b0.reactionAt = state.elapsed + 10;
    b1.position.set(-6, 0, 2);
    b1.state = 'patrol';
    b2.position.set(2.2, 0, 1.5);
    b2.alive = false;
    b2.state = 'dead';
    b2.fall = 1;
    b2.group.rotation.x = -1.45;
    b3.position.set(-4, 0, -9);
    b3.state = 'patrol';
    for (const bot of bots.bots) bot.group.position.copy(bot.position);
    settle(20);
    state.roundTime = 72;
    const target = new THREE.Vector3(b0.position.x, 1.2, b0.position.z);
    aimAt(target);
    shootPlayer(0);
    body.health = 100;
    hud.setHealth(100, 0);
    hud.announce('Go — plant the charge at A or B', 4000);
  } else if (name === 'plant') {
    startMatch();
    buyOpen = false;
    hud.showBuy(false);
    rounds.startLive();
    hud.hideOverlay();
    state.bomb = {
      site: 'A',
      position: SITES.A.center.clone(),
      fuse: 18,
      defuse: 0,
      lastBeep: 18,
    };
    state.plants = 1;
    body.position.set(10, 0, -5);
    aimAt(new THREE.Vector3(16, 1.2, -11));
    const [b0, b1] = bots.bots;
    b0.position.set(13, 0, -7);
    b0.state = 'defuse';
    b1.position.set(18.5, 0, -6);
    b1.state = 'defuse';
    bots.bots[2].position.set(8, 0, -12);
    bots.bots[2].state = 'defuse';
    for (const bot of bots.bots) bot.group.position.copy(bot.position);
    settle(20);
    state.roundTime = 61;
    hud.setBomb(18);
    hud.setDefuse(0.22);
    hud.announce('Charge planted at A — defend it', 4000);
  } else {
    // end: the round just ended in a win.
    startMatch();
    buyOpen = false;
    hud.showBuy(false);
    state.score = { you: 1, foe: 0 };
    state.money = 800 + ECONOMY.roundWin + ECONOMY.kill;
    state.kills = 1;
    state.phase = 'roundEnd';
    state.roundTime = 4.5;
    state.roundEndWinner = 'you';
    state.roundEndReason = 'Squad eliminated — yard clear';
    hud.clearAnnounce();
    hud.setRound(1, state.score);
    hud.setMoney(state.money);
    hud.showOverlay('roundEnd', { winner: 'you', reason: state.roundEndReason, score: state.score, money: state.money });
    body.position.set(0, 0, 10);
    body.yaw = -0.15;
    settle(10);
  }
  hud.setTimer(state.roundTime);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setMoney(state.money);
hud.setRound(1, state.score);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
