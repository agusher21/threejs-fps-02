// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=menu|buy|play|plant with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady. ?autoplay=1 plays a bot-driven round unattended and
// writes its state into #debug for headless verification.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import {
  WEAPONS, createViewModel, createWeaponState, weaponStep, weaponReady,
  weaponFire, weaponReload, weaponSpread, createGrenade,
} from './weapons.js';
import { createSim } from './sim.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const autoplay = params.get('autoplay') === '1';
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

// Tracer pool: preallocated lines, reused, never allocated in the hot loop.
const tracers = [];
for (let i = 0; i < 24; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIdx = 0;
function spawnTracer(from, to) {
  const t = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % tracers.length;
  const pos = t.line.geometry.attributes.position.array;
  pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
  pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.material.opacity = 0.85;
  t.life = 0.09;
}

// One reusable explosion flash.
const boom = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, depthWrite: false }),
);
scene.add(boom);
let boomLife = 0;
let shake = 0;

const sim = createSim(world, player, audio, {
  scene,
  autoplay,
  onShot(from, to, kind, isPlayer) {
    spawnTracer(from, to);
    const d = from.distanceTo(camera.position);
    if (isPlayer) audio.shot(kind);
    else if (d < 55) audio.distantShot();
  },
  onExplosion(pos) {
    boom.position.copy(pos);
    boomLife = 0.6;
    const d = pos.distanceTo(camera.position);
    if (d < 25) shake = Math.max(shake, 0.35 * (1 - d / 25));
  },
  onPlayerHurt(attacker) {
    if (!attacker) return;
    const dx = attacker.position.x - player.state.position.x;
    const dz = attacker.position.z - player.state.position.z;
    const bearing = Math.atan2(dx, dz);
    hud.damageFlash(bearing - player.state.yaw + Math.PI);
  },
  onPlayerHit(victim) {
    hud.hitMarker(victim.hp <= 0);
  },
  onWeaponChange() {
    rebuildViewModel();
  },
}, seed);

const hud = createHud({
  onBuy(code) {
    sim.buyItem(code);
  },
  onStartRound() {
    sim.beginRound();
    if (!autoplay && !shot) input.requestLock();
  },
});
let view = createViewModel(camera, sim.playerAgent.weapon.def.kind);
function rebuildViewModel() {
  camera.remove(view.model, view.flash, view.flashLight, view.vmLight);
  view = createViewModel(camera, sim.playerAgent.weapon.def.kind);
}

const body = player.state;
const agent = sim.playerAgent;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let dryAt = 0;
const autoKeys = new Set();

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  const phase = sim.state.phase;
  if (phase === 'menu') sim.toBuy();
  else if (phase === 'matchEnd') {
    sim.startMatch();
    sim.toBuy();
  } else if (phase === 'round' || phase === 'buy') {
    // Resume from pause: buy phase stays mouse-free, round re-locks.
    if (phase === 'round' && !autoplay) input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot || autoplay) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (sim.state.phase === 'round') {
    hud.showOverlay('paused', 'Pasar Senja', 'Jeda. Klik untuk lanjut.', 'Lanjut main');
  }
}

function syncCamera() {
  let px;
  let py;
  let pz;
  let yaw;
  let pitch;
  if (!agent.alive && sim.state.spectate) {
    const mate = sim.state.spectate;
    px = mate.position.x;
    py = mate.position.y + mate.eye;
    pz = mate.position.z;
    yaw = mate.yaw;
    pitch = 0;
  } else {
    px = body.position.x;
    py = body.position.y + body.eye;
    pz = body.position.z;
    yaw = body.yaw;
    pitch = body.pitch;
  }
  if (shake > 0) {
    px += (Math.random() - 0.5) * shake * 0.3;
    py += (Math.random() - 0.5) * shake * 0.3;
  }
  camera.position.set(px, py, pz);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const targetFov = input.state.aiming && agent.alive ? 55 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
}

function losClear(from, to) {
  _dir.subVectors(to, from);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.normalize();
  raycaster.set(from, _dir);
  raycaster.far = dist;
  return raycaster.intersectObjects(world.shootables, false).length === 0;
}

function shoot(spread) {
  const w = agent.weapon;
  if (!weaponFire(w)) {
    if (sim.state.time - dryAt > 0.4) {
      dryAt = sim.state.time;
      audio.dryClick();
      if (weaponReload(w)) audio.reload();
    }
    return false;
  }
  camera.getWorldDirection(_dir);
  _dir.x += (Math.random() * 2 - 1) * spread;
  _dir.y += (Math.random() * 2 - 1) * spread;
  _dir.z += (Math.random() * 2 - 1) * spread;
  _dir.normalize();
  _from.copy(camera.position);
  scene.updateMatrixWorld(true);
  raycaster.set(_from, _dir);
  raycaster.far = w.def.range;
  const targets = [];
  for (const bot of sim.bots) {
    if (bot.alive && bot.group.visible) targets.push(bot.torso, bot.head);
  }
  const hits = raycaster.intersectObjects(world.shootables.concat(targets), false);
  const hit = hits[0];
  const end = hit ? hit.point : _from.clone().addScaledVector(_dir, w.def.range);
  spawnTracer(_from, end);
  audio.shot(w.def.kind);
  sim.state.pings.push({ x: body.position.x, z: body.position.z, t: sim.state.time });
  if (hit && hit.object.userData.agent) {
    const victim = hit.object.userData.agent;
    const part = hit.object.userData.part;
    sim.damage(victim, w.def.damage * (part === 'head' ? w.def.headMult : 1), part, agent);
  }
  player.recoil(w.def.recoil * (0.9 + Math.random() * 0.2), (Math.random() * 2 - 1) * w.def.recoil * 0.3);
  return true;
}

