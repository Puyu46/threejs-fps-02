// AABB movement shared by the player and the bots: move one axis at a time against
// the world's colliders, so a wall never swallows a body and sliding works.
import * as THREE from 'three';

const probe = new THREE.Box3();

function overlaps(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// position and velocity are THREE.Vector3, mutated in place. Returns the collider the
// body is standing on, or null. Feet at position.y; crown at position.y + height.
export function moveBody(colliders, position, velocity, dt, radius, height, gravity) {
  velocity.y -= gravity * dt;
  const nextX = position.x + velocity.x * dt;
  if (!overlaps(colliders, nextX, position.y, position.z, radius, height, 0.04)) {
    position.x = nextX;
  } else {
    velocity.x = 0;
  }
  const nextZ = position.z + velocity.z * dt;
  if (!overlaps(colliders, position.x, position.y, nextZ, radius, height, 0.04)) {
    position.z = nextZ;
  } else {
    velocity.z = 0;
  }
  position.y += velocity.y * dt;
  let ground = null;
  const hit = overlaps(colliders, position.x, position.y, position.z, radius, height, 0);
  if (hit && velocity.y <= 0) {
    position.y = hit.max.y;
    velocity.y = 0;
    ground = hit;
  } else if (hit) {
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    ground = true;
  }
  return ground;
}

export function groundSpeed(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}
