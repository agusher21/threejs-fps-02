// Bots: 5v5 opponents and teammates with roles, waypoint routes, hold angles,
// sight and hearing, bursts of fire, planting and defusing. One brain per bot,
// driven by sim.js once per fixed step; perception runs on a staggered tick so
// nine bots never raycast on the same frame.
import * as THREE from 'three';
import { WAYPOINTS } from './world.js';
import { slideMove } from './player.js';
import { WEAPONS, createWeaponState } from './weapons.js';
import { PALETTE } from './palette.js';

export const BOT_NAMES = ['Budi', 'Sari', 'Agus', 'Dewi', 'Joko', 'Rina', 'Eko', 'Maya', 'Tono'];

const EYE = 1.5;
const HEIGHT = 1.72;
const SEE_RANGE = 46;
const SEE_HALF_FOV = 1.15;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
raycaster.far = 60;

function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function bfsPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const next of WAYPOINTS[cur][2]) {
      if (prev[next] === -1) {
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let n = to;
          while (n !== from) {
            n = prev[n];
            path.unshift(n);
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [to];
}

function losClear(world, from, to) {
  _dir.subVectors(to, from);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.normalize();
  raycaster.set(from, _dir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(world.shootables, false);
  return hits.length === 0;
}

export function createBot(scene, team, name, index) {
  const color = team === 'atk' ? PALETTE.awningAmber : PALETTE.awningTeal;
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c2f36'), roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), torsoMat);
  torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinMat);
  head.position.y = 1.62;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.36), darkMat);
  cap.position.y = 1.76;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.17), darkMat);
  legL.position.set(-0.13, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
  gun.position.set(0.2, 1.15, -0.3);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lantern), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.2, 1.15, -0.72);
  group.add(torso, head, cap, legL, legR, gun, flash);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
    }
  });
  scene.add(group);

  const agent = {
    name, team, isBot: true, index,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: 0, pitch: 0, eye: EYE, height: HEIGHT,
    hp: 100, armor: 0, alive: true, crouching: false,
    weapon: createWeaponState(WEAPONS.paku),
    money: 800, grenades: 0, hasKit: false, hasCharge: false,
    role: 'holder', mode: 'route', path: [], pathIdx: 0, dest: 0,
    holdNode: 0, scanDir: 0, scanT: 0,
    target: null, lastSeenPos: new THREE.Vector3(), lastSeenT: -99,
    reactAt: 0, burstLeft: 0, nextShotAt: 0, perceiveAt: index * 0.17,
    heardPos: null, heardT: -99, alertT: -99,
    planting: false, plantProgress: 0, defusing: false, defuseProgress: 0,
    fall: 0, group, torso, head, flash, legL, legR,
    kills: 0, deaths: 0,
  };
  torso.userData.agent = agent;
  torso.userData.part = 'torso';
  head.userData.agent = agent;
  head.userData.part = 'head';
  return agent;
}

export function botReset(bot, x, z, yaw, role, team) {
  bot.position.set(x, 0, z);
  bot.velocity.set(0, 0, 0);
  bot.yaw = yaw;
  bot.pitch = 0;
  bot.hp = 100;
  bot.alive = true;
  bot.fall = 0;
  bot.role = role;
  bot.team = team;
  bot.target = null;
  bot.planting = false;
  bot.defusing = false;
  bot.plantProgress = 0;
  bot.defuseProgress = 0;
  bot.hasCharge = false;
  bot.heardPos = null;
  bot.mode = 'route';
  bot.path = [];
  bot.pathIdx = 0;
  bot.dest = 0;
  bot.scanT = 0;
  bot.lastSeenT = -99;
  bot.heardT = -99;
  bot.alertT = -99;
  bot.reactAt = 0;
  bot.burstLeft = 0;
  bot.nextShotAt = 0;
  bot.perceiveAt = bot.index * 0.17;
  bot.group.rotation.set(0, yaw, 0);
  bot.group.position.set(x, 0, z);
  bot.group.visible = true;
  bot.torso.rotation.set(0, 0, 0);
  bot.torso.position.y = 1.08;
  bot.head.position.y = 1.62;
  bot.flash.material.opacity = 0;
}

