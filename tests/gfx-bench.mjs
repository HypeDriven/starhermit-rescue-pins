// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics,
// starts Practice on journey stage 35 (a 3×5 castle with nine pins, water and lava) and keeps pulling the
// pin the on-screen Hint names through its real button in the pin list, retrying from the results screen —
// liquids flow, villagers bob, torches flicker, dust and lava embers drift all the time.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

const title = '.rp-overlay:not([hidden]) .rp-title';

export async function setPreset(page, preset) {
  await page.waitForSelector(title, { timeout: 30000 });
  await page.locator('#rp-settings-btn').click();
  await page.waitForSelector('#rp-gfx-section', { state: 'visible' });
  await page.locator('#gfx-preset').selectOption(preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForSelector(title);
}

async function step(page) {
  const overlay = page.locator('.rp-overlay:not([hidden]) .rp-panel');
  if (await overlay.count()) {
    const retry = overlay.getByRole('button', { name: 'Retry', exact: true });
    if (await retry.count()) { await retry.click({ timeout: 3000 }); await page.waitForSelector('.rp-pin-list button', { state: 'visible', timeout: 15000 }); }
    return;
  }
  if (!(await page.locator('.rp-pin-list button').count())) return; // countdown
  await page.getByRole('button', { name: /Hint/ }).click({ timeout: 3000 });
  const m = (await page.locator('.rp-rail-right .rp-hint').innerText()).match(/Try pin (\S+)/);
  if (m) await page.locator('.rp-pin-list').getByRole('button', { name: `Pin ${m[1]}`, exact: true }).click({ timeout: 3000 });
}

export async function start(page) {
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: /^Practice/ }).click();
  await page.locator('.rp-stage-grid button').nth(34).click();
  await page.waitForSelector('.rp-pin-list button', { state: 'visible', timeout: 15000 });
  let open = true;
  page.once('close', () => { open = false; });
  (async () => {
    while (open) {
      try { await step(page); } catch (e) { if (!open) return; if (process.env.BENCH_DEBUG) console.error(e.message); }
      await page.waitForTimeout(700).catch(() => {});
    }
  })();
  await page.waitForTimeout(1500);
}
