// audio.js — Sunport Heist: every sound is synthesised with the Web Audio API.
//
// No audio files, no network requests. The module builds one lazy
// AudioContext (created on the first key press or click, never before),
// a sunny bass-and-pluck music loop, an engine hum, a two-tone siren,
// and short one-shot effects for punches, gunshots, pickups, cash and
// the arrest sting. Every WebAudio call is guarded, so a missing,
// suspended or denied context can never throw into the game loop.
//
// Contract (the four methods other systems call):
//   siren(on)     — start or stop the two-tone police siren.
//   punch()       — one short punchy thud.
//   busted()      — the descending arrest sting.
//   engine(level) — engine hum, level 0..1 (silent at 0).
// Extra one-shots the combat and pickup systems may call:
//   gunshot(), pickup(), cash().
//   setMuted(muted) / toggleMute() — the M key mutes everything.

export function createAudio(game) {
  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  // MIDI note number to frequency in hertz.
  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  let ctx = null;            // AudioContext, created lazily on gesture
  let master = null;         // master gain (mute lives here)
  let musicBus = null;       // gain for the music loop
  let sfxBus = null;         // gain for one-shot effects
  let engineBus = null;      // gain for the engine hum
  let sirenBus = null;       // gain for the siren
  let noiseBuffer = null;    // shared white-noise buffer for percussive hits

  let started = false;       // true once the context exists and is running
  let muted = false;         // M key state
  let musicTimer = null;     // setInterval handle for the music scheduler
  let sirenTimer = null;     // setInterval handle for the siren alternation
  let sirenOn = false;       // whether the siren is currently sounding
  let sirenHigh = false;     // which of the two siren tones is sounding
  let engineLevel = 0;       // last engine level, 0..1
  let engineOscA = null;     // sawtooth engine voice
  let engineOscB = null;     // sine sub engine voice
  let engineFilter = null;   // low-pass filter shaping the engine hum
  let engineGain = null;     // per-voice engine gain
  let sirenOsc = null;       // the single siren oscillator
  let sirenGain = null;      // per-voice siren gain

  // Music sequencer state. The loop is a fixed 16-step bar in C major,
  // sunny and bouncy: a walking bass on the roots and a pluck melody
  // that dances on the pentatonic. Everything is deterministic — the
  // same bar repeats, so the game hears the same tune every run.
  const MUSIC_BPM = 112;
  const STEP_SECONDS = 60 / MUSIC_BPM / 2; // eighth notes
  const BAR_STEPS = 16;

  // Bass roots, one per bar, cycling C - F - G - F (MIDI notes).
  const BASS_ROOTS = [36, 41, 43, 41];
  // Pluck melody, one MIDI note per eighth-note step, 0 means rest.
  // C major pentatonic, written to bounce against the bass roots.
  const PLUCK_MELODY = [
    72, 0, 76, 79, 0, 76, 72, 0,
    74, 0, 77, 81, 79, 76, 74, 0,
  ];

  let musicBar = 0;          // which bar of the four-bar loop we are in
  let musicStep = 0;         // which eighth-note step inside the bar
  let musicNextTime = 0;     // AudioContext time of the next step

  // ------------------------------------------------------------------
  // Context setup (lazy — only on the first user gesture)
  // ------------------------------------------------------------------

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* suspended context: stay quiet */ }
      }
      return !!ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return false;
    }

    try {
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.34;
      musicBus.connect(master);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);

      engineBus = ctx.createGain();
      engineBus.gain.value = 0;
      engineBus.connect(master);

      sirenBus = ctx.createGain();
      sirenBus.gain.value = 0;
      sirenBus.connect(master);

      // One second of white noise, shared by every percussive sound.
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (e) {
      ctx = null;
      return false;
    }

    started = true;
    startEngineVoice();
    startMusic();
    if (sirenOn) startSirenVoice();
    return true;
  }

  // First key press or click anywhere starts the sound. The listeners
  // remove themselves after the first gesture; resume() also runs on
  // later gestures in case the context was suspended by the browser.
  function onFirstGesture() {
    ensureContext();
  }

  try {
    window.addEventListener('keydown', onFirstGesture, { once: true });
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('click', onFirstGesture, { once: true });
  } catch (e) {
    // No window (headless check): the game still works, just silently.
  }

  // ------------------------------------------------------------------
  // Primitive voices — each one guards its own WebAudio calls
  // ------------------------------------------------------------------

  // A short pitched blip: oscillator + gain envelope, then stop.
  function blip(freq, dur, type, vol, when, slideTo) {
    if (!ctx) return;
    try {
      const t = when || ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(sfxBus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) { /* never let a voice throw */ }
  }

  // A burst of filtered noise: the body of punches, gunshots and thuds.
  function noiseHit(dur, vol, filterFreq, filterType, when) {
    if (!ctx || !noiseBuffer) return;
    try {
      const t = when || ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = filterType || 'lowpass';
      filt.frequency.value = filterFreq || 800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(sfxBus);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch (e) { /* never let a voice throw */ }
  }

  // A plucked string: triangle wave with a fast attack and a bright,
  // quickly decaying tail, plus a touch of detuned shimmer.
  function pluck(freq, when, vol) {
    if (!ctx) return;
    try {
      const t = when || ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      osc.connect(g);
      osc2.connect(g2);
      g2.connect(g);
      g.connect(musicBus);
      osc.start(t);
      osc2.start(t);
      osc.stop(t + 0.5);
      osc2.stop(t + 0.5);
    } catch (e) { /* never let a voice throw */ }
  }

  // A warm bass note: sine plus a soft square an octave down, short.
  function bassNote(freq, when, vol) {
    if (!ctx) return;
    try {
      const t = when || ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = freq / 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP_SECONDS * 1.8);
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      osc.connect(g);
      osc2.connect(g2);
      g2.connect(g);
      g.connect(musicBus);
      osc.start(t);
      osc2.start(t);
      osc.stop(t + STEP_SECONDS * 2);
      osc2.stop(t + STEP_SECONDS * 2);
    } catch (e) { /* never let a voice throw */ }
  }

  // ------------------------------------------------------------------
  // Music loop — sunny bass and pluck, scheduled a little ahead
  // ------------------------------------------------------------------

  function scheduleStep(step, bar, when) {
    // Bass: root on steps 0, 4, 8, 12, with a fifth on step 10.
    const root = BASS_ROOTS[bar % BASS_ROOTS.length];
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      bassNote(midiToFreq(root), when, 0.5);
    }
    if (step === 10) {
      bassNote(midiToFreq(root + 7), when, 0.35);
    }
    // Pluck melody on top.
    const note = PLUCK_MELODY[step % PLUCK_MELODY.length];
    if (note) pluck(midiToFreq(note), when, 0.32);
    // A soft shaker tick on every off-beat keeps the sun shining.
    if (step % 2 === 1) {
      noiseTick(when, 0.05);
    }
  }

  // Very short high-passed noise tick, used as the music shaker.
  function noiseTick(when, vol) {
    if (!ctx || !noiseBuffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      src.connect(filt);
      filt.connect(g);
      g.connect(musicBus);
      src.start(when);
      src.stop(when + 0.08);
    } catch (e) { /* never let a voice throw */ }
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    try {
      musicBar = 0;
      musicStep = 0;
      musicNextTime = ctx.currentTime + 0.06;
      musicTimer = setInterval(function () {
        if (!ctx) return;
        try {
          // Schedule every step up to a tenth of a second ahead.
          while (musicNextTime < ctx.currentTime + 0.12) {
            scheduleStep(musicStep, musicBar, musicNextTime);
            musicNextTime += STEP_SECONDS;
            musicStep++;
            if (musicStep >= BAR_STEPS) {
              musicStep = 0;
              musicBar++;
            }
          }
        } catch (e) { /* scheduler hiccup: skip this tick */ }
      }, 40);
    } catch (e) { /* timers unavailable: music stays off */ }
  }

  function stopMusic() {
    if (musicTimer) {
      try { clearInterval(musicTimer); } catch (e) { /* already cleared */ }
      musicTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Engine hum — two oscillators whose pitch and loudness follow level
  // ------------------------------------------------------------------

  function startEngineVoice() {
    if (!ctx || engineOscA) return;
    try {
      engineOscA = ctx.createOscillator();
      engineOscA.type = 'sawtooth';
      engineOscA.frequency.value = 42;
      engineOscB = ctx.createOscillator();
      engineOscB.type = 'sine';
      engineOscB.frequency.value = 84;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineFilter.Q.value = 1.2;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOscA.connect(engineFilter);
      engineOscB.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(engineBus);
      engineOscA.start();
      engineOscB.start();
    } catch (e) {
      engineOscA = null;
      engineOscB = null;
    }
  }

  function engine(level) {
    engineLevel = clamp(level || 0, 0, 1);
    if (!ctx || !engineOscA || !engineGain) return;
    try {
      const t = ctx.currentTime;
      const freq = 42 + engineLevel * 96;
      engineOscA.frequency.setTargetAtTime(freq, t, 0.08);
      engineOscB.frequency.setTargetAtTime(freq * 2, t, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + engineLevel * 900, t, 0.1);
      // Silent at 0, a gentle hum at cruise, louder under full throttle.
      engineGain.gain.setTargetAtTime(engineLevel * 0.16, t, 0.08);
    } catch (e) { /* engine voice unavailable: stay quiet */ }
  }

  // ------------------------------------------------------------------
  // Siren — a single oscillator alternating between two tones
  // ------------------------------------------------------------------

  function startSirenVoice() {
    if (!ctx || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(sirenBus);
      sirenOsc.start();
      sirenGain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.05);
      sirenHigh = false;
      sirenTimer = setInterval(function () {
        if (!sirenOsc) return;
        try {
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(
            sirenHigh ? 950 : 700, ctx.currentTime, 0.03
          );
        } catch (e) { /* siren tick failed: keep the current tone */ }
      }, 380);
    } catch (e) {
      sirenOsc = null;
    }
  }

  function stopSirenVoice() {
    if (sirenTimer) {
      try { clearInterval(sirenTimer); } catch (e) { /* already cleared */ }
      sirenTimer = null;
    }
    if (sirenOsc && sirenGain) {
      try {
        const osc = sirenOsc;
        const g = sirenGain;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(function () {
          try { osc.stop(); } catch (e) { /* already stopped */ }
          try { osc.disconnect(); } catch (e) { /* already disconnected */ }
        }, 300);
      } catch (e) { /* siren teardown failed: leave it silent */ }
    }
    sirenOsc = null;
    sirenGain = null;
  }

  function siren(on) {
    sirenOn = !!on;
    if (!ctx) {
      // No context yet: remember the request; the gesture that creates
      // the context will start the siren if it is still wanted.
      return;
    }
    try {
      if (sirenOn) startSirenVoice();
      else stopSirenVoice();
    } catch (e) { /* siren unavailable: stay quiet */ }
  }

  // ------------------------------------------------------------------
  // One-shot effects
  // ------------------------------------------------------------------

  function punch() {
    if (!ensureContext()) return;
    // A thud: low sine drop plus a short noise slap.
    blip(160, 0.14, 'sine', 0.7, 0, 55);
    noiseHit(0.09, 0.5, 500, 'lowpass');
  }

  function gunshot() {
    if (!ensureContext()) return;
    // A crack: bright noise burst with a fast low thump underneath.
    noiseHit(0.16, 0.9, 2600, 'highpass');
    noiseHit(0.12, 0.6, 300, 'lowpass');
    blip(220, 0.08, 'square', 0.25, 0, 60);
  }

  function pickup() {
    if (!ensureContext()) return;
    // A friendly two-note blip, rising.
    const t = ctx.currentTime;
    blip(midiToFreq(76), 0.12, 'sine', 0.5, t);
    blip(midiToFreq(81), 0.18, 'sine', 0.5, t + 0.09);
  }

  function cash() {
    if (!ensureContext()) return;
    // A coin arpeggio: three bright notes climbing, then a sparkle.
    const t = ctx.currentTime;
    blip(midiToFreq(88), 0.1, 'triangle', 0.5, t);
    blip(midiToFreq(91), 0.1, 'triangle', 0.5, t + 0.08);
    blip(midiToFreq(96), 0.22, 'triangle', 0.55, t + 0.16);
    blip(midiToFreq(100), 0.18, 'sine', 0.3, t + 0.24);
  }

  function busted() {
    if (!ensureContext()) return;
    // The arrest sting: four descending notes, low and final.
    const t = ctx.currentTime;
    const notes = [62, 58, 55, 50];
    for (let i = 0; i < notes.length; i++) {
      blip(midiToFreq(notes[i]), 0.34, 'triangle', 0.55, t + i * 0.26);
    }
    // A low drum hit under the last note.
    blip(70, 0.5, 'sine', 0.7, t + notes.length * 0.26, 38);
    // Silence the siren and the engine: the chase is over.
    siren(false);
    engine(0);
  }

  // ------------------------------------------------------------------
  // Mute
  // ------------------------------------------------------------------

  function setMuted(m) {
    muted = !!m;
    if (master && ctx) {
      try {
        master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
      } catch (e) { /* mute failed: keep the old level */ }
    }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  // ------------------------------------------------------------------
  // Public object — the four contract methods first, extras after
  // ------------------------------------------------------------------

  const audio = {
    siren: siren,
    punch: punch,
    busted: busted,
    engine: engine,
    gunshot: gunshot,
    pickup: pickup,
    cash: cash,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
    isStarted: function () { return started; },
    engineLevel: function () { return engineLevel; },
    // Lets the entry point start sound from its own first-gesture
    // handler without waiting for this module's listeners.
    unlock: ensureContext,
    // Stops the music and siren timers (used when the page unloads).
    dispose: function () {
      stopMusic();
      stopSirenVoice();
    },
  };

  // Wire the game's event hub if it exists: a gunshot event plays the
  // shot sound, a busted event plays the arrest sting. Everything is
  // guarded, so a missing hub changes nothing.
  try {
    if (game && game.events && typeof game.events.on === 'function') {
      game.events.on('gunshot', function () { gunshot(); });
      game.events.on('busted', function () { busted(); });
    }
  } catch (e) { /* event wiring failed: direct calls still work */ }

  return audio;
}
