// Ember Yard: an original dusk industrial yard, 48 x 38 m. Three lanes run from the
// Vanguard spawn in the south to the two bomb sites: A Long along the east wall, Mid
// through the warehouse doors, and B Short along the west wall. Crates, containers and
// a gantry platform make the corners and sightlines; nothing here copies a real map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { center: new THREE.Vector3(16, 0, -11), radius: 5.5, label: 'A' },
  B: { center: new THREE.Vector3(-16, 0, 11), radius: 5.5, label: 'B' },
};

export const PLAYER_SPAWN = new THREE.Vector3(0, 0, 15.5);

// Bot spawn points: two hold A, one holds B, one roams Mid.
export const BOT_SPAWNS = [
  { x: 14, z: -13, route: 'A' },
  { x: 19, z: -6, route: 'A' },
  { x: -15, z: 9, route: 'B' },
  { x: -2, z: -6, route: 'MID' },
];

// Waypoint loops the bots patrol when nothing is happening.
export const ROUTES = {
  A: [
    [16, -11], [19, -13], [19, -5], [12, -6], [10, -12],
  ],
  B: [
    [-16, 11], [-19, 6], [-12, 6], [-13, 13], [-19, 13],
  ],
  MID: [
    [-2, -6], [2, -8], [6, -2], [0, 2], [-6, -2],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.5 : 0.92,
      metalness: name === 'rust' || name === 'teal' ? 0.25 : 0.03,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls (open to the dusk sky).
  box(48.4, 0.4, 38.4, 0, -0.2, 0, 'ground');
  box(0.4, 5.0, 38.4, -24.2, 2.5, 0, 'surface');
  box(0.4, 5.0, 38.4, 24.2, 2.5, 0, 'surface');
  box(48.4, 5.0, 0.4, 0, 2.5, -19.2, 'surface');
  box(48.4, 5.0, 0.4, 0, 2.5, 19.2, 'surface');

  // The warehouse in the middle: two blocks with a 3 m doorway between them (Mid).
  box(9.5, 4.4, 9, -6.2, 2.2, -2, 'surface');
  box(9.5, 4.4, 9, 6.2, 2.2, -2, 'surface');
  box(3.4, 1.0, 9.4, 0, 4.9, -2, 'hairline'); // lintel over the Mid doorway

  // Site plates: thin coloured slabs that mark A and B on the ground.
  box(7, 0.08, 7, SITES.A.center.x, 0.04, SITES.A.center.z, 'accent', false).material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 });
  box(7, 0.08, 7, SITES.B.center.x, 0.04, SITES.B.center.z, 'teal', false).material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6, emissive: new THREE.Color(PALETTE.teal), emissiveIntensity: 0.25 });

  // A-site gantry platform (walkable) with a support pillar.
  box(6, 0.5, 3, 19, 0.25, -14, 'hairline');
  box(0.5, 2.6, 0.5, 21.4, 1.3, -15.2, 'hairline');
  box(0.5, 2.6, 0.5, 16.6, 1.3, -15.2, 'hairline');

  // Shipping containers as cover: rust on the east lane, teal on the west.
  box(6, 2.6, 2.4, 14, 1.3, 3, 'rust');
  box(6, 2.6, 2.4, 14, 3.9, 3, 'rust'); // stacked second container
  box(2.4, 2.6, 6, -14, 1.3, -4, 'teal');
  box(4, 2.6, 2.4, -8, 1.3, 13, 'rust');
  box(4, 2.6, 2.4, 8, 1.3, -13, 'teal');
  box(2.4, 2.6, 5, -20, 1.3, -13, 'rust');

  // Crates: low cover to crouch behind, and a few tall stacks.
  box(1.4, 1.4, 1.4, -6, 0.7, 6, 'hairline');
  box(1.4, 1.4, 1.4, -4.6, 0.7, 6, 'hairline');
  box(1.4, 1.4, 1.4, -5.3, 2.1, 6, 'hairline');
  box(1.2, 1.2, 1.2, 6, 0.6, 8, 'hairline');
  box(1.2, 1.2, 1.2, 7.4, 0.6, 8, 'hairline');
  box(1.4, 1.4, 1.4, 10, 0.7, -7, 'hairline');
  box(1.4, 1.4, 1.4, -10, 0.7, -10, 'hairline');
  box(1.2, 0.9, 1.2, 2, 0.45, 12, 'hairline');
  box(1.2, 0.9, 1.2, -2, 0.45, 12, 'hairline');

  // Barrels near the sites.
  cylinder(0.55, 0.55, 1.1, 12, 0.55, -15, 'rust');
  cylinder(0.55, 0.55, 1.1, 13.2, 0.55, -14.2, 'rust');
  cylinder(0.55, 0.55, 1.1, -19, 0.55, 14, 'teal');
  cylinder(0.55, 0.55, 1.1, -11, 0.55, 15, 'teal');

  // Lamp posts: emissive heads, no light of their own (the two site lights do the work).
  for (const [x, z] of [[-10, 0], [10, 0], [-8, 12], [8, 12], [0, -14]]) {
    box(0.25, 4.2, 0.25, x, 2.1, z, 'hairline');
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6 }),
    );
    head.position.set(x, 4.3, z);
    group.add(head);
  }

  // Light: a low warm sun from the west, a cool dusk fill, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#7d8ea3'), new THREE.Color('#2a241e'), 1.15);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.6);
  sun.position.set(-26, 13, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6b7d'), 0.7);
  fill.position.set(20, 10, -14);
  scene.add(fill);

  const siteA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 22, 16, 1.8);
  siteA.position.set(SITES.A.center.x, 3.4, SITES.A.center.z);
  scene.add(siteA);
  const siteB = new THREE.PointLight(new THREE.Color(PALETTE.teal), 22, 16, 1.8);
  siteB.position.set(SITES.B.center.x, 3.4, SITES.B.center.z);
  scene.add(siteB);

  return { colliders, shootables, group };
}
