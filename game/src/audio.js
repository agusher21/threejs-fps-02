// Synthesised sound effects: every sound is a WebAudio oscillator or filtered
// noise burst, so the game ships no audio files and makes no network request.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() {
      ensure();
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    shot(kind) {
      if (kind === 'sniper') noiseBurst(0.28, 900, 0.9);
      else if (kind === 'rifle') noiseBurst(0.12, 1800, 0.55);
      else if (kind === 'smg') noiseBurst(0.08, 2400, 0.4);
      else noiseBurst(0.1, 1500, 0.45);
      tone(160, 0.06, 0.25, 'square', 60);
    },
    distantShot() {
      noiseBurst(0.15, 700, 0.16);
    },
    reload() {
      tone(1200, 0.05, 0.2, 'square');
      setTimeout(() => tone(900, 0.05, 0.2, 'square'), 260);
    },
    dryClick() {
      tone(2000, 0.03, 0.15, 'square');
    },
    hit() {
      tone(2400, 0.05, 0.3, 'sine');
    },
    kill() {
      tone(1800, 0.07, 0.3, 'sine');
      setTimeout(() => tone(2600, 0.09, 0.3, 'sine'), 70);
    },
    hurt() {
      tone(220, 0.12, 0.3, 'sawtooth', 110);
    },
    plantBeep() {
      tone(880, 0.09, 0.35, 'sine');
    },
    defuseBeep() {
      tone(1320, 0.06, 0.25, 'sine');
    },
    explosion() {
      noiseBurst(0.9, 300, 1.0);
      tone(70, 0.7, 0.6, 'sine', 30);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.3, 'triangle'), i * 110));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.3, 'triangle'), i * 120));
    },
    buy() {
      tone(980, 0.06, 0.25, 'sine');
      setTimeout(() => tone(1318, 0.08, 0.25, 'sine'), 60);
    },
    denied() {
      tone(180, 0.12, 0.3, 'square', 120);
    },
    footstep() {
      noiseBurst(0.05, 500, 0.08);
    },
  };
}
