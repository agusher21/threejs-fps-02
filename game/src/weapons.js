// Weapons of Pasar Senja: four guns with their own damage, rate, spread, recoil
// and price, plus a frag grenade. One definition each; the view model, magazine,
// reload and spread live here, the ray and the damage live in main.js / sim.js.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  paku: {
    name: 'Paku', kind: 'pistol', price: 0, damage: 26, headMult: 2,
    fireGap: 0.16, mag: 12, reserve: Infinity, reloadTime: 1.1,
    spreadStill: 0.003, spreadMove: 0.02, recoil: 0.011, auto: false, range: 60,
  },
  siul: {
    name: 'Siul', kind: 'smg', price: 900, damage: 18, headMult: 2,
    fireGap: 0.075, mag: 28, reserve: 112, reloadTime: 1.6,
    spreadStill: 0.006, spreadMove: 0.034, recoil: 0.008, auto: true, range: 55,
  },
  garuda: {
    name: 'AR-21 Garuda', kind: 'rifle', price: 2000, damage: 30, headMult: 2,
    fireGap: 0.1, mag: 25, reserve: 100, reloadTime: 2.0,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.014, auto: true, range: 80,
  },
  elang: {
    name: 'Elang', kind: 'sniper', price: 3500, damage: 92, headMult: 2,
    fireGap: 1.15, mag: 5, reserve: 15, reloadTime: 2.6,
    spreadStill: 0.0004, spreadMove: 0.06, recoil: 0.05, auto: false, range: 120,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400;

const GRIP = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c241c'), roughness: 0.7, metalness: 0.2, emissive: new THREE.Color('#241a12'), emissiveIntensity: 0.9 });
const STEEL = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8c4bb'), roughness: 0.45, metalness: 0.5, emissive: new THREE.Color('#5a564e'), emissiveIntensity: 0.9 });
const DARK = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3f46'), roughness: 0.55, metalness: 0.4, emissive: new THREE.Color('#2c3036'), emissiveIntensity: 0.9 });

// A small first-person view model: receiver, barrel, stock, shaped per weapon kind.
export function createViewModel(camera, kind) {
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, kind === 'pistol' ? 0.24 : 0.42), STEEL);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, kind === 'sniper' ? 0.62 : kind === 'pistol' ? 0.12 : 0.4), GRIP);
  barrel.position.set(0, 0.03, kind === 'pistol' ? -0.16 : -0.42);
  model.add(receiver, barrel);
  if (kind === 'pistol') {
    // Downward grip so the pistol reads as a pistol, not a box.
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), GRIP);
    grip.position.set(0, -0.11, 0.07);
    grip.rotation.x = 0.18;
    model.add(grip);
  }
  if (kind !== 'pistol') {
    // Short shoulder stock; pistols have none (it would poke into the camera).
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.14), GRIP);
    stock.position.set(0, -0.02, 0.26);
    model.add(stock);
  }
  if (kind === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), DARK);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.05);
    model.add(scope);
  }
  if (kind === 'smg') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.08), DARK);
    mag.position.set(0, -0.14, -0.05);
    model.add(mag);
  }
  model.scale.setScalar(0.65);
  model.position.set(0.28, -0.27, -0.62);
  model.rotation.y = -0.1;
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lantern), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.28, -0.24, -1.1);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.lantern), 0, 6);
  flashLight.position.set(0.28, -0.16, -0.8);
  camera.add(flashLight);
  // A small warm light riding with the camera so the view model reads at night.
  // Short range on purpose: it must light the gun, never the world behind it.
  const vmLight = new THREE.PointLight(new THREE.Color('#ffe6b8'), 8, 1.2, 1.2);
  vmLight.position.set(0.28, 0.1, -0.35);
  camera.add(vmLight);

  return { model, flash, flashLight, vmLight };
}

export function createWeaponState(def) {
  return {
    def, mag: def.mag, reserve: def.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, heat: 0,
  };
}

export function weaponStep(state, view, dt) {
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.flash = Math.max(0, state.flash - dt);
  state.heat = Math.max(0, state.heat - dt * 0.9);
  state.kick += (0 - state.kick) * Math.min(1, dt * 14);
  view.model.position.z = -0.62 + state.kick;
  view.model.rotation.x = state.kick * 2.2;
  view.flash.visible = state.flash > 0;
  view.flash.rotation.z = state.flash * 30;
  view.flashLight.intensity = state.flash > 0 ? 18 : 0;
  if (state.reloadLeft > 0) {
    state.reloadLeft = Math.max(0, state.reloadLeft - dt);
    view.model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
    if (state.reloadLeft === 0) {
      const need = state.def.mag - state.mag;
      const take = state.def.reserve === Infinity ? need : Math.min(need, state.reserve);
      state.mag += take;
      if (state.def.reserve !== Infinity) state.reserve -= take;
    }
  }
}

export function weaponReady(state) {
  return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
}

export function weaponFire(state) {
  if (state.mag <= 0) return false;
  state.mag -= 1;
  state.cooldown = state.def.fireGap;
  state.flash = 0.06;
  state.kick = 0.055;
  state.heat = Math.min(1, state.heat + 0.16);
  return true;
}

export function weaponReload(state) {
  if (state.reloadLeft > 0 || state.mag === state.def.mag) return false;
  if (state.def.reserve !== Infinity && state.reserve === 0) return false;
  state.reloadLeft = state.def.reloadTime;
  return true;
}

// Spread grows with movement and with continuous fire (heat), so stopping to aim pays.
export function weaponSpread(state, speed, aiming) {
  const move = Math.min(1, speed / 5.2);
  let spread = state.def.spreadStill + move * state.def.spreadMove + state.heat * 0.012;
  if (aiming) spread *= 0.45;
  return spread;
}

// A thrown frag: a small sphere with gravity and one bounce, then a blast.
export function createGrenade(scene, from, dir) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f6b2f'), roughness: 0.6, metalness: 0.3 }),
  );
  mesh.position.copy(from);
  scene.add(mesh);
  return {
    mesh, vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5.5, 0)),
    fuse: 1.4, bounces: 0, done: false,
  };
}
