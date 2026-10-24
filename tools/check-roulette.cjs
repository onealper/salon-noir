// Browser regression checks against the real local game. Run after starting its HTTP server:
// SALON_BASE_URL=http://127.0.0.1:8000 node tools/check-roulette.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = new URL(process.env.SALON_BASE_URL || 'http://127.0.0.1:8000/');
if (!['http:', 'https:'].includes(BASE.protocol)) throw new Error('SALON_BASE_URL must be an HTTP(S) server URL.');
const TIMEOUT = Number(process.env.SALON_QA_TIMEOUT || 120000);
if (!Number.isFinite(TIMEOUT) || TIMEOUT < 1000) throw new Error('SALON_QA_TIMEOUT must be at least 1000 milliseconds.');
const sum = values => values.reduce((total, value) => total + value, 0);
const screenshots = process.env.SALON_QA_SCREENSHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'salon-roulette-qa-'));
fs.mkdirSync(screenshots, { recursive: true });

async function session(browser, { random = .2, bitmap = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(TIMEOUT); page.setDefaultNavigationTimeout(TIMEOUT);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(`${request.failure()?.errorText}: ${request.url()}`); });
  await context.addInitScript(value => {
    Math.random = () => value;
    for (const [key, setting] of Object.entries({ sound: false, players: 0, fast: true, reduced: true, gfx: 'saver', room: 'roulette', chip: 5 })) {
      localStorage.setItem(`spader.${key}`, JSON.stringify(setting));
    }
  }, random);
  const url = new URL(BASE); url.search = '?test&nosw&table&seed=123';
  try {
    await page.goto(url.href);
    await page.waitForFunction(() => window.done === true && window.__spader?.roulette?.mode === 'betting', null, { timeout: TIMEOUT });
    if (bitmap) await page.evaluate(() => {
      // Keep the real renderer/camera/animation paths, with a cheaper framebuffer for accounting checks.
      const renderer = __spader.roulette.scene.renderer, size = renderer.setSize.bind(renderer);
      renderer.setSize = () => size(320, 200, false); renderer.setPixelRatio(1); renderer.setSize();
      renderer.shadowMap.enabled = false;
      __spader.roulette.scene.requestRender();
    });
    return { page, context, errors };
  } catch (error) { await context.close(); throw error; }
}

async function setPlayers(page, count, trace = false) {
  return page.evaluate(({ count, trace }) => {
    const select = document.querySelector('#optPlayers'); select.value = String(count); select.dispatchEvent(new Event('change', { bubbles: true }));
    const room = __spader.roulette; window.qaRivalRefs = [...room.test.rivals]; window.qaCoinTrace = [];
    if (trace) for (const player of qaRivalRefs) {
      const place = player.place;
      player.place = function (...args) {
        const before = this.bankroll, accepted = place.apply(this, args);
        if (accepted) qaCoinTrace.push({ owner: this.name, value: args[1] ?? this.unit, before, bank: this.bankroll, staked: this.staked });
        return accepted;
      };
    }
    return qaRivalRefs.map(player => ({ name: player.name, bank: player.bankroll, count: player.reserveCount }));
  }, { count, trace });
}

async function state(page) {
  return page.evaluate(() => {
    const room = __spader.roulette, players = window.qaRivalRefs ?? room.test.rivals;
    return {
      bank: room.table.balance, mode: room.mode, stage: room.test.stageAt,
      rivals: players.map(player => ({ name: player.name, bank: player.bankroll, staked: player.staked, busy: player.busy, rounds: player.rounds,
        count: player.reserveCount, values: player.reserveValues, bets: player.bets })),
      reserves: room.scene.reserveInfo.map(reserve => ({ name: reserve.owner, bank: reserve.amount, count: reserve.count, values: [...reserve.values] })),
      stacks: [...room.test.stacks].map(([key, chips]) => ({ key, values: chips.map(chip => chip.userData.v), flying: chips.some(chip => chip.userData.fly) })),
      trace: window.qaCoinTrace ?? [],
    };
  });
}

function exactReserves(snapshot) {
  for (const player of snapshot.rivals) {
    const reserve = snapshot.reserves.find(reserve => reserve.name === player.name);
    assert.ok(reserve, `${player.name}: counted reserve exists`);
    assert.equal(sum(player.values), player.bank, `${player.name}: model reserve value`);
    assert.equal(reserve.bank, player.bank, `${player.name}: rendered reserve value`);
    assert.equal(reserve.count, player.count, `${player.name}: rendered reserve count`);
    assert.deepEqual(reserve.values, player.values, `${player.name}: every rendered reserve chip matches the model`);
  }
}

function acceptedCoins(snapshot) {
  assert.ok(snapshot.trace.length, 'the real AI accepted physical chips');
  for (const coin of snapshot.trace) {
    assert.equal(coin.before - coin.bank, coin.value, `${coin.owner}: a departing chip debits its face value`);
    assert.equal(coin.bank + coin.staked, 1000, `${coin.owner}: reserve plus pending wagers is conserved`);
  }
}

