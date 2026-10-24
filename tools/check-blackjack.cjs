// Optional browser QA, separate from node --test. Requires externally installed Playwright.
// Serve the repository, then: node tools/check-blackjack.cjs
// SALON_BASE_URL selects the server (default http://127.0.0.1:8000).
// SALON_CHROMIUM selects a browser; otherwise use /usr/bin/chromium or Playwright's browser.
// SALON_QA_GRAPHICS=saver is useful for software WebGL; unset preserves the app's default.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('This optional check requires Playwright in the Node module search path; it is not an application dependency.'); process.exit(1); }

const base = (process.env.SALON_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const executablePath = process.env.SALON_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const graphics = process.env.SALON_QA_GRAPHICS;
if (graphics && !['auto', 'high', 'phone', 'saver'].includes(graphics)) throw new Error('SALON_QA_GRAPHICS must be auto, high, phone, or saver.');

async function main() {
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let passed = 0;
  async function run(name, { mode = 'classic', reduced = true } = {}, check) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    try {
      await page.addInitScript(({ mode, reduced, graphics }) => {
        const settings = { mode, reduced, players: 0, fast: true, sound: false };
        if (graphics) settings.gfx = graphics;
        for (const [key, value] of Object.entries(settings)) localStorage.setItem(`spader.${key}`, JSON.stringify(value));
      }, { mode, reduced, graphics });
      await page.goto(`${base}/?test&table&nosw&seed=123`);
      await page.waitForFunction(() => window.done === true);
      // Observe calls while preserving the real meshes, animations, sounds, and rendering.
      await page.evaluate(() => {
        const view = window.__spader.view, original = view.flyStack.bind(view);
        window.__qaPayoutCuts = [];
        view.flyStack = (key, values, from, options) => {
          window.__qaPayoutCuts.push({ key, values: [...values], start: view.chipsOf(key).length });
          return original(key, values, from, options);
        };
      });
      await page.locator('#chips [data-value="5"]').click();
      await check(page);
      assert.deepEqual(errors, [], 'browser exceptions, console errors, and failed asset responses');
      console.log(`PASS ${name}`); passed++;
    } catch (error) {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'salon-blackjack-qa-'));
      const screenshot = path.join(directory, 'failure.png');
      try { await page.screenshot({ path: screenshot, timeout: 15000 }); console.error(`Failure screenshot: ${screenshot}`); } catch {}
      error.message = `${name}: ${error.message}`; throw error;
    } finally { await context.close(); }
  }

  async function bet(page) {
    await page.locator('.spot.main').click();
    await page.waitForFunction(() => window.__spader.view.resting.count > 0);
  }
  async function deal(page, cards, phase = 'player') {
    await page.evaluate(cards => window.__spader.rig(cards), cards);
    await page.locator('#deal').click();
    await page.waitForFunction(phase => window.__spader.mode === phase, phase, { timeout: 120000 });
  }
  async function stand(page) {
    for (let hand = 0; hand < 4; hand++) {
      if (await page.evaluate(() => window.__spader.mode === 'result')) break;
      const index = await page.evaluate(() => window.__spader.table.activeIndex);
      await page.locator('#act-stand').click();
      await page.waitForFunction(index => window.__spader.mode === 'result' || (window.__spader.mode === 'player' && window.__spader.table.activeIndex !== index && !document.querySelector('#act-stand').disabled), index, { timeout: 120000 });
    }
    await page.waitForFunction(() => window.__spader.mode === 'result');
  }
  async function settled(page, balance) {
    assert.equal(await page.evaluate(() => window.__spader.table.balance), balance);
    const cuts = await page.evaluate(() => window.__qaPayoutCuts);
    assert.ok(cuts.length > 0, 'a winning hand must exercise rack payout animation');
    for (const cut of cuts) {
      assert.ok(cut.values.length <= 5 || cut.values.length === 20, 'dealer-sized cuts');
      assert.ok(cut.values.every(value => value === cut.values[0]), 'one denomination per cut');
      assert.equal(Math.floor(cut.start / 20), Math.floor((cut.start + cut.values.length - 1) / 20), 'a cut stays in one destination column');
    }
    await page.evaluate(() => window.__spader.choose('next'));
    await page.waitForFunction(() => window.__spader.mode === 'betting' && !window.__spader.busy && window.__spader.view.resting.count === 0, null, { timeout: 120000 });
    assert.equal(await page.evaluate(() => [...window.__spader.view.stacks.values()].flat().length), 0, 'collection leaves no chips or free markers behind');
  }

  try {
    console.log(`Blackjack browser checks: ${base}; graphics: ${graphics || 'application default'}`);
    for (const reduced of [true, false]) await run(`Classic ${reduced ? 'reduced' : 'normal'} motion settlement and cleanup`, { reduced }, async page => {
      await bet(page); await deal(page, ['10♥', '9♣', '8♦', '8♠']); await stand(page); await settled(page, 1005);
    });
    await run('Odd-stake blackjack pays 3:2 including a physical half chip', {}, async page => {
      await bet(page); await deal(page, ['A♥', '9♣', 'K♦', '8♠'], 'result');
      const values = await page.evaluate(() => window.__qaPayoutCuts.flatMap(cut => cut.values));
      assert.equal(values.reduce((sum, value) => sum + value, 0), 7.5); assert.ok(values.includes(.5));
      await settled(page, 1007.5);
    });
    await run('Paid split preserves both stakes and payouts', {}, async page => {
      await bet(page); await deal(page, ['8♥', '6♣', '8♦', '10♠', '3♣', '2♦', '10♥']);
      await page.locator('#act-split').click();
      await page.waitForFunction(() => window.__spader.mode === 'player' && window.__spader.table.hands.length === 2);
      await stand(page); await settled(page, 1010);
    });
    await run('Free double marker and winnings settle and clear', { mode: 'freebet' }, async page => {
      await bet(page); await deal(page, ['5♥', '6♣', '6♦', '10♠', '10♥', '3♣']);
      await page.locator('#act-double').click(); await page.waitForFunction(() => window.__spader.mode === 'result');
      assert.equal(await page.evaluate(() => window.__spader.table.result.hands[0].free), 5);
      await settled(page, 1010);
    });
    await run('Large normal-motion payout retains all chips across columns', { reduced: false }, async page => {
      await bet(page);
      // This rendering-only check intentionally leaves the engine and wallet untouched.
      const visual = await page.evaluate(async () => {
        const view = window.__spader.view, before = window.__spader.table.balance;
        await view.payout('h0', 40000.5);
        const chips = view.chipsOf('h0');
        return { before, after: window.__spader.table.balance, total: chips.reduce((sum, chip) => sum + chip.userData.value, 0), count: chips.length, resting: view.resting.count, allParked: chips.every(chip => chip.parent === null), cuts: window.__qaPayoutCuts };
      });
      assert.equal(visual.before, visual.after); assert.equal(visual.total, 40005.5);
      assert.equal(visual.count, 42); assert.equal(visual.resting, 42); assert.ok(visual.allParked);
      assert.ok(visual.cuts.some(cut => cut.values.length === 20), 'exercise a full twenty-chip stack');
      await page.evaluate(() => window.__spader.view.clearChips());
      assert.equal(await page.evaluate(() => window.__spader.view.resting.count), 0);
    });
    await run('High Top 3 side-bet win uses grouped normal-motion payouts', { reduced: false }, async page => {
      await bet(page); await page.locator('#chips [data-value="100"]').click(); await page.locator('.tile[data-spot="top3"]').click();
      await deal(page, ['K♥', 'K♥', 'K♥', 'K♠']); await stand(page);
      assert.equal(await page.evaluate(() => window.__spader.table.result.sideNet), 27000);
      assert.equal(await page.evaluate(() => window.__qaPayoutCuts.filter(cut => cut.key === 'top3').flatMap(cut => cut.values).reduce((sum, value) => sum + value, 0)), 27000);
      await settled(page, 28000);
    });
    console.log(`Passed ${passed} blackjack browser checks.`);
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