export function botBuy(bot, rng) {
  const w = bot.money >= 2000 && rng() < 0.8 ? 'garuda'
    : bot.money >= 3500 && rng() < 0.25 ? 'elang'
    : bot.money >= 900 ? 'siul' : 'paku';
  if (WEAPONS[w].price > 0 && bot.money >= WEAPONS[w].price) {
    bot.money -= WEAPONS[w].price;
    bot.weapon = createWeaponState(WEAPONS[w]);
  } else {
    bot.weapon = createWeaponState(WEAPONS.paku);
  }
  if (bot.money >= ARMOR_PRICE) {
    bot.money -= ARMOR_PRICE;
    bot.armor = 50;
  } else bot.armor = 0;
  bot.hasKit = bot.team === 'def' && bot.money >= 400 && rng() < 0.5;
  if (bot.hasKit) bot.money -= 400;
}

const ARMOR_PRICE = 650;

function setPath(bot, dest) {
  // Note: deliberately leaves bot.mode alone — callers set 'toSite',
  // 'toCharge', 'pickup' or 'hunt' before/after calling this.
  bot.dest = dest;
  bot.path = bfsPath(nearestNode(bot.position.x, bot.position.z), dest);
  bot.pathIdx = 0;
}

function moveToward(bot, dt, world, tx, tz, speed) {
  const dx = tx - bot.position.x;
  const dz = tz - bot.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const want = Math.atan2(-dx, -dz);
  let dyaw = want - bot.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  bot.yaw += Math.max(-dt * 6, Math.min(dt * 6, dyaw));
  bot.velocity.x = (dx / dist) * speed;
  bot.velocity.z = (dz / dist) * speed;
  bot.velocity.y -= 20 * dt;
  bot.position.y += bot.velocity.y * dt;
  if (bot.position.y < 0) {
    bot.position.y = 0;
    bot.velocity.y = 0;
  }
  slideMove(world.colliders, bot, dt, bot.height);
  bot.velocity.x = 0;
  bot.velocity.z = 0;
  return dist < 0.7;
}

function canSee(bot, enemy, world, time) {
  const dx = enemy.position.x - bot.position.x;
  const dz = enemy.position.z - bot.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > SEE_RANGE || !enemy.alive) return false;
  const ang = Math.atan2(-dx, -dz);
  let diff = ang - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const alert = time - bot.alertT < 1.5;
  if (!alert && Math.abs(diff) > SEE_HALF_FOV) return false;
  _v1.set(bot.position.x, bot.position.y + bot.eye, bot.position.z);
  _v2.set(enemy.position.x, enemy.position.y + enemy.eye * 0.9, enemy.position.z);
  return losClear(world, _v1, _v2);
}

function perceive(bot, ctx) {
  const { time, world, agents } = ctx;
  let best = null;
  let bestD = Infinity;
  for (const enemy of agents) {
    if (enemy.team === bot.team || !enemy.alive) continue;
    const d = Math.hypot(enemy.position.x - bot.position.x, enemy.position.z - bot.position.z);
    if (d < bestD && canSee(bot, enemy, world, time)) {
      best = enemy;
      bestD = d;
    }
  }
  if (best) {
    if (bot.target !== best) {
      bot.reactAt = time + 0.55 + ctx.rng() * 0.6;
      bot.burstLeft = 0;
      if (ctx.rng() < 0.4) ctx.callout(`${bot.name}: kontak di ${ctx.areaName(best.position.x, best.position.z)}!`);
    }
    bot.target = best;
    bot.lastSeenPos.copy(best.position);
    bot.lastSeenT = time;
    bot.alertT = time;
  } else if (bot.target && time - bot.lastSeenT > 2) {
    bot.target = null;
  }
  if (bot.heardPos && time - bot.heardT < 1.2) {
    const d = Math.hypot(bot.heardPos.x - bot.position.x, bot.heardPos.z - bot.position.z);
    if (d < 22) bot.alertT = time;
  }
}

