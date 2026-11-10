// The money wheel held to its rules: the segments, what every bet pays and returns (exactly), the table's money,
// and the physics: every spin planned for a drawn segment comes to rest in it, with nothing pushed on the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded } from './helpers.mjs';
import { SEGMENTS, COUNT, PITCH, NUMBERS, MULTIPLIERS, SPOTS, SPOT_IDS, isMultiplier, valueOf, countOf, returnOf, draw, round, outcome, WheelTable, stats } from '../src/wheel/rules.mjs';
import { plan, at, simulate, segmentAt, PHYS } from '../src/wheel/physics.mjs';

const bankOf = v => { const b = { v, get: () => b.v, set: x => { b.v = x; } }; return b; };
const index = seg => SEGMENTS.indexOf(seg);

test('the wheel: 55 segments, the rare ones spread, no two neighbours alike, three multipliers', () => {
  assert.equal(COUNT, 55); assert.equal(SEGMENTS.length, 55);
  assert.deepEqual(NUMBERS.map(countOf), [23, 15, 7, 4, 2, 1]); assert.deepEqual(MULTIPLIERS, [2, 3, 6]);
  for (let i = 0; i < COUNT; i++) assert.notEqual(SEGMENTS[i], SEGMENTS[(i + 1) % COUNT], `segments ${i} and ${i + 1}`);
  const rare = SEGMENTS.map((s, i) => isMultiplier(s) || valueOf(s) >= 10 ? i : -1).filter(i => i >= 0);
  for (let k = 0; k < rare.length; k++) { const gap = (rare[(k + 1) % rare.length] - rare[k] + COUNT) % COUNT; assert.ok(gap >= 4, `the rare segments at ${rare[k]} and ${rare[(k + 1) % rare.length]} stand apart`); }
  assert.deepEqual(SPOT_IDS, ['n1', 'n2', 'n5', 'n10', 'n20', 'n40']);
  for (const id of SPOT_IDS) { const s = SPOTS[id]; assert.equal(s.pays, s.n); assert.equal(s.max * s.n, 2000); assert.ok(Number.isInteger(s.max)); }
});

test('what a chip returns: the exact figure of every bet, each under 100%', () => {
  const want = { 1: .96503, 2: .97028, 5: .93007, 10: .98601, 20: .94755, 40: .92832 };
  for (const n of NUMBERS) {
    const r = returnOf(n);
    assert.ok(Math.abs(r - want[n]) < 6e-6, `${n} returns ${r}`); assert.ok(r < 1, `the house keeps an edge on ${n}`);
  }
  // by the rule itself, six multipliers deep (what lies deeper is under 2 in 100,000 of the figure): a bet now worth k
  // times its number, the next stop being its number, another number, or a multiplier
  const byRule = (n, k = 1, depth = 0) => { let v = countOf(n) / COUNT * (1 + n * k); if (depth < 6) for (const x of MULTIPLIERS) v += byRule(n, k * x, depth + 1) / COUNT; return v; };
  for (const n of NUMBERS) assert.ok(Math.abs(byRule(n) - returnOf(n)) < 2e-5, `${n}: ${byRule(n)} by the rule, ${returnOf(n)} by the formula`);
});

test('a round: spun again on a multiplier, and what the next number pays multiplied', () => {
  const rng = seeded(4); let multiplied = 0;
  for (let i = 0; i < 4000; i++) {
    const stops = round(rng), o = outcome(stops);
    assert.ok(!isMultiplier(SEGMENTS[stops.at(-1)])); for (const s of stops.slice(0, -1)) assert.ok(isMultiplier(SEGMENTS[s]));
    assert.equal(o.x, stops.slice(0, -1).reduce((k, s) => k * valueOf(SEGMENTS[s]), 1)); assert.ok(NUMBERS.includes(o.n)); if (o.x > 1) multiplied++;
  }
  assert.ok(multiplied > 150 && multiplied < 290, `${multiplied} of 4,000 rounds met a multiplier (3 in 55)`);
  const seen = new Set(); for (let i = 0; i < 3000; i++) { const d = draw(rng); assert.ok(d >= 0 && d < COUNT && Number.isInteger(d)); seen.add(d); } assert.equal(seen.size, COUNT);
  assert.ok(draw() >= 0 && draw() < COUNT, 'the fair draw, as the room makes it');
  assert.deepEqual(outcome([index('x3'), index('x6'), index('10')]), { stops: [index('x3'), index('x6'), index('10')], segs: ['x3', 'x6', '10'], n: 10, x: 18 });
});

