// lofi.js — a tiny generative lofi radio built on the Web Audio API.
// Nothing is streamed: chords, drums, bass, vinyl crackle and rain are all
// synthesized live, so the music never repeats exactly and has no licensing issues.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

const QUALITIES = {
  maj9: { iv: [0, 4, 7, 11, 14], label: 'maj9' },
  maj7: { iv: [0, 4, 7, 11], label: 'maj7' },
  m9: { iv: [0, 3, 7, 10, 14], label: 'm9' },
  m7: { iv: [0, 3, 7, 10], label: 'm7' },
  m11: { iv: [0, 3, 7, 10, 14, 17], label: 'm11' },
  dom9: { iv: [0, 4, 7, 10, 14], label: '9' },
  dom7: { iv: [0, 4, 7, 10], label: '7' },
  sus: { iv: [0, 5, 7, 10, 14], label: '9sus4' },
};

// Progressions as [scale degree in semitones, quality]
const PROGRESSIONS = [
  [[2, 'm9'], [7, 'dom9'], [0, 'maj9'], [9, 'm9']],
  [[5, 'maj9'], [4, 'dom7'], [9, 'm9'], [7, 'm7']],
  [[9, 'm9'], [2, 'm9'], [7, 'sus'], [0, 'maj9']],
  [[0, 'maj9'], [2, 'm9'], [4, 'm7'], [5, 'maj9']],
  [[2, 'm11'], [7, 'dom9'], [4, 'm7'], [9, 'm9']],
  [[5, 'maj7'], [7, 'sus'], [4, 'm7'], [9, 'm11']],
];
const KEYS = [60, 62, 63, 65, 67, 68, 57]; // C, D, Eb, F, G, Ab, A
const PENTA = [0, 2, 4, 7, 9];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class LofiRadio {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.volume = 0.7;
    this.rainOn = true;
    this.listeners = {};
    this.step = 0;
    this.bar = 0;
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

  _build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;

    // Speaker-safe output stage. Laptop speakers can't reproduce deep sub-bass; feeding it to
    // them makes the drivers rattle ("buzz"). Two stacked high-passes remove the rumble below
    // ~70 Hz, a gentle dip trims the boomy low end, and a brick-wall-ish limiter guarantees the
    // signal never clips, even at full volume.
    const hp1 = ctx.createBiquadFilter();
    hp1.type = 'highpass';
    hp1.frequency.value = 75;
    hp1.Q.value = 0.7;
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = 75;
    hp2.Q.value = 0.7;
    const lowDip = ctx.createBiquadFilter();
    lowDip.type = 'lowshelf';
    lowDip.frequency.value = 160;
    lowDip.gain.value = -3;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    this.master.connect(hp1).connect(hp2).connect(lowDip).connect(this.limiter).connect(out).connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Everything musical goes through a warm low-pass + gentle compression ("tape")
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.comp.connect(this.master);

    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2600;
    this.tone.Q.value = 0.4;
    this.tone.connect(this.comp);

    this.music = ctx.createGain();
    this.music.connect(this.tone);

    // Reverb from a generated impulse response
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    const revGain = ctx.createGain();
    revGain.gain.value = 0.32;
    this.reverb.connect(revGain).connect(this.tone);

    // Keys bus with tremolo
    this.keys = ctx.createGain();
    this.keys.gain.value = 0.85;
    this.keys.connect(this.music);
    this.keys.connect(this.reverb);
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.2;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.09;
    trem.connect(tremDepth).connect(this.keys.gain);
    trem.start();

    // Tape wow / flutter: slow pitch wobble shared by all pitched voices
    this.wobble = ctx.createGain();
    this.wobble.gain.value = 7; // cents
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.33;
    wow.connect(this.wobble);
    wow.start();

    // Melody delay
    this.delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.33;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 1800;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.music);
    this.lead = ctx.createGain();
    this.lead.gain.value = 0.5;
    this.lead.connect(this.music);
    this.lead.connect(this.delay);
    this.lead.connect(this.reverb);

    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.music);

    this.noise = this._noiseBuffer(2);

    // Vinyl crackle (bypasses the tone filter so it stays crispy)
    const crackle = ctx.createBufferSource();
    crackle.buffer = this._crackleBuffer(6);
    crackle.loop = true;
    const cg = ctx.createGain();
    cg.gain.value = 0.1;
    const chp = ctx.createBiquadFilter();
    chp.type = 'highpass';
    chp.frequency.value = 900;
    crackle.connect(chp).connect(cg).connect(this.master);
    crackle.start();

    // Rain ambience
    const rain = ctx.createBufferSource();
    rain.buffer = this._pinkBuffer(4);
    rain.loop = true;
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'lowpass';
    rbp.frequency.value = 3200;
    const rhp = ctx.createBiquadFilter();
    rhp.type = 'highpass';
    rhp.frequency.value = 400;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = this.rainOn ? 0.22 : 0;
    rain.connect(rhp).connect(rbp).connect(this.rainGain).connect(this.master);
    rain.start();

    this._newSection(true);
    this.nextTime = ctx.currentTime + 0.15;
    this.timer = setInterval(() => this._tick(), 25);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _pinkBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        let v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        // sprinkle occasional "drops"
        if (Math.random() < 0.0004) v += (Math.random() * 2 - 1) * 4;
        d[i] = v * 0.11;
      }
    }
    return buf;
  }

  _crackleBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      let v = (Math.random() * 2 - 1) * 0.012; // hiss
      if (Math.random() < 0.00035) {
        const amp = rand(0.2, 0.9) * (Math.random() < 0.5 ? -1 : 1);
        const len = Math.floor(rand(8, 60));
        for (let j = 0; j < len && i + j < d.length; j++) d[i + j] += amp * Math.exp(-j / (len / 4));
      }
      d[i] += v;
    }
    return buf;
  }

  _newSection(first = false) {
    if (first || Math.random() < 0.35) this.key = pick(KEYS);
    let p;
    do p = pick(PROGRESSIONS); while (p === this.prog && PROGRESSIONS.length > 1);
    this.prog = p;
    this.bpm = Math.round(rand(70, 84));
    this.swing = rand(0.12, 0.22);
    this.kickPattern = pick([
      [0, 7, 10],
      [0, 3, 10],
      [0, 8, 11],
      [0, 6, 10, 14],
    ]);
    this.emit('section', { key: NOTE_NAMES[this.key % 12], bpm: this.bpm });
  }

  _chordAt(i) {
    const [deg, q] = this.prog[i % this.prog.length];
    const root = this.key + deg;
    return { root, q: QUALITIES[q], name: NOTE_NAMES[root % 12] + QUALITIES[q].label };
  }

  _tick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const lookahead = document.hidden ? 1.5 : 0.18;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      this._schedule(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.bar % 8 === 0) this._newSection();
      }
    }
  }

  _schedule(step, t, stepDur) {
    const s = step % 16;
    const bar = this.bar;
    const sw = s % 2 === 1 ? this.swing * stepDur * 2 : 0;
    const time = t + sw;
    const chord = this._chordAt(bar);
    const breakdown = bar % 8 === 7 && s >= 8; // little drum drop before each new section
    const intro = bar < 1;

    if (s === 0) {
      this._chord(chord, time, stepDur * 15);
      this._bass(chord.root, time, stepDur * 6);
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => this.emit('chord', { name: chord.name, next: this._chordAt(bar + 1).name }), delayMs);
    }
    if (s === 10 && Math.random() < 0.3) this._chord(chord, time, stepDur * 5, 0.45);
    if ((s === 7 || s === 10) && Math.random() < 0.45) this._bass(chord.root + (Math.random() < 0.3 ? 7 : 0), time, stepDur * 2.5, 0.6);

    // drums
    if (!breakdown && !intro) {
      if (this.kickPattern.includes(s)) this._kick(time, s === 0 ? 1 : 0.75);
      if (s === 4 || s === 12) this._snare(time, 0.9);
      if (s === 15 && Math.random() < 0.25) this._snare(time, 0.25);
      if (s % 2 === 0) this._hat(time, s % 4 === 0 ? 0.55 : 0.35 + Math.random() * 0.15);
      else if (Math.random() < 0.18) this._hat(time, 0.2);
    }

    // sparse melody
    if (s % 2 === 0 && Math.random() < (breakdown ? 0.35 : 0.14)) {
      const tones = chord.q.iv.map((i) => (chord.root + i) % 12);
      let note;
      if (Math.random() < 0.6) note = 72 + pick(tones);
      else note = 72 + ((this.key + pick(PENTA)) % 12);
      if (note > 84) note -= 12;
      this._bell(note, time, stepDur * rand(2, 5));
    }
  }

  _voice(freq, type, time, peak, attack, decayTo, dur, release, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    this.wobble.connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * decayTo), time + Math.max(attack + 0.05, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + release);
    o.connect(g).connect(dest);
    o.start(time);
    o.stop(time + dur + release + 0.05);
    o.onended = () => {
      try { this.wobble.disconnect(o.detune); } catch (_) {}
      g.disconnect();
    };
  }

  _chord(chord, time, dur, vel = 1) {
    // close voicing in a mid register, root left to the bass
    let notes = chord.q.iv.slice(1).map((i) => chord.root + i);
    notes = notes.map((n) => {
      while (n > 74) n -= 12;
      while (n < 53) n += 12;
      return n;
    });
    notes = [...new Set(notes)].sort((a, b) => a - b);
    notes.forEach((n, i) => {
      const t = time + i * 0.018 + Math.random() * 0.012;
      const v = 0.075 * vel * rand(0.8, 1);
      const f = mtof(n);
      this._voice(f, 'sine', t, v, 0.012, 0.35, dur, 1.2, this.keys);
      this._voice(f * 2, 'sine', t, v * 0.18, 0.005, 0.05, 0.4, 0.3, this.keys); // tine
      this._voice(f, 'triangle', t, v * 0.25, 0.02, 0.3, dur, 0.9, this.keys);
    });
  }

  _bass(root, time, dur, vel = 1) {
    let n = root;
    // keep the bass line at 87–165 Hz: still warm on headphones, but inside what laptop speakers can play
    while (n > 52) n -= 12;
    while (n < 41) n += 12;
    this._voice(mtof(n), 'sine', time, 0.22 * vel, 0.02, 0.5, dur, 0.25, this.music);
    this._voice(mtof(n), 'triangle', time, 0.08 * vel, 0.02, 0.3, dur * 0.6, 0.2, this.music);
    this._voice(mtof(n) * 2, 'sine', time, 0.07 * vel, 0.02, 0.4, dur * 0.8, 0.2, this.music); // octave up: audible on laptops
  }

  _bell(n, time, dur) {
    const f = mtof(n);
    this._voice(f, 'sine', time, 0.06, 0.008, 0.2, dur, 0.8, this.lead);
    this._voice(f * 3, 'sine', time, 0.008, 0.004, 0.05, 0.25, 0.2, this.lead);
  }

  _noise(time, dur, filterType, freq, q, gain, dest = this.drums) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(time, Math.random() * 1.5, dur + 0.05);
  }

  _kick(time, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(65, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.75 * vel, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    o.connect(g).connect(this.drums);
    o.start(time);
    o.stop(time + 0.55);
    // duck the keys a little (sidechain feel)
    const kg = this.keys.gain;
    kg.cancelScheduledValues(time);
    kg.setValueAtTime(0.85, time);
    kg.linearRampToValueAtTime(0.6, time + 0.02);
    kg.linearRampToValueAtTime(0.85, time + 0.3);
  }

  _snare(time, vel) {
    this._noise(time, 0.22, 'bandpass', 1700, 0.7, 0.42 * vel);
    this._noise(time, 0.08, 'highpass', 5000, 0.5, 0.1 * vel);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, time);
    o.frequency.exponentialRampToValueAtTime(150, time + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2 * vel, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    o.connect(g).connect(this.drums);
    o.start(time);
    o.stop(time + 0.15);
  }

  _hat(time, vel) {
    this._noise(time, rand(0.03, 0.06), 'highpass', 7500, 0.6, 0.16 * vel);
  }

  async play() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.volume, now + 1.5);
    if (this.nextTime < now) this.nextTime = now + 0.1;
    this.playing = true;
    this.emit('state', true);
  }

  async pause() {
    if (!this.ctx) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.4);
    this.playing = false;
    this.emit('state', false);
    setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 450);
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  skip() {
    if (!this.ctx) return;
    this._newSection(true);
    this.bar = 0;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.playing) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setRain(on) {
    this.rainOn = on;
    if (this.ctx) this.rainGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.4);
    this.emit('rain', on);
  }

  levels(out) {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(out);
    return out;
  }
}