function botShoot(bot, ctx) {
  const { time, rng } = ctx;
  const target = bot.target;
  if (!target || time < bot.reactAt) return;
  const def = bot.weapon.def;
  if (bot.burstLeft <= 0) {
    if (time < bot.nextShotAt) return;
    bot.burstLeft = 3 + Math.floor(rng() * 3);
    bot.nextShotAt = time + 0.85 + rng() * 0.5;
  }
  if (time < bot.nextShotAt - 0.55) return;
  bot.nextShotAt = time + def.fireGap + 0.03;
  bot.burstLeft -= 1;
  const dist = Math.hypot(target.position.x - bot.position.x, target.position.z - bot.position.z);
  const targetSpeed = Math.hypot(target.velocity.x, target.velocity.z);
  const moving = Math.hypot(bot.velocity.x, bot.velocity.z) > 0.5;
  let p = 0.45 - dist * 0.011 - targetSpeed * 0.03 - (moving ? 0.12 : 0) - (target.crouching ? 0.06 : 0);
  p = Math.max(0.06, Math.min(0.55, p));
  _v1.set(bot.position.x, bot.position.y + bot.eye, bot.position.z);
  _v2.set(target.position.x, target.position.y + target.eye * 0.9, target.position.z);
  const blocked = !losClear(ctx.world, _v1, _v2);
  const hit = !blocked && rng() < p;
  const part = hit && rng() < 0.1 ? 'head' : 'torso';
  const end = _v2.clone();
  if (!hit) {
    end.x += (rng() * 2 - 1) * 1.6;
    end.y += (rng() * 2 - 1) * 1.2;
    end.z += (rng() * 2 - 1) * 1.6;
  }
  ctx.shotFired(bot, end, def.kind, hit);
  if (hit) ctx.damage(target, def.damage * (part === 'head' ? def.headMult : 1), part, bot);
  bot.flash.material.opacity = 0.9;
  bot.flashT = time;
}

// Shared arrival check for toSite / toCharge / pickup, used both when a
// route step completes and when a route is already exhausted.
function checkArrival(bot, ctx) {
  const { charge } = ctx;
  if (bot.mode === 'toSite') {
    const site = ctx.pickSite(bot);
    const s = site === 'A' ? { x: -22, z: -8 } : { x: 22, z: -8 };
    if (Math.hypot(s.x - bot.position.x, s.z - bot.position.z) < 2.6) {
      bot.mode = 'plant';
      bot.plantProgress = 0;
      return true;
    }
  }
  if (bot.mode === 'toCharge') {
    if (Math.hypot(charge.x - bot.position.x, charge.z - bot.position.z) < 2.4) {
      bot.mode = 'defuse';
      bot.defuseProgress = 0;
      return true;
    }
  }
  if (bot.mode === 'pickup') {
    if (Math.hypot(charge.x - bot.position.x, charge.z - bot.position.z) < 1.6) {
      bot.hasCharge = true;
      charge.state = 'carried';
      charge.carrier = bot;
      ctx.callout(`${bot.name} mengambil Kembang Api.`);
      bot.mode = 'toSite';
      setPath(bot, ctx.pickSite(bot) === 'A' ? 12 : 13);
      return true;
    }
  }
  return false;
}

