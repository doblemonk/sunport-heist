// Sunport Heist — audio
// Every sound is synthesised with WebAudio: no audio files, no network.
// A sunny bass-and-pluck music loop, an engine hum, a two-tone siren and
// one-shot effects. Nothing plays before the first user gesture unlocks
// the context, and every method is safe to call before ensure().

export function createAudio(game) {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  // A bright, sunny progression: C major, A minor, F major, G major.
  const CHORDS = [
    [261.63, 329.63, 392.0], // C
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [196.0, 246.94, 293.66], // G
  ];
  const BASS = [130.81, 110.0, 87.31, 98.0];
  const PLUCK_NOTES = [523.25, 659.25, 783.99, 880.0, 659.25, 523.25, 587.33, 783.99];
  const STEP_MS = 190;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  function setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || !master) return;
    const t0 = when == null ? ctx.currentTime : when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || !master) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Noise from the seeded rng, so gunshots stay deterministic.
    for (let i = 0; i < len; i++) {
      data[i] = (game.rng && game.rng.next ? game.rng.next() : 0.5) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  function musicTick() {
    if (!ctx || !musicGain) return;
    const bar = Math.floor(musicStep / 8) % CHORDS.length;
    const beat = musicStep % 8;
    const chord = CHORDS[bar];
    const t = ctx.currentTime;
    // Soft bass on the first and fifth eighth-notes of each bar.
    if (beat === 0 || beat === 4) {
      tone(BASS[bar], 0.42, 'triangle', 0.32, t);
    }
    // Plucked melody note on every other step, cycling the pattern.
    if (beat % 2 === 0) {
      const note = PLUCK_NOTES[(musicStep / 2) % PLUCK_NOTES.length | 0];
      tone(note, 0.16, 'square', 0.07, t);
    }
    // A gentle chord pad at the top of each bar.
    if (beat === 0) {
      chord.forEach((f) => tone(f, 1.4, 'sine', 0.045, t));
    }
    musicStep++;
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 1;
      musicGain.connect(master);
    }
    musicStep = 0;
    musicTick();
    musicTimer = setInterval(musicTick, STEP_MS);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function engine(level) {
    if (!ctx) return;
    const target = Math.max(0, Math.min(1, level || 0));
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(55 + target * 165, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + target * 1400, t, 0.08);
    engineGain.gain.setTargetAtTime(target * 0.14, t, 0.08);
  }

  function siren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 780;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 190;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } else if (!on && sirenOsc) {
      try {
        sirenOsc.stop();
        sirenLfo.stop();
      } catch (e) {
        // Already stopped; nothing to do.
      }
      sirenOsc = null;
      sirenLfo = null;
      sirenGain = null;
    }
  }

  function shoot() {
    if (!ctx) return;
    noiseBurst(0.12, 0.5, 2600);
    tone(190, 0.09, 'square', 0.22, ctx.currentTime, 60);
  }

  function punch() {
    if (!ctx) return;
    tone(120, 0.1, 'sine', 0.5, ctx.currentTime, 45);
    noiseBurst(0.06, 0.25, 500);
  }

  function pickup() {
    if (!ctx) return;
    tone(660, 0.09, 'sine', 0.25);
    tone(990, 0.14, 'sine', 0.25, ctx.currentTime + 0.08);
  }

  function cash() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1108.7, 1318.5].forEach((f, i) => tone(f, 0.12, 'triangle', 0.22, t + i * 0.07));
  }

  function hit() {
    if (!ctx) return;
    tone(90, 0.18, 'sawtooth', 0.3, ctx.currentTime, 40);
    noiseBurst(0.1, 0.3, 700);
  }

  function busted() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 311.1, 261.6, 196].forEach((f, i) => tone(f, 0.32, 'triangle', 0.25, t + i * 0.22));
  }

  function missionDone() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, t + i * 0.11));
  }

  function click() {
    if (!ctx) return;
    tone(1200, 0.04, 'square', 0.12);
  }

  function update(dt) {
    // Audio is driven by events and the engine() call; nothing per frame.
  }

  return {
    ensure,
    setMuted,
    get muted() {
      return muted;
    },
    startMusic,
    stopMusic,
    engine,
    siren,
    shoot,
    punch,
    pickup,
    cash,
    hit,
    busted,
    missionDone,
    click,
    update,
  };
}
