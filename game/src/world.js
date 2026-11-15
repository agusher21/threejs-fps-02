// Pasar Senja: a 60 x 40 m rain-slicked night market. Two sites (A Warung Kopi
// west, B Los Ikan east), a mid lane, stalls and gerobak carts as cover, lantern
// posts, neon signs, and a waypoint graph the bots walk. Every box is a collider
// and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE, cobbleTexture, batikTexture, woodTexture, signTexture } from './palette.js';

export const SITES = {
  A: { name: 'Warung Kopi', x: -22, z: -8, r: 3.6 },
  B: { name: 'Los Ikan', x: 22, z: -8, r: 3.6 },
};
export const SPAWNS = {
  atk: [[-6, 17], [0, 17], [6, 17], [-3, 18], [3, 18]],
  def: [[-6, -17], [0, -17], [6, -17], [-3, -18], [3, -18]],
};

// Waypoint graph: bots pathfind over it with BFS. [x, z, [neighbours]]
export const WAYPOINTS = [
  [-6, 17, [3, 4]], [0, 17, [4]], [6, 17, [4, 5]],
  [-14, 12, [0, 4, 6]], [0, 11, [1, 3, 5, 7]], [14, 12, [2, 4, 8]],
  [-20, 6, [3, 9, 22]], [0, 5, [4, 9, 10, 11]], [20, 6, [5, 11, 23]],
  [-22, -2, [6, 7, 12, 14]], [0, -3, [7, 14, 15, 16]], [22, -2, [8, 7, 13, 15]],
  [-22, -8, [9, 14]], [22, -8, [11, 15]],
  [-8, -10, [9, 10, 12, 16, 20]], [8, -10, [10, 11, 13, 16, 21]],
  [0, -13, [10, 14, 15, 17, 18, 19]],
  [-6, -17, [16, 20]], [0, -17, [16]], [6, -17, [16, 21]],
  [-14, -14, [14, 17]], [14, -14, [15, 19]],
  [-26, 4, [6]], [26, 4, [8]],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const groundTex = cobbleTexture();
  groundTex.repeat.set(15, 10);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.22, metalness: 0.18 });
  const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232a3a'), roughness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
  const crateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a5a34'), roughness: 0.85 });
  const awningRed = new THREE.MeshStandardMaterial({ map: batikTexture('#b03024', '#7e1f16'), roughness: 0.7 });
  const awningTeal = new THREE.MeshStandardMaterial({ map: batikTexture('#0e7c7b', '#095454'), roughness: 0.7 });
  const awningAmber = new THREE.MeshStandardMaterial({ map: batikTexture('#e67e22', '#a34d0c'), roughness: 0.7 });
  const metalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a5058'), roughness: 0.5, metalness: 0.5 });

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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

  // Ground and perimeter walls (stall backs / shophouses).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3(new THREE.Vector3(-30, -0.4, -20), new THREE.Vector3(30, 0, 20)));
  box(60.8, 4.6, 0.4, 0, 2.3, -20.2, wallMat);
  box(60.8, 4.6, 0.4, 0, 2.3, 20.2, wallMat);
  box(0.4, 4.6, 40.8, -30.2, 2.3, 0, wallMat);
  box(0.4, 4.6, 40.8, 30.2, 2.3, 0, wallMat);

  // Food stalls: counter + batik awning on posts.
  function stall(x, z, awning, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 1.6), woodMat);
    counter.position.y = 0.53;
    counter.castShadow = counter.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 2.4), awning);
    roof.position.set(0, 2.5, 0);
    roof.rotation.x = 0.1;
    roof.castShadow = true;
    g.add(counter, roof);
    for (const px of [-1.7, 1.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.5, 0.09), woodMat);
      post.position.set(px, 1.25, 0.9);
      g.add(post);
    }
    group.add(g);
    const c = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 0.55, z), new THREE.Vector3(3.4, 1.1, 1.6));
    colliders.push(c);
    shootables.push(counter);
    return g;
  }
  stall(-14, 8, awningRed);
  stall(-8, 2, awningTeal);
  stall(14, 8, awningAmber);
  stall(8, 2, awningRed);
  stall(-5, -5, awningTeal);
  stall(5, -5, awningAmber);

  // Gerobak carts (low cover you can shoot over while crouched behind).
  function cart(x, z, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.0), woodMat);
    bed.position.y = 0.75;
    bed.castShadow = bed.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.2), awningRed);
    roof.position.y = 1.7;
    g.add(bed, roof);
    for (const [wx, wz] of [[-0.7, 0.45], [0.7, 0.45], [-0.7, -0.45], [0.7, -0.45]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), woodMat);
      leg.position.set(wx, 0.28, wz);
      g.add(leg);
    }
    group.add(g);
    colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(1.9, 1.0, 1.0)));
    shootables.push(bed);
  }
  cart(-18, 2, 0.3);
  cart(18, 2, -0.3);
  cart(-4, 10, 0.1);
  cart(4, 10, -0.1);
  cart(-26, -4, 0.5);
  cart(26, -4, -0.5);

  // Crates and pillars.
  function crate(x, z, s = 1, y = 0) {
    box(s, s, s, x, y + s / 2, z, crateMat);
  }
  crate(-20, -12); crate(-19, -12, 1, 1); crate(-24, -4);
  crate(20, -12); crate(19, -12, 1, 1); crate(24, -4);
  crate(0, 14); crate(-12, -8); crate(12, -8);
  crate(-27, 12, 1.2); crate(27, 12, 1.2);
  box(0.8, 3.2, 0.8, -10, 1.6, -14, metalMat);
  box(0.8, 3.2, 0.8, 10, 1.6, -14, metalMat);
  box(0.8, 3.2, 0.8, -10, 1.6, 14, metalMat);
  box(0.8, 3.2, 0.8, 10, 1.6, 14, metalMat);

  // Site counters: Warung Kopi (A) and Los Ikan (B).
  box(4.2, 1.1, 1.4, -25.5, 0.55, -8, woodMat);
  box(4.2, 1.1, 1.4, 25.5, 0.55, -8, woodMat);
  box(1.4, 0.9, 1.4, -22, 0.45, -12.5, crateMat);
  box(1.4, 0.9, 1.4, 22, 0.45, -12.5, crateMat);

  // Site rings on the ground.
  const siteRings = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lantern), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    siteRings[key] = ring;
  }

  // Neon signs on the back wall and over the sites.
  function sign(text, color, x, y, z, rotY = 0) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.1),
      new THREE.MeshBasicMaterial({ map: signTexture(text, color), transparent: true }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
  }
  sign('WARUNG KOPI', PALETTE.lantern, -22, 3.4, -19.9);
  sign('LOS IKAN', PALETTE.neonCyan, 22, 3.4, -19.9);
  sign('SATE', PALETTE.neonPink, -14, 3.2, -19.9);
  sign('BAKSO', PALETTE.neonCyan, 14, 3.2, -19.9);
  sign('PASAR SENJA', PALETTE.lantern, 0, 3.6, 19.9, Math.PI);

  // Lantern posts: warm point lights, few enough for the frame budget.
  const lanternLights = [];
  for (const [x, z] of [[-22, -8], [22, -8], [0, 5], [-14, 12], [14, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), metalMat);
    pole.position.set(x, 1.7, z);
    group.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lantern) }),
    );
    bulb.position.set(x, 3.5, z);
    group.add(bulb);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.lantern), 22, 17, 1.6);
    light.position.set(x, 3.4, z);
    scene.add(light);
    lanternLights.push({ light, bulb, phase: x * 0.7 + z });
  }

  // Lighting: dusk hemisphere, cool moon key with shadows, faint warm fill.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#33456e'), new THREE.Color('#1a1410'), 1.05));
  const moon = new THREE.DirectionalLight(new THREE.Color('#9db4ff'), 1.0);
  moon.position.set(12, 22, -8);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -34;
  moon.shadow.camera.right = 34;
  moon.shadow.camera.top = 24;
  moon.shadow.camera.bottom = -24;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#ffb347'), 0.45);
  fill.position.set(-10, 8, 14);
  scene.add(fill);

  // Rain: one Points cloud, recycled in place (no allocation per frame).
  const RAIN_COUNT = 900;
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  const rainVel = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i += 1) {
    rainPos[i * 3] = (Math.random() * 2 - 1) * 32;
    rainPos[i * 3 + 1] = Math.random() * 18;
    rainPos[i * 3 + 2] = (Math.random() * 2 - 1) * 22;
    rainVel[i] = 11 + Math.random() * 6;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: new THREE.Color('#8fa8d8'), size: 0.07, transparent: true, opacity: 0.55, sizeAttenuation: true,
  }));
  scene.add(rain);

  return {
    colliders,
    shootables,
    group,
    siteRings,
    update(dt, time) {
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        rainPos[i * 3 + 1] -= rainVel[i] * dt;
        rainPos[i * 3] -= 2 * dt;
        if (rainPos[i * 3 + 1] < 0) {
          rainPos[i * 3 + 1] = 16 + Math.random() * 2;
          rainPos[i * 3] = (Math.random() * 2 - 1) * 32;
          rainPos[i * 3 + 2] = (Math.random() * 2 - 1) * 22;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      for (const lantern of lanternLights) {
        lantern.light.intensity = 22 + Math.sin(time * 2.1 + lantern.phase) * 2.5;
      }
    },
  };
}
