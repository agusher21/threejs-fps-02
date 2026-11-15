// Pasar Senja simulation: one state object for the whole match. Phases run
// menu -> buy -> round -> roundEnd -> buy ... -> matchEnd. Rounds end by
// elimination, by the Kembang Api detonating, or by defusal; money and the buy
// menu sit between rounds. Bots are stepped here; the player is stepped in
// main.js and handed in through the same agent shape.
import * as THREE from 'three';
import { SITES, SPAWNS } from './world.js';
import { WEAPONS, createWeaponState, GRENADE_PRICE, ARMOR_PRICE, KIT_PRICE } from './weapons.js';
import { createBot, botReset, botBuy, botStep } from './bots.js';

const BUY_SECONDS = 15;
const ROUND_SECONDS = 90;
const FUSE_SECONDS = 35;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(world, player, audio, hooks, seed = 0) {
  const rng = mulberry32(seed || ((Date.now() % 2147483647) || 1));
  const state = {
    phase: 'menu',
    round: 1,
    wins: { atk: 0, def: 0 },
    timer: 0,
    playerSide: 'atk',
    charge: { state: 'none', site: null, x: 0, z: 0, carrier: null, plantedAt: 0, fuse: FUSE_SECONDS },
    killfeed: [],
    pings: [],
    banners: [],
    events: [],
    roundWinner: null,
    matchWinner: null,
    spectate: null,
    time: 0,
  };

  const playerAgent = {
    name: 'Kamu', team: 'atk', isBot: false,
    position: player.state.position, velocity: player.state.velocity,
    yaw: 0, pitch: 0, eye: 1.6, height: 1.72,
    hp: 100, armor: 0, alive: true, crouching: false,
    weapon: createWeaponState(WEAPONS.paku),
    loadout: { paku: true, siul: false, garuda: false, elang: false },
    money: 800, grenades: 0, hasKit: false, hasCharge: false,
    kills: 0, deaths: 0, planting: false, plantProgress: 0, defusing: false, defuseProgress: 0,
  };
  Object.defineProperty(playerAgent, 'eye', { get: () => player.state.eye });
  Object.defineProperty(playerAgent, 'yaw', { get: () => player.state.yaw, set: (v) => { player.state.yaw = v; } });
  Object.defineProperty(playerAgent, 'crouching', { get: () => player.state.crouching });

  const bots = [];
  const botNames = ['Budi', 'Sari', 'Agus', 'Dewi', 'Joko', 'Rina', 'Eko', 'Maya', 'Tono', 'Lilis'];
  for (let i = 0; i < 10; i += 1) {
    bots.push(createBot(hooks.scene, i < 5 ? 'atk' : 'def', botNames[i], i));
  }
  const agents = [playerAgent, ...bots];
  const grenades = [];
  let benched = null;

  function logEvent(msg) {
    state.events.push({ t: state.time, msg });
    if (state.events.length > 120) state.events.shift();
  }

  function banner(text, sub = '') {
    state.banners.push({ text, sub, t: state.time });
    if (state.banners.length > 3) state.banners.shift();
  }

  function feed(text, kind = 'kill') {
    state.killfeed.push({ text, kind, t: state.time });
    if (state.killfeed.length > 6) state.killfeed.shift();
  }

  function areaName(x, z) {
    if (Math.hypot(x - SITES.A.x, z - SITES.A.z) < 6) return 'Site A';
    if (Math.hypot(x - SITES.B.x, z - SITES.B.z) < 6) return 'Site B';
    if (Math.abs(x) < 9 && z > -8 && z < 8) return 'Mid';
    if (x < -9) return 'Jalan A';
    if (x > 9) return 'Jalan B';
    return 'Pasar';
  }

  function aliveOf(team) {
    return agents.filter((a) => a.team === team && a.alive);
  }

  function pickSite(bot) {
    return bot.siteChoice || 'A';
  }

  function nearestEnemyDist(bot) {
    let best = Infinity;
    for (const e of agents) {
      if (e.team === bot.team || !e.alive) continue;
      best = Math.min(best, Math.hypot(e.position.x - bot.position.x, e.position.z - bot.position.z));
    }
    return best;
  }

  const ctx = {
    time: 0, rng, world,
    agents,
    charge: state.charge,
    pickSite,
    areaName,
    nearestEnemyDist,
    callout(text) {
      feed(text, 'callout');
    },
    shotFired(agent, end, kind, hit) {
      const from = new THREE.Vector3(agent.position.x, agent.position.y + agent.eye, agent.position.z);
      hooks.onShot(from, end, kind, agent === playerAgent);
      state.pings.push({ x: agent.position.x, z: agent.position.z, t: state.time });
      if (state.pings.length > 24) state.pings.shift();
      for (const b of bots) {
        if (!b.alive || b === agent) continue;
        const d = Math.hypot(b.position.x - agent.position.x, b.position.z - agent.position.z);
        if (d < 26) {
          b.heardPos = { x: agent.position.x, z: agent.position.z };
          b.heardT = state.time;
        }
      }
    },
    damage(victim, amount, part, attacker) {
      damage(victim, amount, part, attacker);
    },
    plantDone(bot) {
      plantDone(bot);
    },
    defuseDone(bot) {
      defuseDone(bot);
    },
  };

  function damage(victim, amount, part, attacker) {
    if (!victim.alive || state.phase !== 'round') return;
    let rest = amount;
    if (victim.armor > 0) {
      const absorbed = Math.min(victim.armor, rest * 0.5);
      victim.armor -= absorbed;
      rest -= absorbed;
    }
    victim.hp -= rest;
    if (victim === playerAgent) {
      audio.hurt();
      hooks.onPlayerHurt(attacker);
    } else if (attacker === playerAgent) {
      audio.hit();
      hooks.onPlayerHit(victim, part);
    }
    if (victim.hp > 0) return;
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    if (attacker) attacker.kills += 1;
    if (attacker) attacker.money += 300;
    feed(`${attacker ? attacker.name : '???'} ✕ ${victim.name}${part === 'head' ? ' (kepala)' : ''}`, 'kill');
    logEvent(`kill ${attacker ? attacker.name : '?'} > ${victim.name}`);
    if (attacker === playerAgent) audio.kill();
    if (victim.hasCharge) {
      victim.hasCharge = false;
      state.charge.state = 'dropped';
      state.charge.x = victim.position.x;
      state.charge.z = victim.position.z;
      state.charge.carrier = null;
      feed('Kembang Api jatuh!', 'info');
    }
    if (victim === playerAgent) {
      const mates = aliveOf(playerAgent.team).filter((a) => a.isBot);
      state.spectate = mates[0] || null;
      banner('Kamu gugur', 'Menonton rekan satu tim — tekan Q untuk ganti');
    }
    checkRoundEnd();
  }

  function plantDone(bot) {
    const site = bot.siteChoice || 'A';
    state.charge.state = 'planted';
    state.charge.site = site;
    state.charge.x = SITES[site].x;
    state.charge.z = SITES[site].z;
    state.charge.plantedAt = state.time;
    if (bot === playerAgent) {
      playerAgent.money += 300;
      banner('Kembang Api ditanam!', `Site ${site} — bertahan sampai meledak`);
    } else {
      banner('Kembang Api ditanam!', `Site ${site} — jinakkan sebelum meledak`);
    }
    feed(`Kembang Api ditanam di Site ${site}`, 'info');
    logEvent(`plant site ${site} by ${bot.name}`);
    audio.plantBeep();
  }

  function defuseDone(bot) {
    state.charge.state = 'defused';
    banner('Kembang Api dijinakkan!', 'Penjaga Pasar menang ronde ini');
    feed(`${bot.name} menjinakkan Kembang Api`, 'info');
    logEvent(`defuse by ${bot.name}`);
    endRound('def');
  }

  function checkRoundEnd() {
    if (state.phase !== 'round') return;
    const atkAlive = aliveOf('atk').length;
    const defAlive = aliveOf('def').length;
    if (state.charge.state === 'planted') {
      if (defAlive === 0) endRound('atk');
      return;
    }
    if (atkAlive === 0) endRound('def');
    else if (defAlive === 0) endRound('atk');
  }

  function endRound(winner) {
    if (state.phase !== 'round') return;
    state.phase = 'roundEnd';
    state.timer = 4;
    state.roundWinner = winner;
    state.wins[winner] += 1;
    for (const a of agents) {
      if (a.team === winner) a.money += 1000;
      else a.money += 500;
    }
    const won = winner === state.playerSide;
    banner(won ? 'Ronde menang!' : 'Ronde kalah', `Perusuh ${state.wins.atk} — ${state.wins.def} Penjaga`);
    logEvent(`round ${state.round} winner ${winner} (${state.wins.atk}-${state.wins.def})`);
    if (won) audio.roundWin();
    else audio.roundLose();
    if (state.wins[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.wins.atk > state.wins.def ? 'atk' : 'def';
    }
  }

  function startRound() {
    state.roundWinner = null;
    state.phase = 'buy';
    state.timer = hooks.autoplay ? 3 : BUY_SECONDS;
    state.playerSide = state.round % 2 === 1 ? 'atk' : 'def';
    playerAgent.team = state.playerSide;
    playerAgent.alive = true;
    playerAgent.hp = 100;
    playerAgent.armor = playerAgent.armor;
    playerAgent.hasCharge = false;
    playerAgent.grenades = playerAgent.grenades;
    playerAgent.planting = false;
    playerAgent.defusing = false;
    playerAgent.plantProgress = 0;
    playerAgent.defuseProgress = 0;
    state.charge = { state: 'none', site: null, x: 0, z: 0, carrier: null, plantedAt: 0, fuse: FUSE_SECONDS };
    ctx.charge = state.charge;
    state.spectate = null;

    // Bench one bot of the player's side so both teams field five.
    const side = state.playerSide;
    const sideBots = bots.filter((b) => b.team === side);
    benched = sideBots[state.round % sideBots.length];
    let ai = 0;
    for (const bot of bots) {
      const isBenched = bot === benched;
      bot.group.visible = !isBenched;
      bot.alive = !isBenched;
      if (isBenched) continue;
      const spawnList = SPAWNS[bot.team];
      const [sx, sz] = spawnList[ai % spawnList.length];
      ai += 1;
      const yaw = bot.team === 'atk' ? Math.PI : 0;
      const role = bot.team === 'atk'
        ? (ai % 5 === 1 ? 'rusher' : ai % 5 === 2 ? 'carrier' : 'holder')
        : (ai % 5 === 4 ? 'roamer' : 'holder');
      botReset(bot, sx, sz, yaw, role, bot.team);
      bot.siteChoice = ai % 5 < 3 ? 'A' : 'B';
      bot.holdNode = bot.team === 'def'
        ? [12, 13, 9, 11, 10][ai % 5]
        : 12;
      bot.scanDir = bot.team === 'def' ? Math.PI : 0;
      botBuy(bot, rng);
      // Attackers walk to their site; defenders to their hold.
      if (bot.team === 'atk') {
        bot.mode = 'route';
        bot.dest = bot.siteChoice === 'A' ? 12 : 13;
        bot.path = [];
        bot.pathIdx = 0;
      } else {
        bot.mode = 'route';
        bot.dest = bot.holdNode;
        bot.path = [];
        bot.pathIdx = 0;
      }
    }
    // Carrier: the player when attacking, else the first alive attacker rusher.
    if (state.playerSide === 'atk') {
      playerAgent.hasCharge = true;
      state.charge.state = 'carried';
      state.charge.carrier = playerAgent;
    } else {
      const carrier = bots.find((b) => b.alive && b.team === 'atk' && b.role === 'rusher');
      if (carrier) {
        carrier.hasCharge = true;
        state.charge.state = 'carried';
        state.charge.carrier = carrier;
      }
    }
    const [px, pz] = SPAWNS[state.playerSide][0];
    player.reset(px, pz, state.playerSide === 'atk' ? Math.PI : 0);
    playerAgent.weapon.mag = playerAgent.weapon.def.mag;
    if (playerAgent.weapon.def.reserve !== Infinity) {
      playerAgent.weapon.reserve = Math.max(playerAgent.weapon.reserve, playerAgent.weapon.def.mag);
    }
    banner(`Ronde ${state.round}`, state.playerSide === 'atk' ? 'Kamu Perusuh — tanam Kembang Api' : 'Kamu Penjaga Pasar — jaga kedua site');
    logEvent(`round ${state.round} start, player ${state.playerSide}`);
  }

  function beginRound() {
    state.phase = 'round';
    state.timer = hooks.autoplay ? 45 : ROUND_SECONDS;
    banner('Mulai!', state.playerSide === 'atk' ? 'Tanam di Site A atau B' : 'Tahan kedua site');
    logEvent('round live');
  }

  function buyItem(code) {
    if (state.phase !== 'buy') return false;
    const p = playerAgent;
    const tryBuy = (cost, apply) => {
      if (p.money < cost) {
        audio.denied();
        return false;
      }
      p.money -= cost;
      apply();
      audio.buy();
      return true;
    };
    switch (code) {
      case 'Digit1':
        p.weapon = createWeaponState(WEAPONS.paku);
        hooks.onWeaponChange();
        return true;
      case 'Digit2':
        return tryBuy(WEAPONS.siul.price, () => {
          p.weapon = createWeaponState(WEAPONS.siul);
          p.loadout.siul = true;
          hooks.onWeaponChange();
        });
      case 'Digit3':
        return tryBuy(WEAPONS.garuda.price, () => {
          p.weapon = createWeaponState(WEAPONS.garuda);
          p.loadout.garuda = true;
          hooks.onWeaponChange();
        });
      case 'Digit4':
        return tryBuy(WEAPONS.elang.price, () => {
          p.weapon = createWeaponState(WEAPONS.elang);
          p.loadout.elang = true;
          hooks.onWeaponChange();
        });
      case 'Digit5':
        return tryBuy(GRENADE_PRICE, () => { p.grenades += 1; });
      case 'Digit6':
        return tryBuy(ARMOR_PRICE, () => { p.armor = 50; });
      case 'Digit7':
        if (p.team !== 'def') {
          audio.denied();
          return false;
        }
        return tryBuy(KIT_PRICE, () => { p.hasKit = true; });
      default:
        return false;
    }
  }

  // Switch to an owned weapon mid-round (keys 1-4); buying happens in buyItem.
  function switchWeapon(code) {
    const p = playerAgent;
    const kind = { Digit1: 'paku', Digit2: 'siul', Digit3: 'garuda', Digit4: 'elang' }[code];
    if (!kind || !p.loadout[kind]) return;
    if (p.weapon.def.kind === kind) return;
    p.weapon = createWeaponState(WEAPONS[kind]);
    hooks.onWeaponChange();
  }

  function stepPlayerInteract(dt, input) {
    const p = playerAgent;
    p.planting = false;
    p.defusing = false;
    if (!p.alive || state.phase !== 'round') return;
    const holdingE = input.state.keys.has('KeyE');
    if (p.team === 'atk' && p.hasCharge && holdingE) {
      const site = Math.hypot(p.position.x - SITES.A.x, p.position.z - SITES.A.z) < SITES.A.r ? 'A'
        : Math.hypot(p.position.x - SITES.B.x, p.position.z - SITES.B.z) < SITES.B.r ? 'B' : null;
      if (site) {
        p.planting = true;
        p.plantProgress += dt;
        if (Math.floor(p.plantProgress * 2) !== Math.floor((p.plantProgress - dt) * 2)) audio.plantBeep();
        if (p.plantProgress >= PLANT_SECONDS) {
          p.hasCharge = false;
          p.plantProgress = 0;
          p.siteChoice = site;
          plantDone(p);
        }
        return;
      }
    }
    if (p.team === 'def' && state.charge.state === 'planted' && holdingE) {
      if (Math.hypot(p.position.x - state.charge.x, p.position.z - state.charge.z) < 2.6) {
        p.defusing = true;
        p.defuseProgress += dt * (p.hasKit ? 2 : 1);
        if (Math.floor(p.defuseProgress * 2) !== Math.floor((p.defuseProgress - dt) * 2)) audio.defuseBeep();
        if (p.defuseProgress >= DEFUSE_SECONDS) {
          p.defuseProgress = 0;
          defuseDone(p);
        }
      }
    }
    if (!p.planting) p.plantProgress = Math.max(0, p.plantProgress - dt * 2);
    if (!p.defusing) p.defuseProgress = Math.max(0, p.defuseProgress - dt * 2);
  }

  function stepGrenades(dt) {
    for (const g of grenades) {
      if (g.done) continue;
      g.vel.y -= 18 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const pos = g.mesh.position;
      let bounced = false;
      for (const c of world.colliders) {
        if (pos.x > c.min.x - 0.09 && pos.x < c.max.x + 0.09
          && pos.y > c.min.y - 0.09 && pos.y < c.max.y + 0.09
          && pos.z > c.min.z - 0.09 && pos.z < c.max.z + 0.09) {
          const dxl = pos.x - (c.min.x - 0.09);
          const dxr = (c.max.x + 0.09) - pos.x;
          const dyl = pos.y - (c.min.y - 0.09);
          const dyr = (c.max.y + 0.09) - pos.y;
          const dzl = pos.z - (c.min.z - 0.09);
          const dzr = (c.max.z + 0.09) - pos.z;
          const m = Math.min(dxl, dxr, dyl, dyr, dzl, dzr);
          if (m === dyl || m === dyr) g.vel.y = Math.abs(g.vel.y) * 0.4 * (m === dyl ? -1 : 1);
          else if (m === dxl || m === dxr) g.vel.x *= -0.4;
          else g.vel.z *= -0.4;
          g.bounces += 1;
          bounced = true;
          break;
        }
      }
      if (pos.y < 0.09) {
        pos.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.bounces += 1;
      }
      g.fuse -= dt;
      if ((g.fuse <= 0 || g.bounces > 2) && !g.done) {
        g.done = true;
        g.mesh.visible = false;
        hooks.onExplosion(pos.clone());
        audio.explosion();
        for (const a of agents) {
          if (!a.alive || a === g.thrower) continue;
          const d = Math.hypot(a.position.x - pos.x, a.position.z - pos.z);
          if (d < 6) damage(a, Math.round(100 - (d / 6) * 80), 'torso', g.thrower);
        }
      }
      void bounced;
    }
  }

  function step(dt, input) {
    state.time += dt;
    ctx.time = state.time;
    if (state.phase === 'buy') {
      state.timer -= dt;
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7']) {
        if (input.consume(code)) buyItem(code);
      }
      if (state.timer <= 0 || input.consume('Enter') || input.consume('KeyB')) beginRound();
      return;
    }
    if (state.phase === 'round') {
      state.timer -= dt;
      if (state.charge.state === 'planted' && state.time - state.charge.plantedAt >= FUSE_SECONDS) {
        hooks.onExplosion(new THREE.Vector3(state.charge.x, 1, state.charge.z));
        audio.explosion();
        banner('Kembang Api meledak!', 'Perusuh menang ronde ini');
        endRound('atk');
        return;
      }
      if (state.timer <= 0 && state.charge.state !== 'planted') {
        endRound('def');
        return;
      }
      stepPlayerInteract(dt, input);
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
        if (input.consume(code)) switchWeapon(code);
      }
      for (const bot of bots) {
        if (bot.alive) botStep(bot, dt, ctx);
      }
      stepGrenades(dt);
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      for (const bot of bots) {
        if (bot.alive) botStep(bot, dt, ctx);
      }
      if (state.timer <= 0) {
        if (state.matchWinner) {
          state.phase = 'matchEnd';
          banner(state.matchWinner === state.playerSide ? 'MENANG!' : 'KALAH',
            `Perusuh ${state.wins.atk} — ${state.wins.def} Penjaga`);
          logEvent(`match winner ${state.matchWinner}`);
        } else {
          state.round += 1;
          startRound();
        }
      }
    }
  }

  return {
    state,
    agents,
    bots,
    playerAgent,
    grenades,
    rng,
    startMatch() {
      state.phase = 'menu';
      state.round = 1;
      state.wins = { atk: 0, def: 0 };
      state.matchWinner = null;
      state.killfeed = [];
      state.events = [];
      playerAgent.money = 800;
      playerAgent.weapon = createWeaponState(WEAPONS.paku);
      playerAgent.loadout = { paku: true, siul: false, garuda: false, elang: false };
      playerAgent.grenades = 0;
      playerAgent.armor = 0;
      playerAgent.hasKit = false;
      playerAgent.kills = 0;
      playerAgent.deaths = 0;
      for (const b of bots) {
        b.money = 800;
        b.kills = 0;
        b.deaths = 0;
      }
      startRound();
      state.phase = 'menu';
    },
    startRound,
    beginRound,
    toBuy() {
      if (state.phase !== 'menu' && state.phase !== 'matchEnd') return;
      state.phase = 'buy';
      state.timer = hooks.autoplay ? 3 : BUY_SECONDS;
    },
    step,
    buyItem,
    damage,
    plantDone,
    defuseDone,
    areaName,
    cycleSpectate() {
      const mates = aliveOf(playerAgent.team).filter((a) => a.isBot);
      if (!mates.length) return;
      const idx = mates.indexOf(state.spectate);
      state.spectate = mates[(idx + 1) % mates.length];
    },
  };
}