test('the table: limits, undo and rebet, and every round paid as its number says', () => {
  const bank = bankOf(5000), t = new WheelTable({ bank, random: seeded(8) });
  assert.equal(t.place([['n1', 500], ['n40', 50]]), null); assert.match(t.place([['n40', 1]]), /limit on 40 is 50/); assert.match(t.place([['n3', 1]]), /Not a bet/);
  assert.match(t.place([['n1', 5000]]), /Not enough balance/); assert.equal(t.total, 550);
  assert.deepEqual(t.undo(), [['n1', 500], ['n40', 50]]); assert.equal(t.total, 0); assert.equal(t.close(), false); assert.equal(t.settle(), null);
  t.place([['n10', 100]]); t.place([['n2', 25]]); assert.equal(t.takeFrom('n2'), true); assert.equal(t.double(), null); assert.equal(t.on('n10'), 200);
  assert.equal(t.close(), true); assert.equal(bank.v, 4800);
  let r = t.settle([index('x2'), index('x3'), index('10')]);   // 10 at 6x: 60 to 1
  assert.deepEqual([r.n, r.x, r.back, r.net, r.wins[0].pay], [10, 6, 200 + 200 * 60, 12000, 12000]); assert.equal(bank.v, 4800 + 12200);
  assert.equal(t.canRebet, true); assert.equal(t.rebet(), null); assert.equal(t.close(), true);
  r = t.settle([index('1')]); assert.deepEqual([r.net, r.back, r.losses.length, r.wins.length], [-200, 0, 1, 0]);
  t.place([['n5', 10]]); t.close(); assert.equal(t.abandon(), 10); assert.equal(t.on('n5'), 10); assert.equal(t.abandon(), 0);
  // over many rounds on every number, the money adds up and comes back at the rate the rules give
  const b2 = bankOf(0), t2 = new WheelTable({ bank: b2, random: seeded(21) }), staked = {}, back = {};
  for (let i = 0; i < 60000; i++) {
    b2.v = 1e6; t2.place(SPOT_IDS.map(id => [id, 10])); t2.close(); const before = b2.v, r2 = t2.settle();
    assert.equal(b2.v, before + r2.back); assert.equal(r2.wins.length, 1); assert.equal(r2.losses.length, 5); assert.equal(r2.wins[0].pay, 10 * r2.n * r2.x);
    for (const id of SPOT_IDS) { staked[id] = (staked[id] ?? 0) + 10; } back[r2.wins[0].id] = (back[r2.wins[0].id] ?? 0) + r2.wins[0].stake + r2.wins[0].pay;
  }
  for (const id of SPOT_IDS) { const got = back[id] / staked[id], want = returnOf(SPOTS[id].n); assert.ok(Math.abs(got - want) < .06, `${id}: ${got.toFixed(3)} over 60,000 rounds, ${want.toFixed(3)} by the rules`); }
  assert.deepEqual(stats([['x2', '10'], ['1'], ['1'], ['40']]), { count: 4, by: { 1: 2, 2: 0, 5: 0, 10: 1, 20: 0, 40: 1 }, multiplied: 1 });
});

test('the physics: a spin planned for any segment comes to rest in it, clear of the pegs, in one smooth run', () => {
  const rng = seeded(77); let from = 0, longest = 0, shortest = Infinity, backs = 0;
  for (let round = 0; round < 2; round++) for (let target = 0; target < COUNT; target++) {
    const p = plan(target, { from, random: rng });
    assert.equal(segmentAt(p.end), target, `planned for ${target}, at rest in ${segmentAt(p.end)}`);
    const turns = (p.end - from) / (Math.PI * 2), where = p.end / PITCH - Math.floor(p.end / PITCH);
    assert.ok(turns > 2.4 && turns < 4.6, `${turns.toFixed(2)} turns`); assert.ok(where > .12 && where < .95, `at rest ${where.toFixed(2)} of the way through its segment`);
    assert.ok(p.calm <= p.T && p.calm > 8 && p.T < 17, `calm at ${p.calm.toFixed(1)} s of ${p.T.toFixed(1)}`); longest = Math.max(longest, p.calm); shortest = Math.min(shortest, p.calm);
    // one smooth run: no jump from frame to frame, never faster than the pull, never rolling far back
    let top = -Infinity;
    for (let i = 1; i < p.phis.length; i++) { const step = p.phis[i] - p.phis[i - 1]; assert.ok(Math.abs(step) <= p.w0 / p.fps * 1.02, `a jump of ${step} at frame ${i}`); top = Math.max(top, p.phis[i]); }
    assert.ok(top - p.end < 1.2 * PITCH, 'it rocks back less than a segment or so'); if (top - p.end > .3 * PITCH) backs++;
    // every peg that passed clacked once, in order of time; the pegs that only thumped the flapper are soft
    const hard = p.clicks.filter(c => !c.soft);
    assert.equal(hard.length, Math.floor(p.end / PITCH) - Math.floor(from / PITCH), 'a clack for every peg passed');
    for (let i = 1; i < p.clicks.length; i++) assert.ok(p.clicks[i].t >= p.clicks[i - 1].t);
    for (const f of p.flaps) assert.ok(Math.abs(f) <= PHYS.reach + PHYS.slip + 1e-6, 'the flapper bends no further than a peg takes it');
    // what the room reads back
    assert.equal(at(p, 0).angle, from); assert.equal(at(p, p.T + 5).angle, p.end); assert.equal(at(p, p.T + 5).done, true); assert.equal(at(p, -1).angle, from);
    const mid = at(p, p.T / 3); assert.ok(mid.angle > from && mid.angle < p.end + PITCH && mid.w > 0);
    from = p.end;
  }
  assert.ok(longest < 15.5 && shortest > 9.5, `spins take ${shortest.toFixed(1)} to ${longest.toFixed(1)} s`);
  assert.ok(backs > 15 && backs < 95, `${backs} of 110 spins bent the flapper on one peg more and fell back`);
});

test('the physics: the harder the pull, the farther it runs; the same pull, the same spin', () => {
  let last = -Infinity;
  for (let w = PHYS.speeds[0]; w <= PHYS.speeds[1]; w += .25) { const s = simulate(1.234, w); assert.ok(s.end >= last, `a pull of ${w} runs to ${s.end}`); last = s.end; }
  const a = simulate(.5, 7.1, true), b = simulate(.5, 7.1, true);
  assert.deepEqual([...a.phis], [...b.phis]); assert.equal(a.end, b.end);
  assert.ok(simulate(0, PHYS.speeds[0]).end / (Math.PI * 2) < PHYS.turns[0] && simulate(0, PHYS.speeds[1]).end / (Math.PI * 2) > PHYS.turns[1], 'the pulls tried reach every spin asked for');
});
