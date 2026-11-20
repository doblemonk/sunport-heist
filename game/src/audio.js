// audio.js — synthesised sound for Sunport Heist.
// Every sound is built with the Web Audio API: oscillators, noise buffers
// and gain envelopes only. No audio files, no network requests.
// The audio context is created lazily on the first user gesture (browsers
// block audio before one), and every method is safe to call at any time —
// before the context exists, before the first gesture, or while muted,
// each call simply does nothing instead of throwing.
// The factory takes the game object but reads nothing from it except an
// optional rng fallback; it must not depend on any other module's internals.

export function createAudio(game) {
  var rng = (game && game.rng) || null;
  function rand() {
    try {
      if (rng && typeof rng.next === 'function') return rng.next();
    } catch (e) { /* fall through */ }
    return 0.5;
  }

  var ctx = null;
  var master = null;
  var musicGain = null;
  var engineOsc = null;
  var engineOsc2 = null;
  var engineGain = null;
  var engineFilter = null;
  var sirenOsc = null;
  var sirenOsc2 = null;
  var sirenGain = null;
  var sirenLfo = null;
  var sirenLfoGain = null;
  var noiseBuffer = null;
  var musicTimer = null;
  var musicStep = 0;
  var started = false;
  var muted = false;

  function ensureContext() {
    if (ctx) return ctx;
    try {
      var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.34;
      musicGain.connect(master);
      // Shared white-noise buffer for percussive sounds.
      var len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      buildEngine();
      buildSiren();
    } catch (e) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  function resumeContext() {
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* ignore */ }
  }

  function buildEngine() {
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineFilter.Q.value = 1.2;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
    } catch (e) { /* engine stays silent */ }
  }

  function buildSiren() {
    try {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 760;
      sirenOsc2 = ctx.createOscillator();
      sirenOsc2.type = 'sine';
      sirenOsc2.frequency.value = 760;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'sine';
      sirenLfo.frequency.value = 0.55;
      sirenLfoGain = ctx.createGain();
      sirenLfoGain.gain.value = 180;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenLfoGain.connect(sirenOsc2.frequency);
      sirenOsc.connect(sirenGain);
      sirenOsc2.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenOsc2.start();
      sirenLfo.start();
    } catch (e) { /* siren stays silent */ }
  }

  // Short tone helper: oscillator with a quick attack and exponential decay.
  function blip(type, freqStart, freqEnd, dur, vol, when) {
    if (!ctx || !master) return;
    try {
      var t = ctx.currentTime + (when || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freqStart), t);
      if (freqEnd && freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) { /* ignore */ }
  }

  // Noise burst helper: filtered noise with a gain envelope.
  function noiseHit(dur, vol, filterType, filterFreq, when) {
    if (!ctx || !master || !noiseBuffer) return;
    try {
      var t = ctx.currentTime + (when || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      var filt = ctx.createBiquadFilter();
      filt.type = filterType || 'lowpass';
      filt.frequency.value = filterFreq || 1200;
      var g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.0001, vol), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch (e) { /* ignore */ }
  }

  // ---- Music: a sunny bass-and-pluck loop ----
  // Chords: C major, A minor, F major, G major — one bar each.
  // Bass plays the root on the beat; a pluck arpeggio dances above it.
  var CHORDS = [
    [130.81, 164.81, 196.00, 261.63], // C
    [110.00, 130.81, 164.81, 220.00], // Am
    [87.31, 174.61, 220.00, 261.63],  // F
    [98.00, 146.83, 196.00, 246.94]   // G
  ];
  var STEP_DUR = 0.21;
  var STEPS_PER_BAR = 8;
  var PLUCK_PATTERN = [0, 2, 3, 1, 2, 3, 2, 1];

  function pluck(freq, t, vol) {
    try {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g);
      g.connect(musicGain);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch (e) { /* ignore */ }
  }

  function bassNote(freq, t, dur, vol) {
    try {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(musicGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) { /* ignore */ }
  }

  function musicTick() {
    if (!ctx || !musicGain || muted) return;
    try {
      var bar = Math.floor(musicStep / STEPS_PER_BAR) % CHORDS.length;
      var step = musicStep % STEPS_PER_BAR;
      var chord = CHORDS[bar];
      var t = ctx.currentTime + 0.02;
      // Bass on the first and fifth steps of each bar.
      if (step === 0 || step === 4) {
        bassNote(chord[0], t, STEP_DUR * 2.2, 0.5);
      }
      // Pluck arpeggio: one bright note per step, an octave up.
      var note = chord[PLUCK_PATTERN[step]] * 2;
      pluck(note, t, 0.16);
      // A sunny sparkle on the off-beats.
      if (step % 2 === 1) {
        pluck(chord[3] * 4, t, 0.05);
      }
      musicStep++;
    } catch (e) { /* keep the loop alive */ }
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    try {
      musicTimer = setInterval(musicTick, STEP_DUR * 1000);
    } catch (e) { /* ignore */ }
  }

  function stopMusic() {
    if (musicTimer) {
      try { clearInterval(musicTimer); } catch (e) { /* ignore */ }
      musicTimer = null;
    }
  }

  // ---- Public API ----

  function start() {
    if (!ensureContext()) return false;
    resumeContext();
    started = true;
    startMusic();
    return true;
  }

  // Resume is an alias for start, so any caller can wake the audio.
  function resume() {
    return start();
  }

  function siren(on) {
    if (!ctx || !sirenGain) return;
    try {
      resumeContext();
      var t = ctx.currentTime;
      var target = on ? 0.055 : 0;
      sirenGain.gain.cancelScheduledValues(t);
      sirenGain.gain.setValueAtTime(sirenGain.gain.value, t);
      sirenGain.gain.linearRampToValueAtTime(target, t + 0.25);
    } catch (e) { /* ignore */ }
  }

  function punch() {
    if (!ensureContext()) return;
    resumeContext();
    noiseHit(0.12, 0.7, 'lowpass', 500);
    blip('sine', 160, 55, 0.14, 0.8);
  }

  function busted() {
    if (!ensureContext()) return;
    resumeContext();
    // Two descending wails, then a low thud: the arrest sound.
    siren(false);
    blip('sawtooth', 620, 310, 0.55, 0.25, 0);
    blip('sawtooth', 620, 310, 0.55, 0.25, 0.6);
    blip('sine', 120, 45, 0.4, 0.7, 1.2);
    noiseHit(0.2, 0.3, 'lowpass', 400, 1.2);
  }

  function engine(level) {
    if (!ctx || !engineGain || !engineOsc || !engineOsc2) return;
    try {
      var l = Math.max(0, Math.min(1, Number(level) || 0));
      resumeContext();
      var t = ctx.currentTime;
      engineGain.gain.cancelScheduledValues(t);
      engineGain.gain.setValueAtTime(engineGain.gain.value, t);
      engineGain.gain.linearRampToValueAtTime(l * 0.14, t + 0.08);
      engineOsc.frequency.setTargetAtTime(48 + l * 130, t, 0.06);
      engineOsc2.frequency.setTargetAtTime(24 + l * 65, t, 0.06);
      if (engineFilter) engineFilter.frequency.setTargetAtTime(280 + l * 900, t, 0.06);
    } catch (e) { /* ignore */ }
  }

  function shoot() {
    if (!ensureContext()) return;
    resumeContext();
    noiseHit(0.16, 0.85, 'highpass', 900);
    blip('square', 900, 120, 0.12, 0.35);
  }

  function pickup() {
    if (!ensureContext()) return;
    resumeContext();
    blip('sine', 660, 660, 0.1, 0.3, 0);
    blip('sine', 880, 880, 0.14, 0.3, 0.09);
  }

  function cash() {
    if (!ensureContext()) return;
    resumeContext();
    // A cheerful little coin arpeggio.
    blip('triangle', 988, 988, 0.09, 0.32, 0);
    blip('triangle', 1319, 1319, 0.09, 0.32, 0.08);
    blip('triangle', 1568, 1568, 0.18, 0.34, 0.16);
    blip('triangle', 2093, 2093, 0.22, 0.28, 0.26);
  }

  function toggleMute() {
    muted = !muted;
    try {
      if (master && ctx) {
        master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
      }
    } catch (e) { /* ignore */ }
    if (muted) stopMusic(); else if (started) startMusic();
    return muted;
  }

  function setMuted(value) {
    var want = !!value;
    if (want !== muted) return toggleMute();
    return muted;
  }

  // Start on the first user gesture: any key press or click wakes audio.
  function attachGestureListeners() {
    try {
      if (typeof window === 'undefined' || !window.addEventListener) return;
      var onGesture = function () { start(); };
      window.addEventListener('keydown', onGesture, { once: false });
      window.addEventListener('pointerdown', onGesture, { once: false });
      window.addEventListener('mousedown', onGesture, { once: false });
    } catch (e) { /* ignore */ }
  }

  attachGestureListeners();

  var audio = {
    siren: siren,
    punch: punch,
    busted: busted,
    engine: engine,
    shoot: shoot,
    gunshot: shoot,
    pickup: pickup,
    cash: cash,
    toggleMute: toggleMute,
    setMuted: setMuted,
    start: start,
    resume: resume,
    startMusic: startMusic,
    stopMusic: stopMusic,
    update: function () { /* music runs on its own timer; nothing per frame */ },
    get muted() { return muted; },
    set muted(value) { setMuted(value); }
  };

  return audio;
}

export default createAudio;