function throwGrenade() {
  if (agent.grenades <= 0 || sim.state.phase !== 'round' || !agent.alive) return;
  agent.grenades -= 1;
  camera.getWorldDirection(_dir);
  _from.copy(camera.position);
  const g = createGrenade(scene, _from, _dir);
  g.thrower = agent;
  sim.grenades.push(g);
  audio.reload();
}

function mergedKeys() {
  const keys = new Set(input.state.keys);
  for (const k of autoKeys) keys.add(k);
  return keys;
}

// Autoplay brain: a simple bot driving the player so a round can complete
// unattended in headless Chrome. Never used in normal play.
function autoplayDrive() {
  autoKeys.clear();
  input.state.firing = false;
  input.state.aiming = false;
  input.state.keys.delete('KeyE');
  if (sim.state.phase !== 'round' || !agent.alive) return;
  const eye = _from.set(body.position.x, body.position.y + body.eye, body.position.z);
  let best = null;
  let bestD = Infinity;
  for (const e of sim.agents) {
    if (e.team === agent.team || !e.alive) continue;
    const d = Math.hypot(e.position.x - body.position.x, e.position.z - body.position.z);
    if (d > 42) continue;
    _to.set(e.position.x, e.position.y + e.eye * 0.9, e.position.z);
    if (d < bestD && losClear(eye, _to)) {
      best = e;
      bestD = d;
    }
  }
  let dest = null;
  if (agent.team === 'atk' && agent.hasCharge) {
    const a = Math.hypot(body.position.x - SITES.A.x, body.position.z - SITES.A.z);
    const b = Math.hypot(body.position.x - SITES.B.x, body.position.z - SITES.B.z);
    const s = a < b ? SITES.A : SITES.B;
    if (Math.min(a, b) < 3) input.state.keys.add('KeyE');
    else dest = s;
  } else if (agent.team === 'def' && sim.state.charge.state === 'planted') {
    const d = Math.hypot(body.position.x - sim.state.charge.x, body.position.z - sim.state.charge.z);
    if (d < 2.4) input.state.keys.add('KeyE');
    else dest = { x: sim.state.charge.x, z: sim.state.charge.z };
  } else if (best) {
    dest = { x: best.position.x, z: best.position.z };
  } else {
    dest = agent.team === 'atk' ? SITES.A : { x: 0, z: -6 };
  }
  if (best) {
    _to.set(best.position.x, best.position.y + best.eye * 0.9, best.position.z);
    aimAt(_to);
    const ang = Math.abs(body.yaw - Math.atan2(-(best.position.x - body.position.x), -(best.position.z - body.position.z)));
    if (ang < 0.06 && weaponReady(agent.weapon)) input.state.firing = true;
    if (bestD > 15) input.state.aiming = true;
  }
  if (dest) {
    const dx = dest.x - body.position.x;
    const dz = dest.z - body.position.z;
    const fwd = -Math.sin(body.yaw) * dx + -Math.cos(body.yaw) * dz;
    const str = Math.cos(body.yaw) * dx + -Math.sin(body.yaw) * dz;
    if (fwd > 0.5) autoKeys.add('KeyW');
    else if (fwd < -0.5) autoKeys.add('KeyS');
    if (str > 0.5) autoKeys.add('KeyD');
    else if (str < -0.5) autoKeys.add('KeyA');
  }
}

