/**
 * Rescue Pins — end-to-end playthrough test (dev only, not shipped).
 *
 * Drives the real visible UI in headless Chrome (playwright-core + system
 * Chrome): title → mode select → journey grid → stage 1 → countdown →
 * pull pins (hint-guided, via the on-screen pin list buttons) → results,
 * plus pause/resume, in-pause settings, help/rule cards, and quit-to-title.
 * Runs two passes: desktop 1280x800 and mobile 390x844 (touch).
 *
 * The game is fully playable offline (solo journey/practice/learn); the
 * optional daily leaderboard API is served by the repo's own server.js,
 * which this test spawns on an ephemeral port for same-origin fetches.
 *
 * Run: npm run test:e2e
 */
import { chromium } from 'playwright-core';
import { createServer } from '../server.js';

const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
});

const step = async (name, fn) => {
  await fn();
  console.log(`ok - ${name}`);
};

function wireErrorCollection(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !browserNoise.test(m.text())) errors.push(`console: ${m.text()}`);
  });
}

function throwIfErrors(errors, passName) {
  if (errors.length) {
    throw new Error(`${passName} pass had page errors:\n` + errors.join('\n'));
  }
}

const resultsHeading = (page) => page.locator('.rp-overlay:not([hidden]) .rp-panel h2');

async function waitActive(page) {
  // countdown is 3 beats (~1.4s); active when the overlay clears and pins show
  await page.waitForSelector('.rp-pin-list button', { state: 'visible', timeout: 15000 });
}

async function startStage1(page, shot) {
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: /^Journey/ }).click();
  const stages = await page.locator('.rp-stage-grid button').count();
  if (stages !== 40) throw new Error(`expected 40 journey stages, got ${stages}`);
  await page.screenshot({ path: shot('journey') });
  await page.locator('.rp-stage-grid button').first().click();
  await page.waitForSelector('.rp-countdown', { timeout: 5000 });
  await page.screenshot({ path: shot('countdown') });
  await waitActive(page);
}

// Pull pins until the results overlay appears. Each iteration asks the game
// for its on-screen hint ("Try pin X — it is part of a winning line.") and
// then clicks that pin's real button in the status rail.
async function playToResults(page, shot) {
  for (let i = 0; i < 30; i++) {
    const h2 = resultsHeading(page);
    if (await h2.count() && /Rescued!|claims another/.test(await h2.first().innerText())) return;
    await page.getByRole('button', { name: /Hint/ }).click();
    const hint = await page.locator('.rp-rail-right .rp-hint').innerText();
    const m = hint.match(/Try pin (\S+)/);
    if (!m) throw new Error('hint did not name a pin: ' + hint);
    await page.locator('.rp-pin-list').getByRole('button', { name: `Pin ${m[1]}`, exact: true }).click();
    if (i === 0) await page.screenshot({ path: shot('play') });
    await page.waitForTimeout(350);
  }
  throw new Error('level did not reach results within 30 pulls');
}

async function expectResults(page, shot) {
  const h2 = resultsHeading(page);
  await h2.first().waitFor({ state: 'visible', timeout: 8000 });
  const headline = await h2.first().innerText();
  if (!/Rescued!/.test(headline)) throw new Error('expected a win, got: ' + headline);
  const total = await page.locator('.rp-score-list .rp-total').innerText();
  if (!/Total: \d+/.test(total)) throw new Error('score breakdown missing total: ' + total);
  console.log('  headline:', headline, '|', total);
  await page.screenshot({ path: shot('results') });
}

async function desktopPass() {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  wireErrorCollection(page, errors);
  const shot = (n) => `/tmp/rescue-pins-e2e-${n}-desktop.png`;

  await step('[desktop] load + title visible', async () => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-title', { timeout: 15000 });
    await page.screenshot({ path: shot('title') });
  });

  await step('[desktop] journey stage 1 → countdown → active', async () => {
    await startStage1(page, shot);
    await page.screenshot({ path: shot('active') });
  });

  await step('[desktop] pause, settings, help, resume', async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-panel h2:text("Paused")');
    await page.screenshot({ path: shot('pause') });
    // settings live inside the pause screen: exercise a toggle and a select
    await page.locator('.rp-settings-section input[type="checkbox"]').first().check();
    await page.locator('select[aria-label="Palette"]').selectOption('colorblind');
    await page.screenshot({ path: shot('settings') });
    await page.getByRole('button', { name: 'Rule cards' }).click();
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-panel h2:text("How to play")');
    await page.screenshot({ path: shot('help') });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForSelector('.rp-pin-list button', { state: 'visible' });
  });

  await step('[desktop] pull pins (hint-guided) to victory', async () => {
    await playToResults(page, shot);
  });

  await step('[desktop] results screen with score breakdown', async () => {
    await expectResults(page, shot);
  });

  await step('[desktop] progression persisted', async () => {
    const prog = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.includes('progression')) return JSON.parse(localStorage.getItem(k));
      }
      return null;
    });
    if (!prog || !Object.keys(prog.completed || {}).length) {
      throw new Error('stage completion not persisted: ' + JSON.stringify(prog));
    }
  });

  await step('[desktop] next stage → pause → save & quit to title', async () => {
    await page.getByRole('button', { name: 'Next stage' }).click();
    await waitActive(page);
    await page.screenshot({ path: shot('stage2') });
    await page.getByRole('button', { name: /Pause/ }).click();
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-panel h2:text("Paused")');
    await page.getByRole('button', { name: 'Save & quit to title' }).click();
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-title');
    const done = await page.locator('.rp-title .rp-dim').innerText();
    if (!/Journey progress: 1\/40/.test(done)) throw new Error('title progress line wrong: ' + done);
    await page.screenshot({ path: shot('back-to-title') });
  });

  await context.close();
  throwIfErrors(errors, 'desktop');
}

async function mobilePass() {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  wireErrorCollection(page, errors);
  const shot = (n) => `/tmp/rescue-pins-e2e-${n}-mobile.png`;

  await step('[mobile] load + title visible', async () => {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-title', { timeout: 15000 });
    await page.screenshot({ path: shot('title') });
  });

  await step('[mobile] journey stage 1 → active', async () => {
    await startStage1(page, shot);
    await page.screenshot({ path: shot('active') });
  });

  await step('[mobile] pause + resume via tray buttons', async () => {
    await page.getByRole('button', { name: /Pause/ }).click();
    await page.waitForSelector('.rp-overlay:not([hidden]) .rp-panel h2:text("Paused")');
    await page.screenshot({ path: shot('pause') });
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForSelector('.rp-pin-list button', { state: 'visible' });
  });

  await step('[mobile] pull pins (hint-guided) to victory + results', async () => {
    await playToResults(page, shot);
    await expectResults(page, shot);
  });

  await context.close();
  throwIfErrors(errors, 'mobile');
}

try {
  await desktopPass();
  await mobilePass();
  console.log('\nE2E PASS — desktop + mobile playthroughs clean, no page errors');
} finally {
  await browser.close();
  server.close();
}
