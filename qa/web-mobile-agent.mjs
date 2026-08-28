import { chromium } from '@playwright/test';

const baseURL = process.env.FIGHT_AI_WEB_URL || 'http://127.0.0.1:3000';

const devices = [
  { name: 'iphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'android', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) throw new Error(`${device.name}: horizontal overflow ${overflow}px`);

    const hero = page.locator('.hero h1');
    await hero.waitFor();
    const metrics = await hero.evaluate(el => {
      const s = getComputedStyle(el);
      return { fontSize: parseFloat(s.fontSize), lineHeight: parseFloat(s.lineHeight), width: el.getBoundingClientRect().width };
    });
    if (metrics.lineHeight < metrics.fontSize * 1.02) throw new Error(`${device.name}: hero line-height too tight`);
    if (metrics.width > device.viewport.width - 20) throw new Error(`${device.name}: hero exceeds viewport`);

    const controls = page.locator('button, select');
    const count = await controls.count();
    for (let i = 0; i < Math.min(count, 25); i++) {
      const box = await controls.nth(i).boundingBox();
      if (box && box.height < 32) throw new Error(`${device.name}: touch control under 32px at index ${i}`);
    }

    await page.getByText('Otro', { exact: true }).click();
    const reid = page.locator('.fighterReid input');
    await reid.waitFor();
    await reid.fill('polera negra, más bajo, ortodoxo');

    await page.getByText('VER DEMO DEL REPORTE', { exact: true }).click();
    await page.getByText('COACH VISUAL', { exact: true }).waitFor();

    const bottomNav = page.locator('.bottomNav');
    if (!(await bottomNav.isVisible())) throw new Error(`${device.name}: bottom navigation not visible`);

    await page.screenshot({ path: `/tmp/fight-ai-${device.name}.png`, fullPage: true });
    await context.close();
  }

  const thirteenMb = new Uint8Array(13 * 1024 * 1024);
  const init = await fetch(baseURL + '/api/uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'qa-large-video.mp4', type: 'video/mp4', size: thirteenMb.byteLength }),
  });
  const initJson = await init.json();
  if (!init.ok || !initJson.uploadId || !initJson.chunkSize) throw new Error('chunk init failed');

  let offset = 0;
  while (offset < thirteenMb.byteLength) {
    const end = Math.min(thirteenMb.byteLength, offset + initJson.chunkSize);
    const res = await fetch(baseURL + `/api/uploads/${encodeURIComponent(initJson.uploadId)}/chunk?offset=${offset}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: thirteenMb.slice(offset, end),
    });
    if (!res.ok) throw new Error(`chunk upload failed at offset ${offset}: ${await res.text()}`);
    offset = end;
  }

  const status = await fetch(baseURL + `/api/uploads/${encodeURIComponent(initJson.uploadId)}/chunk`);
  const statusJson = await status.json();
  if (!status.ok || statusJson.complete !== true || statusJson.received !== thirteenMb.byteLength) {
    throw new Error('large upload did not complete correctly');
  }

  console.log('Fight AI mobile virtual-agent QA: PASS');
} finally {
  await browser.close();
}
