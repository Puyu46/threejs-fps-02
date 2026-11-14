// Synthesised sound: no audio files, no network. A noise buffer and a few oscillators
// make the gunshots, reload clicks, explosion, plant beeps and round stings. Everything
// is guarded: in a headless browser the context may not exist, and the game must still
// run silently.
export function createAudio() {
  let context = null;
  let noiseBuffer = null;
  let master = null;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    const ctx = ensure();
    if (!ctx) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + when;
      gain.gain.setValueAtTime(gainValue, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      source.connect(filter).connect(gain).connect(master);
      source.start(t);
      source.stop(t + duration + 0.02);
    } catch { /* silent */ }
  }

  function tone(freq, duration, type, gainValue, when = 0, slideTo = 0) {
    const ctx = ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      const t = ctx.currentTime + when;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch { /* silent */ }
  }

  return {
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'shotgun') noise(0.22, 900, 0.9);
      else if (kind === 'pistol') noise(0.12, 1600, 0.6);
      else if (kind === 'smg') noise(0.09, 2000, 0.45);
      else noise(0.14, 1300, 0.7);
      tone(140, 0.08, 'square', 0.12, 0, 60);
    },
    enemyShot(distance) {
      const volume = Math.max(0.08, 0.55 - distance * 0.012);
      noise(0.12, 1100, volume);
    },
    dryClick() {
      tone(1800, 0.04, 'square', 0.15);
    },
    reload() {
      tone(900, 0.05, 'square', 0.12);
      tone(600, 0.05, 'square', 0.12, 0.18);
      tone(1200, 0.05, 'square', 0.14, 0.5);
    },
    hit() {
      tone(2400, 0.05, 'sine', 0.18);
    },
    kill() {
      tone(1600, 0.07, 'sine', 0.2);
      tone(2400, 0.09, 'sine', 0.2, 0.07);
    },
    explosion() {
      noise(0.9, 320, 1.0);
      tone(70, 0.7, 'sine', 0.7, 0, 28);
    },
    plantBeep() {
      tone(1200, 0.08, 'sine', 0.2);
    },
    bombBeep() {
      tone(1500, 0.06, 'sine', 0.16);
    },
    defuseBeep() {
      tone(900, 0.1, 'sine', 0.18);
    },
    roundWin() {
      tone(523, 0.14, 'sine', 0.2);
      tone(659, 0.14, 'sine', 0.2, 0.13);
      tone(784, 0.22, 'sine', 0.22, 0.26);
    },
    roundLose() {
      tone(392, 0.16, 'sine', 0.2);
      tone(330, 0.16, 'sine', 0.2, 0.15);
      tone(262, 0.3, 'sine', 0.22, 0.3);
    },
    buy() {
      tone(1000, 0.06, 'sine', 0.18);
      tone(1400, 0.08, 'sine', 0.18, 0.06);
    },
  };
}