export function botStep(bot, dt, ctx) {
  const { time, world, charge, rng } = ctx;
  if (!bot.alive) {
    bot.fall = Math.min(1, bot.fall + dt / 0.4);
    bot.group.rotation.x = -bot.fall * 1.45;
    bot.group.position.y = -bot.fall * 0.08;
    return;
  }
  if (bot.flashT !== undefined && time - bot.flashT > 0.06) bot.flash.material.opacity = 0;

  if (time >= bot.perceiveAt) {
    bot.perceiveAt = time + 0.15 + bot.index * 0.02;
    perceive(bot, ctx);
  }

  const isAtk = bot.team === 'atk';
  // Objective overrides: plant, defuse, pick up a dropped charge.
  if (isAtk && charge.state === 'planted') {
    // Charge is down: hunt the remaining defenders.
    if (bot.mode !== 'engage' && bot.mode !== 'hunt') {
      bot.mode = 'hunt';
      let nearest = null;
      let nearestD = Infinity;
      for (const a of ctx.agents) {
        if (a.team === bot.team || !a.alive) continue;
        const d = Math.hypot(a.position.x - bot.position.x, a.position.z - bot.position.z);
        if (d < nearestD) {
          nearest = a;
          nearestD = d;
        }
      }
      if (nearest) setPath(bot, nearestNode(nearest.position.x, nearest.position.z));
    }
  }
  if (isAtk && bot.hasCharge && charge.state === 'carried') {
    const site = ctx.pickSite(bot);
    if (bot.mode !== 'plant' && bot.mode !== 'toSite') {
      bot.mode = 'toSite';
      setPath(bot, site === 'A' ? 12 : 13);
    }
  }
  if (!isAtk && charge.state === 'planted') {
    if (bot.mode !== 'defuse' && bot.mode !== 'toCharge') {
      bot.mode = 'toCharge';
      setPath(bot, nearestNode(charge.x, charge.z));
    }
  }
  if (isAtk && charge.state === 'dropped' && !charge.carrier) {
    if (bot.mode !== 'pickup') {
      bot.mode = 'pickup';
      setPath(bot, nearestNode(charge.x, charge.z));
    }
  }

  if (bot.target) {
    bot.mode = bot.mode === 'plant' || bot.mode === 'defuse' ? bot.mode : 'engage';
  }

  switch (bot.mode) {
    case 'route':
    case 'toSite':
    case 'toCharge':
    case 'pickup':
    case 'hunt': {
      let node = bot.path[bot.pathIdx];
      if (node === undefined) {
        if (bot.path.length === 0) {
          // Round start: no route built yet — build one toward the dest.
          setPath(bot, bot.dest);
          node = bot.path[bot.pathIdx];
        } else {
          // Arrived at the end of the route.
          checkArrival(bot, ctx);
          if (bot.mode === 'route' || bot.mode === 'hunt') {
            if (bot.role === 'roamer') {
              setPath(bot, 8 + Math.floor(rng() * 8));
            } else {
              bot.mode = 'hold';
            }
          }
          break;
        }
      }
      const [nx, nz] = WAYPOINTS[node];
      const speed = bot.role === 'rusher' ? 5.0 : 4.3;
      if (moveToward(bot, dt, world, nx, nz, speed)) bot.pathIdx += 1;
      checkArrival(bot, ctx);
      break;
    }
    case 'hold': {
      bot.scanT += dt;
      bot.yaw = bot.scanDir + Math.sin(bot.scanT * 0.5) * 0.9;
      bot.velocity.set(0, 0, 0);
      break;
    }
    case 'plant': {
      if (charge.state !== 'carried') {
        bot.mode = 'hold';
        bot.planting = false;
        break;
      }
      bot.planting = true;
      bot.plantProgress += dt;
      if (bot.plantProgress >= 3.5) {
        bot.planting = false;
        bot.hasCharge = false;
        bot.mode = 'hold';
        ctx.plantDone(bot);
      }
      break;
    }
    case 'defuse': {
      if (charge.state !== 'planted') {
        bot.mode = 'route';
        bot.defusing = false;
        break;
      }
      const nearEnemy = ctx.nearestEnemyDist(bot) < 14;
      const fuseLeft = charge.fuse - (time - charge.plantedAt);
      if (!nearEnemy || fuseLeft < 8) {
        bot.defusing = true;
        bot.defuseProgress += dt * (bot.hasKit ? 2 : 1);
        if (bot.defuseProgress >= 5) {
          bot.defusing = false;
          bot.mode = 'hold';
          ctx.defuseDone(bot);
        }
      } else {
        bot.defusing = false;
        bot.mode = 'engage';
      }
      break;
    }
    case 'engage': {
      if (!bot.target) {
        bot.mode = bot.role === 'holder' ? 'hold' : 'route';
        if (bot.mode === 'route' && bot.pathIdx >= bot.path.length) setPath(bot, bot.dest);
        break;
      }
      const t = bot.target;
      const dx = t.position.x - bot.position.x;
      const dz = t.position.z - bot.position.z;
      const want = Math.atan2(-dx, -dz);
      let dyaw = want - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += Math.max(-dt * 7, Math.min(dt * 7, dyaw));
      // Small strafe while firing so bots are not turrets.
      const strafe = Math.sin(time * 1.3 + bot.index * 2) * 1.2;
      bot.velocity.x = Math.cos(bot.yaw) * strafe;
      bot.velocity.z = -Math.sin(bot.yaw) * strafe;
      bot.velocity.y -= 20 * dt;
      slideMove(world.colliders, bot, dt, bot.height);
      botShoot(bot, ctx);
      break;
    }
    default:
      break;
  }

  // Walk cycle on the legs, group follows the body.
  const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
  if (speed > 0.2) {
    const swing = Math.sin(time * 11 + bot.index) * 0.45;
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
  } else {
    bot.legL.rotation.x = 0;
    bot.legR.rotation.x = 0;
  }
  bot.group.position.set(bot.position.x, bot.position.y, bot.position.z);
  bot.group.rotation.y = bot.yaw;
}