function step(dt) {
  const keys = mergedKeys();
  if (autoplay) autoplayDrive();
  const prevPhase = sim.state.phase;
  // Enter/B starts the round from the buy menu; lock the pointer on the
  // same user activation so mouse-look works when the round begins.
  if (prevPhase === 'buy' && (keys.has('Enter') || keys.has('KeyB')) && !shot && !autoplay) {
    input.requestLock();
  }
  if (sim.state.phase === 'round' && agent.alive) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const speedScale = input.state.aiming ? 0.55 : 1;
    player.step(dt, keys, speedScale);
    weaponStep(agent.weapon, view, dt);
    const firing = input.state.firing;
    const edge = firing && !prevFiring;
    if (firing && (agent.weapon.def.auto || edge) && weaponReady(agent.weapon)) {
      shoot(weaponSpread(agent.weapon, player.groundSpeed(), input.state.aiming));
    }
    prevFiring = firing;
    if (input.consume('KeyR') && weaponReload(agent.weapon)) audio.reload();
    if (input.consume('KeyG')) throwGrenade();
    if (input.consume('KeyQ')) sim.cycleSpectate();
  } else if (sim.state.phase === 'buy') {
    weaponStep(agent.weapon, view, dt);
  }
  sim.step(dt, input);
  const newPhase = sim.state.phase;
  if (!shot && !autoplay) {
    if (prevPhase === 'buy' && newPhase === 'round') input.requestLock();
    if (prevPhase === 'roundEnd' && newPhase === 'buy' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
  world.update(dt, sim.state.time);
  if (sim.state.phase === 'round') {
    for (const g of sim.grenades) {
      if (g.done && g.mesh.visible === false && g.mesh.parent) scene.remove(g.mesh);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
      }
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - boomLife / 0.6;
      boom.scale.setScalar(1 + k * 9);
      boom.material.opacity = Math.max(0, 0.85 * (1 - k));
    }
    shake = Math.max(0, shake - dt * 1.2);
    hud.update(sim, weaponSpread(agent.weapon, player.groundSpeed(), input.state.aiming), sim.state.time);
    if (autoplay) {
      const dbg = document.getElementById('debug');
      if (dbg) {
        dbg.textContent = JSON.stringify({
          phase: sim.state.phase, round: sim.state.round,
          wins: sim.state.wins, timer: Math.round(sim.state.timer),
          playerAlive: agent.alive, playerHp: Math.round(agent.hp),
          atkAlive: sim.agents.filter((a) => a.team === 'atk' && a.alive).length,
          defAlive: sim.agents.filter((a) => a.team === 'def' && a.alive).length,
          charge: sim.state.charge.state, matchWinner: sim.state.matchWinner,
          events: sim.state.events.slice(-8).map((e) => e.msg),
        });
      }
    }
  }
  renderer.render(scene, camera);
}

function settle(seconds) {
  const fakeInput = {
    state: { keys: new Set() },
    consume: () => false,
  };
  const steps = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < steps; i += 1) {
    sim.step(FIXED_STEP, fakeInput);
    world.update(FIXED_STEP, sim.state.time);
  }
}

function runShot(name) {
  hud.hideOverlay();
  sim.startMatch();
  if (name === 'menu') {
    body.position.set(0, 0, 16);
    body.yaw = 0;
    body.pitch = -0.05;
    settle(1);
    sim.state.banners = []; // keep the title clear of the round banner
    hud.showOverlay('menu', 'PASAR SENJA', 'Tactical FPS di pasar malam yang basah hujan. Lima lawan lima, tanam Kembang Api atau jinakkan.', 'Mulai main');
  } else if (name === 'buy') {
    sim.toBuy();
    body.position.set(-2, 0, 16);
    body.yaw = 0.15;
    settle(1);
    sim.state.banners = []; // keep the buy menu text clear
    hud.update(sim, 0, sim.state.time);
  } else if (name === 'play' || name === 'plant') {
    if (name === 'plant') {
      // Round 2: the player defends, a teammate rushes to defuse the charge.
      sim.state.round = 2;
      sim.startRound();
      sim.toBuy();
      sim.beginRound();
      sim.state.charge.state = 'planted';
      sim.state.charge.site = 'A';
      sim.state.charge.x = SITES.A.x;
      sim.state.charge.z = SITES.A.z;
      sim.state.charge.plantedAt = sim.state.time;
      body.position.set(-17, 0, -2);
      agent.hp = 10000; // stay alive while bots fight during the settle
      settle(3);
      if (agent.alive) agent.hp = 100;
      sim.state.banners = []; // keep the defuse moment clear of the start banner
      const defuser = sim.bots.find((b) => b.alive && b.team === 'def' && b.defusing)
        || sim.bots.find((b) => b.alive && b.team === 'def');
      if (defuser) aimAt(new THREE.Vector3(defuser.position.x, 1.4, defuser.position.z));
      else aimAt(new THREE.Vector3(SITES.A.x, 1.2, SITES.A.z));
    } else {
      sim.toBuy();
      sim.beginRound();
      body.position.set(0, 0, 10);
      agent.hp = 10000; // stay alive while bots fight during the settle
      settle(6);
      if (agent.alive) agent.hp = 100;
      let best = null;
      let bestD = Infinity;
      for (const e of sim.agents) {
        if (e.team === agent.team || !e.alive) continue;
        const d = Math.hypot(e.position.x - body.position.x, e.position.z - body.position.z);
        if (d < bestD) {
          best = e;
          bestD = d;
        }
      }
      if (best) {
        aimAt(new THREE.Vector3(best.position.x, best.position.y + 1.2, best.position.z));
        shoot(0);
        settle(0.2);
        aimAt(new THREE.Vector3(best.position.x, best.position.y + 1.2, best.position.z));
      }
    }
  }
  syncCamera();
  hud.update(sim, 0, sim.state.time);
  // Drop any tracers fired during the settle: the capture loop does not run
  // the frame tick that fades them, so they would freeze mid-air.
  for (const t of tracers) {
    t.life = 0;
    t.line.material.opacity = 0;
  }
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
sim.startMatch();
if (shot) runShot(shot);
else {
  if (autoplay) sim.toBuy();
  requestAnimationFrame(frame);
}
