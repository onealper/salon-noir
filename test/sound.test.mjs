import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TableAudio } from '../src/sound.mjs';

// Exercise the mixer's public controls without requiring an audio device in the Node rules suite.
// Browser QA separately checks the real graph's output, decoder, and resume behavior.
function mixer() {
  const a = Object.create(TableAudio.prototype);
  Object.assign(a, { available: true, enabled: true, unlocked: true, levels: { table: .6, voice: .8, music: .3 }, ctx: { currentTime: 10 } });
  a.bus = Object.fromEntries(['table', 'voice', 'room', 'music', 'ui'].map(b => [b, { gain: { value: 1, setTargetAtTime(v) { this.value = v; } } }]));
  return a;
}

test('Sound off silences every bus, including an active roulette roller and dealer voice', () => {
  const a = mixer(); a.setEnabled(false);
  for (const [bus, node] of Object.entries(a.bus)) assert.equal(node.gain.value, 0, `${bus} muted`);
  a.setLevels({ table: .4, voice: .2, music: .1 }); a.duck(true);
  for (const [bus, node] of Object.entries(a.bus)) assert.equal(node.gain.value, 0, `${bus} stays muted when settings or ducking change`);
});

test('Sound on restores configured mix levels and preserves voice ducking', () => {
  const a = mixer(); a.duck(true); a.setEnabled(false); a.setEnabled(true);
  const expected = { table: .6, voice: .8, room: .16 * .6 * .42, music: .22 * .3 * .42, ui: .7 * .6 };
  for (const [bus, value] of Object.entries(expected)) assert.ok(Math.abs(a.bus[bus].gain.value - value) < 1e-12, `${bus} restored`);
  a.duck(false);
  assert.ok(Math.abs(a.bus.room.gain.value - .16 * .6) < 1e-12);
  assert.ok(Math.abs(a.bus.music.gain.value - .22 * .3) < 1e-12);
});
