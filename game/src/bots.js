// The Ember crew: four defending bots with names of their own. Each bot patrols a
// route, holds a position, reacts to what it sees and hears, and runs to defuse a
// planted bomb. Vision is a real line-of-sight raycast against the world; shooting is
// a burst with a reaction delay and distance-based accuracy, so a still, aiming player
// is harder to hit than a sprinting one is easy to miss.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { moveBody } from './physics.js';
import { ROUTES, BOT_SPAWNS } from './world.js';
import { range, pick } from './rng.js';

const HEALTH = 100;
const EYE_HEIGHT = 1.5;
const RADIUS = 0.36;
const HEIGHT = 1.72;
const VISION_RANGE = 40;
const VISION_COS = Math.cos((55 * Math.PI) / 180);
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.65;
const DEFUSE_SECONDS = 5;

const NAMES = ['Rook', 'Vex', 'Mara', 'Jinx'];

export function createBots(scene, world, random, callbacks) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.65, metalness: 0.05 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.1 });
  const torsoGeometry = new THREE.BoxGeometry(0.54, 0.8, 0.32);
  const headGeometry = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.22);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.6);

  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE + 4;
  const losFrom = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const bots = [];
  const hitMeshes = [];

  function buildBot(index, spawn) {
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);

    const legL = new THREE.Mesh(legGeometry, darkMaterial);
    legL.position.set(-0.13, 0.35, 0);
    const legR = new THREE.Mesh(legGeometry, darkMaterial);
    legR.position.set(0.13, 0.35, 0);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = 1.1;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.68;
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.28, 1.25, -0.25);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      name: NAMES[index % NAMES.length],
      index,
      group,
      torso,
      head,
      legL,
      legR,
      hitMeshes: [torso, head, legL, legR],
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: range(random, 0, Math.PI * 2),
      health: HEALTH,
      alive: true,
      route: spawn.route,
      routeIndex: index % ROUTES[spawn.route].length,
      state: 'patrol', // 'patrol' | 'hold' | 'investigate' | 'engage' | 'defuse' | 'dead'
      target: new THREE.Vector3(spawn.x, 0, spawn.z),
      lastKnown: new THREE.Vector3(),
      seenAt: -10,
      reactionAt: 0,
      burstLeft: 0,
      burstGap: 0,
      scanTime: 0,
      stuckTime: 0,
      lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
      visionTimer: index * 0.05,
      walkPhase: random() * Math.PI * 2,
      fall: 0,
      defuseProgress: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    legL.userData.bot = bot;
    legL.userData.part = 'legs';
    legR.userData.bot = bot;
    legR.userData.part = 'legs';
    hitMeshes.push(torso, head, legL, legR);
    return bot;
  }

  for (let i = 0; i < BOT_SPAWNS.length; i += 1) bots.push(buildBot(i, BOT_SPAWNS[i]));

  function canSee(bot, playerPos, playerAlive, playerCrouching) {
    if (!playerAlive) return false;
    tmp.copy(playerPos);
    tmp.y += playerCrouching ? 0.9 : 1.2;
    losFrom.copy(bot.position);
    losFrom.y += EYE_HEIGHT;
    losDir.copy(tmp).sub(losFrom);
    const distance = losDir.length();
    if (distance > VISION_RANGE) return false;
    losDir.normalize();
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (forward.dot(losDir) < VISION_COS && distance > 4) return false;
    raycaster.set(losFrom, losDir);
    raycaster.far = distance;
    const blocked = raycaster.intersectObjects(world.shootables, false)[0];
    return !blocked;
  }

  function moveToward(bot, point, speed, dt) {
    tmp.copy(point);
    tmp.y = 0;
    tmp.sub(bot.position);
    tmp.y = 0;
    const distance = tmp.length();
    if (distance < 0.05) return true;
    tmp.normalize();
    bot.velocity.x = tmp.x * speed;
    bot.velocity.z = tmp.z * speed;
    const ground = moveBody(world.colliders, bot.position, bot.velocity, dt, RADIUS, HEIGHT, 20);
    if (!ground) bot.velocity.y = Math.max(bot.velocity.y, -1);
    bot.yaw = Math.atan2(-tmp.x, -tmp.z);
    bot.walkPhase += dt * speed * 2.4;
    const swing = Math.sin(bot.walkPhase) * 0.35;
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    return distance < 0.9;
  }

  function damage(bot, part, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // Being shot is heard: the bot turns toward the shooter.
      bot.state = 'investigate';
      return false;
    }
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    callbacks.onBotKilled(bot, part);
    return true;
  }

  function hearNoise(point, radius) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage' || bot.state === 'defuse') continue;
      if (bot.position.distanceTo(point) < radius) {
        bot.lastKnown.copy(point);
        bot.state = 'investigate';
      }
    }
  }

  function step(dt, time, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        continue;
      }
      bot.group.rotation.x = 0;
      bot.visionTimer -= dt;
      let sees = false;
      if (bot.visionTimer <= 0) {
        bot.visionTimer = 0.12;
        sees = canSee(bot, ctx.playerPos, ctx.playerAlive, ctx.playerCrouching);
        if (sees) {
          bot.lastKnown.copy(ctx.playerPos);
          bot.seenAt = time;
          if (bot.state !== 'engage') {
            bot.state = 'engage';
            bot.reactionAt = time + range(random, REACTION_MIN, REACTION_MAX);
            bot.burstLeft = 0;
            bot.burstGap = 0;
          }
        } else if (bot.state === 'engage' && time - bot.seenAt > 1.2) {
          bot.state = 'investigate';
        }
      }

      // Stuck detection: if the bot barely moved while trying to walk, reroute.
      if (bot.state === 'patrol' || bot.state === 'investigate' || bot.state === 'defuse') {
        if (bot.position.distanceTo(bot.lastPos) < 0.05) {
          bot.stuckTime += dt;
          if (bot.stuckTime > 1.5) {
            bot.stuckTime = 0;
            bot.routeIndex = (bot.routeIndex + 1) % ROUTES[bot.route].length;
            const wp = ROUTES[bot.route][bot.routeIndex];
            bot.target.set(wp[0], 0, wp[1]);
          }
        } else {
          bot.stuckTime = 0;
        }
        bot.lastPos.copy(bot.position);
      }

      if (bot.state === 'patrol') {
        const route = ROUTES[bot.route];
        const wp = route[bot.routeIndex];
        bot.target.set(wp[0], 0, wp[1]);
        if (moveToward(bot, bot.target, 2.4, dt)) {
          bot.routeIndex = (bot.routeIndex + 1) % route.length;
          bot.scanTime = 0;
        }
      } else if (bot.state === 'hold') {
        bot.yaw += Math.sin(time * 0.5 + bot.index) * dt * 0.4;
        bot.legL.rotation.x = 0;
        bot.legR.rotation.x = 0;
      } else if (bot.state === 'investigate') {
        if (moveToward(bot, bot.lastKnown, 3.4, dt)) {
          bot.scanTime += dt;
          bot.yaw += dt * 1.6;
          if (bot.scanTime > 2.5) {
            bot.scanTime = 0;
            bot.state = 'patrol';
          }
        }
      } else if (bot.state === 'engage') {
        // Face the player, strafe a little, and fire in bursts after reacting.
        tmp.copy(ctx.playerPos).sub(bot.position);
        tmp.y = 0;
        const distance = tmp.length();
        bot.yaw = Math.atan2(-tmp.x, -tmp.z);
        const strafe = Math.sin(time * 1.3 + bot.index * 2.1) * 1.6;
        const sideX = Math.cos(bot.yaw);
        const sideZ = -Math.sin(bot.yaw);
        bot.target.set(ctx.playerPos.x + sideX * strafe, 0, ctx.playerPos.z + sideZ * strafe);
        if (distance > 16) moveToward(bot, bot.target, 2.0, dt);
        else if (distance < 5) {
          bot.target.set(bot.position.x - tmp.x * 0.5, 0, bot.position.z - tmp.z * 0.5);
          moveToward(bot, bot.target, 1.6, dt);
        }
        if (time >= bot.reactionAt && ctx.playerAlive) {
          bot.burstGap -= dt;
          if (bot.burstLeft <= 0 && bot.burstGap <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.burstGap = 0.13;
          }
          if (bot.burstLeft > 0 && bot.burstGap <= 0) {
            bot.burstLeft -= 1;
            bot.burstGap = 0.13;
            if (bot.burstLeft === 0) bot.burstGap = range(random, 0.5, 0.95);
            callbacks.onBotShot(bot, distance, ctx.playerSpeed);
          }
        }
      } else if (bot.state === 'defuse') {
        if (ctx.bomb) {
          if (moveToward(bot, ctx.bomb.position, 3.8, dt)) {
            bot.defuseProgress += dt / DEFUSE_SECONDS;
            callbacks.onDefuseTick(bot, bot.defuseProgress);
            if (bot.defuseProgress >= 1) callbacks.onDefused(bot);
          }
        } else {
          bot.state = 'patrol';
        }
      }
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    hitMeshes,
    damage,
    hearNoise,
    step,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    reset() {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        const spawn = BOT_SPAWNS[i];
        bot.position.set(spawn.x, 0, spawn.z);
        bot.group.position.copy(bot.position);
        bot.group.rotation.set(0, 0, 0);
        bot.velocity.set(0, 0, 0);
        bot.health = HEALTH;
        bot.alive = true;
        bot.route = spawn.route;
        bot.routeIndex = i % ROUTES[spawn.route].length;
        bot.state = 'patrol';
        bot.fall = 0;
        bot.defuseProgress = 0;
        bot.seenAt = -10;
        bot.scanTime = 0;
        bot.stuckTime = 0;
        bot.yaw = range(random, 0, Math.PI * 2);
      }
    },
    sendToBomb() {
      for (const bot of bots) {
        if (bot.alive) bot.state = 'defuse';
      }
    },
    nearestAlive(point) {
      let best = null;
      let bestDistance = Infinity;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = bot.position.distanceTo(point);
        if (d < bestDistance) {
          bestDistance = d;
          best = bot;
        }
      }
      return best;
    },
  };
}
