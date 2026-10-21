// The casino's sound, on the Web Audio API. Five buses under one master: the table (cards, chips,
// stings, through a small room), the dealer's voice, the room around you, music, and the menus (ui: dry,
// at the table's level). Voice ducks the room and the music while it speaks. Kit clips (sounds/kit) load when first needed.
// Table sound: Every clip is trimmed to its onset so it can be fired on
// the exact frame a card or chip lands. Each play picks a different take and varies pitch and
// level slightly (no machine-gun repeats), is placed left/right by where it happens on the table,
// and passes through a small room so the table sounds like one place rather than dry samples.
const takes = (name, n) => Array.from({ length: n }, (_, i) => `${name}-${i + 1}`);
// One gesture, one sound. Each event belongs to a channel with a fixed number of voices: the card
// channel is monophonic (a new card sound cleanly takes over from the last), chips allow two.
// A voice is only taken over by an equal or more important sound, or once the old
// one has had its moment; otherwise the newcomer is dropped. `gap` stops rapid repeats.
const EVENTS = {
  slide:   { ch: 'cards', prio: 2, clips: ['card-slide-3', 'card-slide-4', 'card-slide-7', 'card-slide-8'], gain: .42, pitch: .05 },   // out of the shoe, across the cloth
  turn:    { ch: 'cards', prio: 3, clips: ['card-place-1', 'card-place-3', 'hael-draw'], gain: .36, pitch: .05 },                   // the snap of a card turned face up
  land:    { ch: 'cards', prio: 1, clips: ['card-place-2', 'card-place-4'], gain: .2, pitch: .04 },                                 // a packet settling
  gather:  { ch: 'cards', prio: 2, clips: takes('card-shove', 4), gain: .3, pitch: .04, gap: 220 },
  square:  { ch: 'cards', prio: 2, clips: ['card-fan-1'], gain: .22, pitch: .03 },
  shuffle: { ch: 'cards', prio: 4, clips: ['card-shuffle'], gain: .34, pitch: 0 },
  chip:    { ch: 'chips', prio: 2, clips: takes('chip-lay', 3), gain: .5, pitch: .05, gap: 40 },          // a chip onto the cloth
  stack:   { ch: 'chips', prio: 2, clips: takes('chips-collide', 4), gain: .44, pitch: .06, gap: 40 },    // a chip onto chips
  payout:  { ch: 'chips', prio: 3, clips: ['chips-stack-1', 'chips-stack-2', 'chips-stack-4', 'chips-stack-5', 'chips-stack-6'], gain: .42, pitch: .05, gap: 160 },
  collect: { ch: 'chips', prio: 3, clips: ['chips-handle-1', 'chips-handle-3', 'chips-handle-4', 'chips-handle-6'], gain: .38, pitch: .04, gap: 180 },
};
const CHANNELS = { cards: 1, chips: 2 };
const HOLD = 140;   // ms a sound keeps its voice against a less important one
const CLIPS = [...new Set(Object.values(EVENTS).flatMap(e => e.clips))];
// Levels for each bus, before your own sliders.
const BUS = { table: 1, voice: 1, room: .16, music: .22, ui: .7 };
const DUCK = .42;   // how far the room and the music dip under the dealer's voice