async function spinToBanner(page, number, bet = 'red') {
  await page.evaluate(({ number, bet }) => {
    const room = __spader.roulette; room.test.turbo = true; room.test.rig(number); room.test.place(bet);
    document.querySelector('#rSpin').click();
  }, { number, bet });
  await page.waitForFunction(() => __spader.roulette.test.stageAt === 'banner', null, { timeout: TIMEOUT, polling: 25 });
  // Leaving during payout stops the next round's automatic AI betting, without refunding closed wagers.
  await page.evaluate(() => { window.qaRivalRefs = [...__spader.roulette.test.rivals]; __spader.roulette.leave(); });
  return state(page);
}

async function done(page) {
  await page.waitForFunction(() => __spader.roulette.mode === 'betting' && __spader.roulette.test.stacks.size === 0 && __spader.roulette.test.motion.live.size === 0,
    null, { timeout: TIMEOUT, polling: 25 });
  return state(page);
}

async function run(browser, name, check, options) {
  if (process.env.SALON_QA_CASE && !name.includes(process.env.SALON_QA_CASE)) return;
  const current = await session(browser, options);
  try {
    await check(current.page);
    assert.deepEqual(current.errors, [], `${name}: browser exceptions, console errors and failing requests`);
    console.log(`PASS: ${name}`);
  } finally { await current.context.close(); }
}

