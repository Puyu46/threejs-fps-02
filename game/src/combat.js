// Combat: hitscan shots against bot hitboxes and the world, tracers, impact sparks,
// and thrown frag grenades. No new objects in the hot loop: tracers and particles are
// pooled and reused.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 160;
const TRACER_LIFE = 0.09;
const PARTICLE_LIFE = 0.5;

export function createCombat(scene, world) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  // Tracer pool: thin stretched boxes from muzzle to hit point.
  const tracers = [];
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false });
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMaterial);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  // Particle pool: small tetrahedra that burst on impacts and explosions.
  const particles = [];
  const particleGeometry = new THREE.TetrahedronGeometry(0.07);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
  }
  let particleIndex = 0;

  const grenades = [];
  const grenadeGeometry = new THREE.SphereGeometry(0.12, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.3 });
  const grenadeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14, 1.6);
  scene.add(grenadeLight);

  function spawnTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
    const length = from.distanceTo(to);
    tracer.mesh.position.copy(from).lerp(to, 0.5);
    tracer.mesh.lookAt(to);
    tracer.mesh.scale.set(1, 1, Math.max(0.1, length));
    tracer.mesh.visible = true;
    tracer.life = TRACER_LIFE;
  }

  function burst(point, count, spreadSpeed, colour) {
    for (let i = 0; i < count; i += 1) {
      const p = particles[particleIndex];
      particleIndex = (particleIndex + 1) % MAX_PARTICLES;
      p.mesh.position.copy(point);
      p.mesh.material = p.mesh.material; // shared material, colour set below per burst
      p.velocity.set((Math.random() - 0.5) * spreadSpeed, Math.random() * spreadSpeed * 0.8, (Math.random() - 0.5) * spreadSpeed);
      p.mesh.visible = true;
      p.life = PARTICLE_LIFE * (0.5 + Math.random() * 0.5);
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
    }
    particleMaterial.color.set(colour);
  }

  // Fire one hitscan pellet from `from` along `dir` with `spread` (radians).
  // Returns { hit: 'bot'|'wall'|null, bot, part, point, distance }.
  function shoot(from, dir, spread, random, bots, damageFn) {
    direction.copy(dir);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    origin.copy(from);
    scene.updateMatrixWorld(true);
    raycaster.set(origin, direction);
    const targets = [];
    for (const bot of bots) if (bot.alive) targets.push(...bot.hitMeshes);
    const botHits = raycaster.intersectObjects(targets, false);
    const wallHits = raycaster.intersectObjects(world.shootables, false);
    const botHit = botHits[0];
    const wallHit = wallHits[0];
    let point;
    let result = { hit: null, bot: null, part: null, point: null, distance: 0 };
    if (botHit && (!wallHit || botHit.distance < wallHit.distance)) {
      point = botHit.point;
      const bot = botHit.object.userData.bot;
      const part = botHit.object.userData.part;
      result = { hit: 'bot', bot, part, point, distance: botHit.distance };
      if (damageFn) damageFn(bot, part, botHit.distance);
    } else if (wallHit) {
      point = wallHit.point;
      result = { hit: 'wall', bot: null, part: null, point, distance: wallHit.distance };
      burst(point, 5, 2.5, PALETTE.muted);
    } else {
      point = hitPoint.copy(origin).addScaledVector(direction, 90);
      result = { hit: null, bot: null, part: null, point, distance: 90 };
    }
    spawnTracer(from, point);
    return result;
  }

  function throwGrenade(from, dir, speed) {
    const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    grenades.push({
      mesh,
      velocity: new THREE.Vector3(dir.x * speed, dir.y * speed + 2.2, dir.z * speed),
      fuse: 1.7,
      bounced: 0,
    });
  }

  function explode(grenade, onExplode) {
    const point = grenade.mesh.position.clone();
    scene.remove(grenade.mesh);
    grenadeLight.position.copy(point);
    grenadeLight.intensity = 260;
    burst(point, 40, 9, PALETTE.accent);
    burst(point, 16, 5, PALETTE.danger);
    if (onExplode) onExplode(point);
  }

  function step(dt, onExplode, colliders) {
    for (const tracer of tracers) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        if (tracer.life <= 0) tracer.mesh.visible = false;
      }
    }
    for (const p of particles) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.velocity.y -= 12 * dt;
        p.mesh.rotation.x += dt * 9;
        if (p.life <= 0 || p.mesh.position.y < 0.02) p.mesh.visible = false;
      }
    }
    grenadeLight.intensity = Math.max(0, grenadeLight.intensity - dt * 900);
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.velocity.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      // Simple bounce: if the grenade sinks into a collider, push it back out and dampen.
      const pos = g.mesh.position;
      for (const box of colliders) {
        if (pos.x > box.min.x - 0.12 && pos.x < box.max.x + 0.12
          && pos.y > box.min.y - 0.12 && pos.y < box.max.y + 0.12
          && pos.z > box.min.z - 0.12 && pos.z < box.max.z + 0.12) {
          const dxMin = Math.min(pos.x - (box.min.x - 0.12), (box.max.x + 0.12) - pos.x);
          const dzMin = Math.min(pos.z - (box.min.z - 0.12), (box.max.z + 0.12) - pos.z);
          const dyMin = Math.min(pos.y - (box.min.y - 0.12), (box.max.y + 0.12) - pos.y);
          if (dyMin <= dxMin && dyMin <= dzMin) {
            pos.y = g.velocity.y > 0 ? box.max.y + 0.13 : box.min.y - 0.13;
            g.velocity.y *= -0.45;
          } else if (dxMin <= dzMin) {
            pos.x = g.velocity.x > 0 ? box.max.x + 0.13 : box.min.x - 0.13;
            g.velocity.x *= -0.45;
          } else {
            pos.z = g.velocity.z > 0 ? box.max.z + 0.13 : box.min.z - 0.13;
            g.velocity.z *= -0.45;
          }
          g.velocity.multiplyScalar(0.7);
          g.bounced += 1;
        }
      }
      if (pos.y < 0.12) {
        pos.y = 0.12;
        g.velocity.y = Math.abs(g.velocity.y) * 0.45;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      if (g.fuse <= 0 || g.bounced > 4) {
        explode(g, onExplode);
        grenades.splice(i, 1);
      }
    }
  }

  return {
    shoot,
    throwGrenade,
    burst,
    step,
    clear() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
      for (const t of tracers) { t.mesh.visible = false; t.life = 0; }
      for (const p of particles) { p.mesh.visible = false; p.life = 0; }
    },
  };
}
