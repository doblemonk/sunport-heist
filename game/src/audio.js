// Synthesised sound: every effect and the music loop are built from
// WebAudio oscillators and noise, so the game ships no audio files at all.
// Nothing here runs until the player first presses a key or clicks, which
// is when the browser allows an audio context to start.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  // A short, sunny bass-and-pluck loop in A minor, one bar at a time.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  const PLUCK = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 196];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, lowpass = 1200) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    const beat = 0.28;
    const i = step % 8;
    tone(BASS[i], beat * 0.9, 'triangle', 0.5);
    if (i % 2 === 0) tone(PLUCK[i], beat * 0.8, 'sine', 0.22);
    if (i === 0 || i === 4) noise(0.05, 0.12, 6000);
    step += 1;
    musicTimer = window.setTimeout(scheduleMusic, beat * 1000);
  }

  return {
    unlock() {
      if (ensure() && musicTimer === null) scheduleMusic();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    punch() { if (ensure()) { noise(0.09, 0.5, 500); tone(140, 0.1, 'sine', 0.4, 0, 60); } },
    shoot() { if (ensure()) { noise(0.14, 0.7, 3200); tone(900, 0.08, 'square', 0.2, 0, 120); } },
    siren() { if (ensure()) { tone(750, 0.5, 'sine', 0.12, 0, 950); } },
    pickup() { if (ensure()) { tone(660, 0.1, 'sine', 0.3); tone(990, 0.16, 'sine', 0.3, 0.09); } },
    cash() { if (ensure()) { tone(523, 0.1, 'triangle', 0.3); tone(659, 0.1, 'triangle', 0.3, 0.08); tone(784, 0.2, 'triangle', 0.3, 0.16); } },
    fail() { if (ensure()) { tone(220, 0.3, 'sawtooth', 0.25, 0, 110); } },
    crash() { if (ensure()) { noise(0.25, 0.6, 800); } },
    engine(on) {
      if (!ensure()) return;
      if (on && !this._engineOsc) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 70;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        this._engineOsc = osc;
        this._engineGain = gain;
      } else if (!on && this._engineOsc) {
        try { this._engineOsc.stop(); } catch { /* already stopped */ }
        this._engineOsc = null;
      }
    },
    engineSpeed(speed01) {
      if (this._engineOsc) this._engineOsc.frequency.value = 60 + speed01 * 140;
    },
  };
}