export class TableAudio {
  constructor() {
    this.enabled = true; this.volume = .8; this.buffers = new Map(); this.last = new Map(); this.next = {};
    this.voices = Object.fromEntries(Object.keys(CHANNELS).map(c => [c, []]));
    const AC = window.AudioContext || window.webkitAudioContext; this.available = !!AC;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    // a light bus compressor keeps chip showers from clipping
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = .003; comp.release.value = .12;
    this.dry = this.ctx.createGain(); this.wet = this.ctx.createGain(); this.wet.gain.value = .14;
    const verb = this.ctx.createConvolver(); verb.buffer = this.room(.55);
    this.dry.connect(comp); this.wet.connect(verb).connect(comp); comp.connect(this.master).connect(this.ctx.destination);
    // the other buses: table (above, through `comp`) · voice · room · music · ui, each with your level
    this.levels = { table: 1, voice: 1, music: 1 };
    this.bus = {};
    this.bus.table = this.ctx.createGain(); this.bus.table.connect(this.dry); this.bus.table.connect(this.wet);
    for (const b of ['voice', 'room', 'music', 'ui']) { this.bus[b] = this.ctx.createGain(); this.bus[b].connect(b === 'voice' || b === 'ui' ? comp : this.master); }   // menus stay dry, out of the room
    this.applyLevels(0);
    this.kit = new Map(); this.voiceNow = null; this.loops = {};
    this.ready = Promise.all(CLIPS.map(name => fetch(new URL(`./sounds/${name}.wav`, import.meta.url)).then(r => r.arrayBuffer()).then(b => this.decode(b)).then(buf => this.buffers.set(name, buf)).catch(() => null)));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.ctx.suspend(); this.musicEl?.pause(); }
      else this.revive();
    });
    // iOS stops the context under a call, Siri or another app's audio ('interrupted', then 'suspended') and a page
    // back from the back-forward cache comes back stopped: try at once, and the controller's next gesture does
    // the rest if the browser wants one (see `running`)
    this.ctx.onstatechange = () => { if (this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !document.hidden) this.revive(); };
    addEventListener('pageshow', () => this.revive());
  }
  revive() { if (!this.unlocked || document.hidden) return; if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); if (this.enabled && this.musicEl?.paused) this.musicEl.play().catch(() => {}); }
  // false while sound waits for a gesture: never started, or stopped since and not yet back
  get running() { return !this.available || (this.unlocked && this.ctx.state === 'running'); }
  // `rate`: decoded at this sample rate rather than the device's (44.1 or 48 kHz), for a long clip with nothing above half of it
  decode(bytes, rate = 0) {
    let c = this.ctx; if (rate && rate < c.sampleRate) try { c = new OfflineAudioContext(2, 1, rate); } catch { /* the device's rate, then */ }
    return new Promise((res, rej) => { const p = c.decodeAudioData(bytes, res, rej); if (p?.then) p.then(res, rej); });
  }
  // A small, warm room: decaying noise, darker as it fades.
  room(seconds) {
    const rate = this.ctx.sampleRate, n = Math.floor(rate * seconds), buf = this.ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / n, a = .5 - .45 * t; lp = lp + a * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - t, 3.2) * (i < rate * .008 ? i / (rate * .008) : 1); }
    }
    return buf;
  }
  unlock() {
    if (!this.available) return; this.unlocked = true;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }   // play even with the ring switch on silent
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.enabled && this.musicEl?.paused) this.musicEl.play().catch(() => {});
  }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .02); }
  setEnabled(on) {
    this.enabled = on;
    if (!this.available) return;
    for (const b of ['room', 'music']) this.bus[b].gain.setTargetAtTime(on ? this.target(b) : 0, this.ctx.currentTime, .15);
    if (this.musicEl) { if (on && this.unlocked) this.musicEl.play().catch(() => {}); else this.musicEl.pause(); }
  }
  // ---- the mixer -------------------------------------------------------------------------------
  // `levels`: your sliders, 0-1, for table, voice and music (the room follows the table slider).
  setLevels(l) { Object.assign(this.levels, l); this.applyLevels(.05); }
  target(b) { const lv = b === 'room' || b === 'ui' ? this.levels.table : this.levels[b]; return BUS[b] * lv * (this.ducked && (b === 'room' || b === 'music') ? DUCK : 1) * (this.enabled || b === 'table' || b === 'voice' || b === 'ui' ? 1 : 0); }
  applyLevels(tc = .05) { if (!this.bus) return; const t = this.ctx.currentTime; for (const b of Object.keys(this.bus)) this.bus[b].gain.setTargetAtTime(this.target(b), t, tc); }
  duck(on) { if (this.ducked === on) return; this.ducked = on; for (const b of ['room', 'music']) this.bus[b].gain.setTargetAtTime(this.target(b), this.ctx.currentTime, on ? .08 : .45); }
  // ---- kit clips: fetched and decoded once, on first use (or ahead, with preload) ----------------
  clip(path) {
    if (!this.available) return Promise.resolve(null);
    // the room beds (room-*) loop for the whole visit: their MP3s stop at 16 kHz, so at 32 kHz they keep every sound in a
    // third less memory (the casino bed: 7 MB, not 10)
    if (!this.kit.has(path)) this.kit.set(path, fetch(new URL(`./sounds/kit/${path}.mp3`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && this.decode(b, path.startsWith('room-') ? 32000 : 0)).catch(() => null));
    return this.kit.get(path);
  }
  preload(paths) { for (const p of paths) void this.clip(p); }
  get live() { return this.enabled && this.available && !document.hidden && this.ctx.state === 'running'; }
  // A one-off kit sound on a bus: a sting, a menu tick, the table cheering.
  async cue(path, { bus = 'table', gain = 1, rate = 1, x = 0 } = {}) {
    if (!this.live) return; const buf = await this.clip(path); if (!buf || !this.live) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain; let out = g;
    if (x && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-.7, Math.min(.7, x / 70)); g.connect(p); out = p; }
    src.connect(g); out.connect(this.bus[bus] ?? this.bus.table); src.start(); return src;
  }
  // The dealer speaks one line at a time. A more important line cuts in; a lesser one waits its
  // turn only if it is still worth saying (`fresh` ms), otherwise it is dropped.
  async say(path, { prio = 1, gain = 1, fresh = 1200 } = {}) {
    if (!this.live) return;
    const asked = performance.now(), buf = await this.clip(path);
    if (!buf || !this.live) return;
    const cur = this.voiceNow;
    if (cur && !cur.ended) {
      if (cur.prio > prio) return;
      if (cur.prio === prio) { await cur.done; if (performance.now() - asked > fresh || !this.live) return; }
      else this.release(cur);
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain; src.connect(g).connect(this.bus.voice);
    const v = { src, g, prio, ended: false }; v.done = new Promise(r => src.onended = () => { v.ended = true; if (this.voiceNow === v) { this.voiceNow = null; this.duck(false); } r(); });
    this.voiceNow = v; this.duck(true); src.start(); return v.done;
  }
  // The room: a looped bed of the casino around you, faded in and out.
  async ambience(path) {
    if (!this.available) return; const old = this.loops.room; this.loops.room = null;
    if (old) { old.g.gain.setTargetAtTime(0, this.ctx.currentTime, .6); old.src.stop(this.ctx.currentTime + 3); }
    if (!path) return; const buf = await this.clip(path); if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    // MP3 pads both ends with a little silence; loop only the sound between, so there is no gap
    const [a, b] = soundSpan(buf); src.loopStart = a; src.loopEnd = b;
    const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.bus.room); src.start(0, a);
    g.gain.setTargetAtTime(1, this.ctx.currentTime, .8); this.loops.room = { src, g };
  }
  // Music streams (it is long): a media element routed into the music bus, crossfaded on a change.
  music(path) {
    if (!this.available || this.musicPath === path) return; this.musicPath = path;
    const old = this.musicEl, oldG = this.musicGain;
    if (old) { oldG.gain.setTargetAtTime(0, this.ctx.currentTime, .7); setTimeout(() => { old.pause(); old.src = ''; }, 3500); }
    this.musicEl = null; if (!path) return;
    const el = new Audio(new URL(`./sounds/kit/${path}.mp3`, import.meta.url).href); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const g = this.ctx.createGain(); g.gain.value = 0;
    try { this.ctx.createMediaElementSource(el).connect(g).connect(this.bus.music); } catch { return; }
    this.musicEl = el; this.musicGain = g;
    if (this.enabled && this.unlocked) el.play().catch(() => {});
    g.gain.setTargetAtTime(1, this.ctx.currentTime, 1.2);
  }
  // x: where on the table it happens, in cm (the shoe is at about +28, the discard holder at -50)
  play(event, { x = 0, gain = 1 } = {}) {
    if (!this.enabled || !this.available || document.hidden || this.volume === 0 || this.ctx.state !== 'running') return;
    const e = EVENTS[event]; if (!e) return;
    const now = performance.now(); if (e.gap && now - (this.last.get(event) ?? -1e9) < e.gap) return;
    // voice allocation on the event's channel
    const voices = this.voices[e.ch] = this.voices[e.ch].filter(v => !v.ended);
    if (voices.length >= CHANNELS[e.ch]) {
      const oldest = voices[0];
      if (oldest.prio > e.prio && now - oldest.t < HOLD) return;       // something more important is still sounding
      this.release(oldest); voices.shift();
    }
    this.last.set(event, now);
    // next take, never the same twice in a row
    let i = this.next[event] ?? 0; if (e.clips.length > 1) { i = (i + 1 + Math.floor(Math.random() * (e.clips.length - 1))) % e.clips.length; } this.next[event] = i;
    const buf = this.buffers.get(e.clips[i]); if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * e.pitch;
    const g = this.ctx.createGain(); g.gain.value = e.gain * gain * (0.88 + Math.random() * .24);
    let out = g;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-.7, Math.min(.7, x / 70)); g.connect(p); out = p; }
    src.connect(g); out.connect(this.bus.table); src.start();
    const v = { src, g, prio: e.prio, t: now, ended: false }; src.onended = () => { v.ended = true; }; voices.push(v);
  }
  // A voice giving way fades over 25 ms rather than being cut, so there is no click.
  release(v) {
    if (v.ended) return; v.ended = true;
    const t = this.ctx.currentTime; try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + .025); v.src.stop(t + .03); } catch { /* already stopped */ }
  }
}

// Where the sound in a buffer starts and ends (seconds), past the encoder's silent padding.
function soundSpan(buf) {
  const d = buf.getChannelData(0), eps = 1e-4; let i = 0, j = d.length - 1;
  while (i < d.length && Math.abs(d[i]) < eps) i++;
  while (j > i && Math.abs(d[j]) < eps) j--;
  return [i / buf.sampleRate, (j + 1) / buf.sampleRate];
}