(async () => {
  const executablePath = process.env.SALON_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await run(browser, 'AI chips debit real reserves and a 35:1 win returns the full bank', async page => {
      assert.deepEqual(await setPlayers(page, 1, true), [{ name: 'Olu', bank: 1000, count: 200 }]);
      exactReserves(await state(page));
      await page.waitForFunction(() => qaRivalRefs[0].staked === 10 && __spader.roulette.test.motion.live.size === 0, null, { timeout: TIMEOUT });
      const placed = await state(page); acceptedCoins(placed); exactReserves(placed);
      assert.deepEqual(placed.rivals[0].bets, [['n7', 5], ['n7', 5]]);
      assert.equal(placed.rivals[0].bank, 990); assert.equal(placed.rivals[0].count, 198);
      const banner = await spinToBanner(page, 7);
      const paid = banner.stacks.find(stack => stack.key === 'Olu|n7|pay');
      assert.ok(paid); assert.equal(paid.values.length, 70); assert.equal(sum(paid.values), 350);
      assert.equal(banner.rivals[0].bank, 990); assert.equal(banner.rivals[0].busy, true);
      const finished = await done(page); exactReserves(finished);
      assert.equal(finished.rivals[0].bank, 1350); assert.equal(finished.rivals[0].staked, 0);
      assert.equal(finished.rivals[0].count, 204); assert.equal(finished.rivals[0].rounds, 1);
      assert.equal(finished.bank, 1005);
    });

    await run(browser, 'zero pays exact AI la partage and the player\'s half-chip change', async page => {
      await setPlayers(page, 2, true);
      await page.waitForFunction(() => qaRivalRefs[0].staked === 10 && qaRivalRefs[1].staked === 60 && __spader.roulette.test.motion.live.size === 0,
        null, { timeout: TIMEOUT });
      const placed = await state(page); acceptedCoins(placed); exactReserves(placed);
      const banner = await spinToBanner(page, 0);
      const ownReturn = banner.stacks.find(stack => stack.key === 'you|red');
      assert.ok(ownReturn); assert.equal(sum(ownReturn.values), 2.5); assert.ok(ownReturn.values.includes(.5));
      assert.equal(sum(banner.stacks.find(stack => stack.key === 'Marta|red').values), 20);
      assert.equal(sum(banner.stacks.find(stack => stack.key === 'Marta|odd').values), 10);
      assert.equal(banner.rivals[1].bank, 940, 'the rail waits until the return reaches home');
      const finished = await done(page); exactReserves(finished);
      assert.equal(finished.rivals[0].bank, 990); assert.equal(finished.rivals[1].bank, 970);
      assert.equal(finished.rivals[1].staked, 0); assert.equal(finished.rivals[1].rounds, 1);
      assert.equal(finished.bank, 997.5);
    });

    await run(browser, 'removing all players refunds pending chips and cancels old betting jobs', async page => {
      await page.evaluate(() => { __spader.settings.reduced = false; __spader.roulette.setReduced(false); });
      await setPlayers(page, 4, true);
      await page.waitForFunction(() => qaRivalRefs.some(player => player.staked > 0) && __spader.roulette.test.motion.live.size > 0,
        null, { timeout: TIMEOUT, polling: 10 });
      await page.evaluate(() => {
        window.qaRemovedPlayers = [...qaRivalRefs];
        const select = document.querySelector('#optPlayers'); select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }));
        window.qaRivalRefs = qaRemovedPlayers;
      });
      await page.waitForFunction(() => __spader.roulette.test.motion.live.size === 0, null, { timeout: TIMEOUT });
      await page.waitForTimeout(2200);
      const cleared = await state(page); acceptedCoins(cleared);
      for (const player of cleared.rivals) { assert.equal(player.bank, 1000); assert.equal(player.staked, 0); assert.equal(player.rounds, 0); }
      assert.equal(cleared.reserves.length, 0); assert.equal(cleared.stacks.length, 0); assert.equal(cleared.bank, 1000);
      assert.deepEqual(await page.evaluate(() => ({ markers: __spader.roulette.scene.playerMarkers.children.length,
        activeReserveMeshes: __spader.roulette.scene.playerReserve.children.filter(mesh => mesh.visible && mesh.isMesh && (!mesh.isInstancedMesh || mesh.count > 0)).length,
        activePlayers: __spader.roulette.test.rivals.length })), { markers: 0, activeReserveMeshes: 0, activePlayers: 0 });
    });

    await run(browser, 'rapid place 5, clear, place 25 leaves exactly the intended bet', async page => {
      await page.evaluate(() => {
        const room = __spader.roulette; __spader.settings.reduced = false; room.setReduced(false);
        room.test.place('n17'); document.querySelector('#rClear').click();
        document.querySelector('#rChips [data-value="25"]').click(); room.test.place('n17');
      });
      await page.waitForFunction(() => __spader.roulette.test.stacks.get('you|n17')?.length === 1 && __spader.roulette.test.motion.live.size === 0,
        null, { timeout: TIMEOUT });
      const placed = await state(page);
      assert.deepEqual(placed.stacks.map(stack => [stack.key, stack.values]), [['you|n17', [25]]]);
      assert.equal(await page.evaluate(() => __spader.roulette.table.on('n17')), 25);
      assert.equal(placed.bank, 1000); assert.equal(placed.rivals.length, 0); assert.equal(placed.reserves.length, 0);
    });

    await run(browser, 'removing AI during a shared column settle cannot resurrect a collected chip', async page => {
      await page.evaluate(() => __spader.roulette.test.place('n7'));
      await page.waitForFunction(() => __spader.roulette.test.stacks.get('you|n7')?.length === 1 && __spader.roulette.test.motion.live.size === 0);
      await setPlayers(page, 1);
      await page.waitForFunction(() => qaRivalRefs[0].staked === 10 && __spader.roulette.test.motion.live.size === 0);
      await page.evaluate(() => {
        const room = __spader.roulette, motion = room.test.motion, tween = motion.tween.bind(motion);
        __spader.settings.reduced = false; room.setReduced(false); window.qaColumnCancelled = false;
        // Observe the real settling tween and remove the player while that tween is pending.
        motion.tween = (duration, update, easing) => {
          const job = tween(duration, update, easing);
          if (duration === 120 && !window.qaColumnCancelled) {
            window.qaColumnCancelled = true;
            const select = document.querySelector('#optPlayers'); select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return job;
        };
        document.querySelector('#rClear').click();
      });
      await page.waitForFunction(() => qaColumnCancelled && __spader.roulette.test.motion.live.size === 0 && __spader.roulette.test.stacks.size === 0);
      const actual = await page.evaluate(() => ({ bank: qaRivalRefs[0].bankroll, staked: qaRivalRefs[0].staked,
        parked: __spader.roulette.scene.chipsG.children.filter(mesh => mesh.isInstancedMesh).reduce((n, mesh) => n + mesh.count, 0) }));
      assert.deepEqual(actual, { bank: 1000, staked: 0, parked: 0 });
    });

    await run(browser, 'counted reserves remain visible and exact on desktop and both phone orientations', async page => {
      await setPlayers(page, 4);
      const shapes = [['desktop', 1280, 800], ['phone-portrait', 390, 844], ['phone-landscape', 844, 390]];
      for (const [name, width, height] of shapes) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => {
          const room = __spader.roulette;
          return room.scene.view.w === room.stage.clientWidth && room.scene.view.h === room.stage.clientHeight && room.scene.current?.name === 'seat';
        }, null, { timeout: TIMEOUT });
        await page.evaluate(() => __spader.roulette.scene.requestRender());
        await page.waitForTimeout(300);
        const snapshot = await state(page); exactReserves(snapshot); assert.equal(snapshot.bank, 1000);
        assert.ok(snapshot.rivals.every(player => player.bank === 1000 && player.staked === 0));
        const bounds = await page.evaluate(() => {
          const scene = __spader.roulette.scene, points = scene.reserveFootprints.flatMap(f => [f.x0, f.x1].flatMap(x => [f.z0, f.z1].flatMap(z => [f.y0, f.y1].map(y => scene.project(new scene.THREE.Vector3(x, y, z))))));
          return { x0: Math.min(...points.map(p => p.x)), x1: Math.max(...points.map(p => p.x)), y0: Math.min(...points.map(p => p.y)), y1: Math.max(...points.map(p => p.y)), ...scene.view };
        });
        assert.ok(bounds.x0 >= -1 && bounds.x1 <= bounds.w + 1, `${name}: reserves inside horizontal picture ${JSON.stringify(bounds)}`);
        assert.ok(bounds.y0 >= bounds.top - 1 && bounds.y1 <= bounds.h + 1, `${name}: reserves clear the bar and picture edges ${JSON.stringify(bounds)}`);
        await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
      }
    }, { random: .99, bitmap: false });
    console.log(`Browser screenshots: ${screenshots}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
