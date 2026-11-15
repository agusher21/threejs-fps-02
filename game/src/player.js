// Movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows a body.
// slideMove is shared with the bots, so the same collision rules govern everyone.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

const probe = new THREE.Box3();

export function overlapsAt(colliders, x, y, z, height, lift) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
  return null;
}

// Move a body (position + velocity Vector3s, height) one step; returns onGround.
export function slideMove(colliders, body, dt, height) {
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlapsAt(colliders, nextX, body.position.y, body.position.z, height, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlapsAt(colliders, body.position.x, body.position.y, nextZ, height, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;
  body.position.y += body.velocity.y * dt;
  let onGround = false;
  const hit = overlapsAt(colliders, body.position.x, body.position.y, body.position.z, height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
  return onGround;
}

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 17),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, speedScale = 1) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlapsAt(colliders, player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = (player.crouching ? CROUCH_SPEED : WALK_SPEED) * speedScale;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }
    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.onGround = slideMove(colliders, player, dt, player.height);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    reset(x, z, yaw) {
      player.position.set(x, 0, z);
      player.velocity.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = 0;
      player.crouching = false;
      player.height = STAND_HEIGHT;
      player.eye = STAND_EYE;
    },
  };
}
