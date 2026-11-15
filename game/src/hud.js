// The DOM HUD: health, ammo, money, timer, score, killfeed, a 2D minimap with
// sound-radar pings, plant/defuse progress, banners, the buy menu and overlays.
// It never touches the simulation; main.js pushes state in once a frame.
import { SITES } from './world.js';

const BUY_ITEMS = [
  { code: 'Digit1', key: '1', name: 'Paku — Pistol', price: 0, desc: '12 peluru, cadangan tak habis' },
  { code: 'Digit2', key: '2', name: 'Siul — SMG', price: 900, desc: 'Cepat, sebaran lebar' },
  { code: 'Digit3', key: '3', name: 'AR-21 Garuda — Rifle', price: 2000, desc: 'Seimbang, andalan' },
  { code: 'Digit4', key: '4', name: 'Elang — Sniper', price: 3500, desc: 'Satu tembakan mematikan' },
  { code: 'Digit5', key: '5', name: 'Granat Frag', price: 300, desc: 'Ledakan area, tombol G' },
  { code: 'Digit6', key: '6', name: 'Rompi Anti Peluru', price: 650, desc: 'Serap 50% damage' },
  { code: 'Digit7', key: '7', name: 'Kit Jinak', price: 400, desc: 'Jinak 2x lebih cepat (Penjaga)' },
];

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    hpFill: $('hp-fill'), hpNum: $('hp-num'), armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    nades: $('nades'), money: $('money'), timer: $('timer'), score: $('score'),
    round: $('round'), killfeed: $('killfeed'), minimap: $('minimap'),
    banner: $('banner'), bannerText: $('banner-text'), bannerSub: $('banner-sub'),
    objective: $('objective'), progress: $('progress'), progressFill: $('progress-fill'),
    progressLabel: $('progress-label'), damage: $('damage'), spectate: $('spectate'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), buyMenu: $('buy-menu'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    startRound: $('start-round'),
  };
  const mapCtx = els.minimap.getContext('2d');
  const cache = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  els.startRound.addEventListener('click', () => {
    if (callbacks.onStartRound) callbacks.onStartRound();
  });

  function setText(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  }

  function setWidth(el, key, pct) {
    const v = `${Math.max(0, Math.min(100, pct))}%`;
    if (cache[key] !== v) {
      cache[key] = v;
      el.style.width = v;
    }
  }

  function drawMinimap(sim) {
    const W = 180;
    const H = 120;
    const sx = (x) => (x + 30) * 3;
    const sz = (z) => (z + 20) * 3;
    mapCtx.clearRect(0, 0, W, H);
    mapCtx.fillStyle = 'rgba(13,21,38,0.85)';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.strokeStyle = 'rgba(242,234,216,0.35)';
    mapCtx.strokeRect(1, 1, W - 2, H - 2);
    // Stalls and carts as blocks.
    mapCtx.fillStyle = 'rgba(138,147,166,0.5)';
    for (const [x, z, w, d] of [
      [-14, 8, 3.4, 1.6], [-8, 2, 3, 1.6], [14, 8, 3.4, 1.6], [8, 2, 3, 1.6],
      [-5, -5, 3, 1.6], [5, -5, 3, 1.6], [-25.5, -8, 4.2, 1.4], [25.5, -8, 4.2, 1.4],
    ]) mapCtx.fillRect(sx(x - w / 2), sz(z - d / 2), w * 3, d * 3);
    // Sites.
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      mapCtx.beginPath();
      mapCtx.arc(sx(s.x), sz(s.z), s.r * 3, 0, 7);
      mapCtx.strokeStyle = key === 'A' ? '#ffb347' : '#35e0d4';
      mapCtx.lineWidth = 1.5;
      mapCtx.stroke();
      mapCtx.fillStyle = key === 'A' ? '#ffb347' : '#35e0d4';
      mapCtx.font = 'bold 11px system-ui';
      mapCtx.textAlign = 'center';
      mapCtx.fillText(key, sx(s.x), sz(s.z) + 4);
    }
    // Planted charge blinks.
    if (sim.state.charge.state === 'planted') {
      const blink = Math.sin(sim.state.time * 6) > 0;
      mapCtx.fillStyle = blink ? '#ff4d4d' : '#ffb347';
      mapCtx.beginPath();
      mapCtx.arc(sx(sim.state.charge.x), sz(sim.state.charge.z), 5, 0, 7);
      mapCtx.fill();
    }
    // Sound pings: expanding rings where shots were heard.
    for (const ping of sim.state.pings) {
      const age = sim.state.time - ping.t;
      if (age > 1.5) continue;
      mapCtx.beginPath();
      mapCtx.arc(sx(ping.x), sz(ping.z), 3 + age * 10, 0, 7);
      mapCtx.strokeStyle = `rgba(255,77,77,${1 - age / 1.5})`;
      mapCtx.stroke();
    }
    // Agents: teammates teal, player white arrow, enemies never shown (only pings).
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const x = sx(a.position.x);
      const y = sz(a.position.z);
      if (a === sim.playerAgent) {
        mapCtx.save();
        mapCtx.translate(x, y);
        mapCtx.rotate(-a.yaw);
        mapCtx.fillStyle = '#fff';
        mapCtx.beginPath();
        mapCtx.moveTo(0, -6);
        mapCtx.lineTo(4, 5);
        mapCtx.lineTo(-4, 5);
        mapCtx.closePath();
        mapCtx.fill();
        mapCtx.restore();
      } else if (a.team === sim.playerAgent.team) {
        mapCtx.fillStyle = '#35e0d4';
        mapCtx.beginPath();
        mapCtx.arc(x, y, 3.5, 0, 7);
        mapCtx.fill();
      }
    }
  }

  function renderBuy(sim) {
    const show = sim.state.phase === 'buy';
    els.buyMenu.hidden = !show;
    if (!show) return;
    setText(els.buyMoney, 'buyMoney', `Rp ${sim.playerAgent.money.toLocaleString('id-ID')}`);
    let html = '';
    for (const item of BUY_ITEMS) {
      const owned = (item.code === 'Digit1' && sim.playerAgent.weapon.def.kind === 'pistol')
        || (item.code === 'Digit2' && sim.playerAgent.weapon.def.kind === 'smg')
        || (item.code === 'Digit3' && sim.playerAgent.weapon.def.kind === 'rifle')
        || (item.code === 'Digit4' && sim.playerAgent.weapon.def.kind === 'sniper');
      const afford = sim.playerAgent.money >= item.price;
      const disabled = item.code === 'Digit7' && sim.playerAgent.team !== 'def';
      html += `<button type="button" data-code="${item.code}" ${!afford || disabled ? 'disabled' : ''} class="${owned ? 'owned' : ''}">
        <b>[${item.key}] ${item.name}</b><span>Rp ${item.price.toLocaleString('id-ID')}</span>
        <i>${item.desc}</i></button>`;
    }
    if (cache.buyHtml !== html) {
      cache.buyHtml = html;
      els.buyList.innerHTML = html;
      els.buyList.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => callbacks.onBuy(btn.dataset.code));
      });
    }
  }

  return {
    update(sim, spread, time) {
      const s = sim.state;
      const p = sim.playerAgent;
      setText(els.hpNum, 'hp', String(Math.max(0, Math.ceil(p.hp))));
      setWidth(els.hpFill, 'hpFill', p.hp);
      setText(els.armorNum, 'armor', p.armor > 0 ? `🛡 ${Math.ceil(p.armor)}` : '');
      setText(els.ammoMag, 'mag', String(p.weapon.mag));
      setText(els.ammoReserve, 'reserve', p.weapon.def.reserve === Infinity ? '/ ∞' : `/ ${p.weapon.reserve}`);
      setText(els.weaponName, 'wname', `${p.weapon.def.name}${p.grenades ? ` · 💣x${p.grenades}` : ''}`);
      setText(els.money, 'money', `Rp ${p.money.toLocaleString('id-ID')}`);
      const t = Math.max(0, Math.ceil(s.timer));
      setText(els.timer, 'timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      els.timer.classList.toggle('urgent', s.phase === 'round' && t <= 10);
      setText(els.score, 'score', `PERUSUH ${s.wins.atk} — ${s.wins.def} PENJAGA`);
      setText(els.round, 'round', `Ronde ${s.round}/9`);
      els.crosshair.style.setProperty('--gap', `${Math.round(6 + Math.min(1, spread) * 260)}px`);
      els.crosshair.classList.toggle('aiming', document.pointerLockElement != null && false);

      const obj = s.playerSide === 'atk'
        ? (s.charge.state === 'planted' ? `💥 Kembang Api di Site ${s.charge.site} — ${Math.max(0, Math.ceil(35 - (s.time - s.charge.plantedAt)))} dtk`
          : p.hasCharge ? 'Bawa Kembang Api ke Site A / B — tahan E untuk tanam'
          : s.charge.state === 'dropped' ? 'Kembang Api jatuh — ambil lagi!'
          : 'Eliminasi Penjaga atau tanam Kembang Api')
        : (s.charge.state === 'planted' ? `💥 Kembang Api di Site ${s.charge.site} — tahan E untuk jinak!`
          : 'Jaga Site A dan B — jangan sampai ditanam');
      setText(els.objective, 'obj', obj);

      // Plant / defuse progress.
      const planting = p.planting || p.defusing;
      els.progress.hidden = !planting;
      if (planting) {
        const pct = p.planting ? (p.plantProgress / 3.5) * 100 : (p.defuseProgress / 5) * 100;
        setWidth(els.progressFill, 'prog', pct);
        setText(els.progressLabel, 'progLabel', p.planting ? 'MENANAM KEMBANG API…' : 'MENJINAKKAN…');
      }

      // Spectate label.
      const spec = !p.alive && s.spectate;
      els.spectate.hidden = !spec;
      if (spec) setText(els.spectate, 'spec', `Menonton: ${s.spectate.name} — tekan Q untuk ganti`);

      // Killfeed.
      let kf = '';
      for (const entry of s.killfeed.slice(-6)) {
        kf += `<div class="${entry.kind}">${entry.text}</div>`;
      }
      if (cache.kf !== kf) {
        cache.kf = kf;
        els.killfeed.innerHTML = kf;
      }

      // Banner: newest, fades after 3.5 s.
      const last = s.banners[s.banners.length - 1];
      if (last && time - last.t < 3.5) {
        els.banner.hidden = false;
        setText(els.bannerText, 'bText', last.text);
        setText(els.bannerSub, 'bSub', last.sub);
        bannerTimer = time;
      } else if (time - bannerTimer > 0.2) {
        els.banner.hidden = true;
      }

      drawMinimap(sim);
      renderBuy(sim);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(angleRad) {
      els.damage.style.transform = `translate(-50%,-50%) rotate(${angleRad}rad)`;
      els.damage.classList.add('on');
      setTimeout(() => els.damage.classList.remove('on'), 350);
    },
    showOverlay(mode, title, copy, action) {
      els.overlayTitle.textContent = title;
      els.overlayCopy.textContent = copy;
      els.play.textContent = action;
      els.overlay.hidden = false;
      els.play.focus();
      els.overlay.dataset.mode = mode;
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
    overlayMode() {
      return els.overlay.dataset.mode || '';
    },
  };
}
