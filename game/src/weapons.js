// Weapons: the catalogue, the view models and the firing cycle. Damage, spread and
// recoil live here; main.js owns the ray and combat.js owns what a hit does.
// Spread grows with movement speed, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', slot: 1, price: 2700,
    damage: 34, headMul: 2.9, legMul: 0.75, pellets: 1,
    mag: 30, reserve: 90, fireGap: 0.096, auto: true, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, range: 90,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', slot: 1, price: 1500,
    damage: 24, headMul: 2.6, legMul: 0.75, pellets: 1,
    mag: 32, reserve: 96, fireGap: 0.07, auto: true, reloadTime: 1.7,
    spreadStill: 0.006, spreadMove: 0.03, kick: 0.006, range: 55,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', slot: 1, price: 1100,
    damage: 9, headMul: 2.2, legMul: 0.7, pellets: 8,
    mag: 6, reserve: 24, fireGap: 0.85, auto: false, reloadTime: 2.6,
    spreadStill: 0.02, spreadMove: 0.05, kick: 0.022, range: 28,
  },
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 2, price: 0,
    damage: 30, headMul: 2.6, legMul: 0.8, pellets: 1,
    mag: 12, reserve: 48, fireGap: 0.18, auto: false, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, kick: 0.006, range: 50,
  },
};

export const GRENADE = { id: 'grenade', name: 'Spark Frag', slot: 3, price: 300, max: 2 };

const MUZZLE_TIME = 0.06;

function buildViewModel(kind) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.05 });
  const model = new THREE.Group();
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (kind === 'rifle') {
    part(0.09, 0.1, 0.42, 0, 0, 0, metal);
    part(0.045, 0.045, 0.4, 0, 0.025, -0.38, dark);
    part(0.075, 0.08, 0.22, 0, -0.02, 0.3, dark);
    part(0.05, 0.14, 0.06, 0, -0.11, 0.05, grip);
    part(0.06, 0.05, 0.1, 0, 0.07, -0.05, dark);
  } else if (kind === 'smg') {
    part(0.08, 0.09, 0.34, 0, 0, 0, metal);
    part(0.04, 0.04, 0.3, 0, 0.02, -0.3, dark);
    part(0.04, 0.16, 0.05, 0, -0.11, -0.05, grip);
    part(0.05, 0.05, 0.08, 0, 0.06, 0.02, dark);
  } else if (kind === 'shotgun') {
    part(0.1, 0.11, 0.5, 0, 0, 0, dark);
    part(0.07, 0.07, 0.42, 0, 0.03, -0.42, metal);
    part(0.06, 0.06, 0.3, 0, -0.05, -0.1, grip);
    part(0.08, 0.09, 0.2, 0, -0.02, 0.32, dark);
  } else if (kind === 'pistol') {
    part(0.06, 0.09, 0.2, 0, 0, -0.02, metal);
    part(0.05, 0.13, 0.07, 0, -0.1, 0.05, grip);
    part(0.04, 0.03, 0.06, 0, 0.06, -0.1, dark);
  } else {
    // grenade: a small ribbed sphere in the hand
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), grip);
    model.add(ball);
    part(0.02, 0.05, 0.02, 0.05, 0.06, 0, metal);
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const id of ['rifle', 'smg', 'shotgun', 'pistol', 'grenade']) {
    models[id] = buildViewModel(id);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) {
    ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  }
  const state = {
    current: 'pistol',
    owned: { pistol: true },
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    reloading: null,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.reloading.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const d = state.reloading;
        const slot = ammo[d.id];
        const need = d.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
        state.reloading = null;
      }
    }
  }

  function select(id) {
    if (!state.owned[id] && id !== 'grenade') return false;
    if (id === 'grenade' && state.grenades <= 0) return false;
    if (state.reloadLeft > 0) return false;
    models[state.current].visible = false;
    state.current = id;
    models[id].visible = true;
    state.cooldown = Math.max(state.cooldown, 0.12);
    return true;
  }

  return {
    state,
    def,
    step,
    select,
    ammoFor(id) {
      return ammo[id];
    },
    currentAmmo() {
      return state.current === 'grenade' ? { mag: state.grenades, reserve: 0 } : ammo[state.current];
    },
    ready() {
      if (state.current === 'grenade') return state.grenades > 0 && state.cooldown === 0;
      const d = def();
      return ammo[d.id].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      const slot = ammo[state.current];
      if (!slot || slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const slot = ammo[d.id];
      if (state.reloadLeft > 0 || slot.mag === d.mag || slot.reserve === 0) return;
      state.reloadLeft = d.reloadTime;
      state.reloading = d;
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.4);
      return d.spreadStill + moving * d.spreadMove;
    },
    buy(id) {
      const d = WEAPONS[id];
      if (!d || state.owned[id]) return false;
      state.owned[id] = true;
      ammo[id] = { mag: d.mag, reserve: d.reserve };
      return true;
    },
    buyGrenade() {
      if (state.grenades >= GRENADE.max) return false;
      state.grenades += 1;
      return true;
    },
    buyArmor() {
      return true; // the caller sets the price and the armour value
    },
    refillAmmo() {
      for (const d of Object.values(WEAPONS)) {
        if (state.owned[d.id]) ammo[d.id] = { mag: d.mag, reserve: d.reserve };
      }
      state.grenades = Math.min(state.grenades, GRENADE.max);
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloading = null;
      state.flash = 0;
      state.kick = 0;
    },
    resetToPistol() {
      state.owned = { pistol: true };
      state.grenades = 0;
      for (const d of Object.values(WEAPONS)) ammo[d.id] = { mag: d.mag, reserve: d.reserve };
      select('pistol');
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloading = null;
    },
  };
}
