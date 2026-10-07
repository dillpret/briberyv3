import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.UI_BASE_URL;
const artifactDir = process.env.UI_ARTIFACT_DIR;

if (!baseUrl || !artifactDir) throw new Error('UI_BASE_URL and UI_ARTIFACT_DIR are required. Use npm run inspect:ui.');

const targets = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'mobile-small', viewport: { width: 320, height: 568 } },
];
const report = { baseUrl, capturedAt: new Date().toISOString(), targets: [] };
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });

try {
  await fs.mkdir(artifactDir, { recursive: true });
  for (const target of targets) {
    const isMobile = target.name.startsWith('mobile');
    const context = await browser.newContext({ viewport: target.viewport, isMobile, hasTouch: isMobile });
    const page = await context.newPage();
    const errors = [];
    const artworkRequests = new Set();
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/instructions/')) artworkRequests.add(new URL(request.url()).pathname);
    });

    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('requestfailed', (request) => errors.push(`request: ${request.method()} ${request.url()} (${request.failure()?.errorText})`));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
    });

    const helpStates = [];
    async function captureHelp(name, asset) {
      const dialog = page.getByRole('dialog');
      const image = dialog.getByRole('img');
      await expect(image).toHaveAttribute('src', `/instructions/${asset}.webp`);
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth === 1024 && element.naturalHeight === 1536)).toBe(true);
      if (asset === 'winners') {
        const finish = page.getByRole('button', { name: "Got it, let's play", exact: true });
        await expect(finish).toHaveCSS('background-color', 'rgb(238, 185, 2)');
        await expect(finish).toHaveCSS('color', 'rgb(46, 27, 3)');
      }
      const metrics = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          bounds: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
          viewport: { width: innerWidth, height: innerHeight },
          documentWidth: document.documentElement.scrollWidth,
          headings: [...element.querySelectorAll('h2')].map((heading) => heading.textContent),
          buttons: [...element.querySelectorAll('button')].map((button) => button.textContent.trim()),
          image: element.querySelector('img').getAttribute('src'),
          clippedButtons: [...element.querySelectorAll('button')].filter((button) => {
            if (!button.textContent.trim()) return false;
            const range = document.createRange();
            range.selectNodeContents(button);
            const text = range.getBoundingClientRect();
            const bounds = button.getBoundingClientRect();
            return text.left < bounds.left || text.right > bounds.right || text.top < bounds.top || text.bottom > bounds.bottom;
          }).map((button) => button.textContent.trim()),
        };
      });
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport.width);
      expect(metrics.bounds.x).toBeGreaterThanOrEqual(0);
      expect(metrics.bounds.y).toBeGreaterThanOrEqual(0);
      expect(metrics.bounds.right).toBeLessThanOrEqual(metrics.viewport.width);
      expect(metrics.bounds.bottom).toBeLessThanOrEqual(metrics.viewport.height);
      expect(metrics.clippedButtons).toEqual([]);
      await page.screenshot({ path: path.join(artifactDir, `${name}-${target.name}-viewport.png`), animations: 'disabled' });
      await page.screenshot({ path: path.join(artifactDir, `${name}-${target.name}-full.png`), fullPage: true, animations: 'disabled' });
      helpStates.push({ name, metrics });
    }

    const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
    expect(response?.ok()).toBeTruthy();
    await captureHelp('welcome', 'overview');
    await expect(page.getByRole('dialog')).toHaveAccessibleName('How to play');
    await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible();
    const closeHelp = page.getByRole('button', { name: 'Close help' });
    if (await closeHelp.isVisible().catch(() => false)) await closeHelp.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('briberySplashSeen'))).toBe('true');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Bribery introduction' })).toHaveCount(0);

    await expect(page.getByRole('img', { name: 'Bribery', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create game' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join game' })).toBeVisible();

    const metrics = await page.evaluate(() => ({
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      headings: [...document.querySelectorAll('h1,h2')].map((element) => element.textContent?.trim()).filter(Boolean),
      buttons: [...document.querySelectorAll('button')].map((element) => element.textContent?.trim()).filter(Boolean),
      firstViewportText: document.body.innerText.slice(0, 1400),
    }));
    expect(metrics.document.width).toBeLessThanOrEqual(metrics.viewport.width);

    await page.screenshot({ path: path.join(artifactDir, `landing-${target.name}-viewport.png`) });
    await page.screenshot({ path: path.join(artifactDir, `landing-${target.name}-full.png`), fullPage: true });
    const expectedArtwork = ['answer', 'ask', 'choose', 'overview', 'winners'].map((name) => `/instructions/${name}.webp`);
    await expect.poll(() => [...artworkRequests].sort()).toEqual(expectedArtwork);
    // All instruction artwork must be cached before the user opens help.
    await expect.poll(() => page.evaluate((assets) => assets.every((asset) =>
      performance.getEntriesByName(new URL(asset, location.href).href).some((entry) => entry.responseEnd > 0)
    ), expectedArtwork)).toBe(true);
    await page.getByRole('button', { name: 'Open how to play instructions' }).click();
    await expect(page.getByRole('button', { name: /^Show step / })).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    const assets = ['overview', 'ask', 'answer', 'choose', 'winners'];
    for (const [index, asset] of assets.entries()) {
      await captureHelp(`instructions-${index + 1}`, asset);
      if (index < assets.length - 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: "Got it, let's play", exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute('src', '/instructions/choose.webp');
    await page.getByRole('button', { name: 'Show step 1', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute('src', '/instructions/overview.webp');

    if (isMobile) {
      // CDP dispatches trusted touch input through Chromium's pointer-event pipeline.
      const touch = await context.newCDPSession(page);
      async function swipe(dx, dy = 0, { cancel = false, multi = false } = {}) {
        const box = await page.getByRole('dialog').getByRole('img').boundingBox();
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        const point = (offsetX = 0, offsetY = 0) => ({ x: x + offsetX, y: y + offsetY, id: 1 });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point()] });
        if (multi) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(), { x: x + 20, y: y + 20, id: 2 }] });
        for (let step = 1; step <= 5; step++) {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [point(Math.round(dx * step / 5), Math.round(dy * step / 5)), ...(multi ? [{ x: x + 20, y: y + 20, id: 2 }] : [])],
          });
        }
        await touch.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      }
      await swipe(90);
      await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible();
      for (const gesture of [() => swipe(0), () => swipe(-30), () => swipe(0, 90), () => swipe(-90, 90), () => swipe(-90, 0, { cancel: true }), () => swipe(-90, 0, { multi: true })]) {
        await gesture();
        await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible();
      }
      await swipe(-90);
      await expect(page.getByText('Page 2 of 5', { exact: true })).toBeVisible();
      await captureHelp('swipe-forward', 'ask');
      await swipe(90);
      await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible();
      for (let index = 0; index < 4; index++) await swipe(-90);
      await swipe(-90);
      await expect(page.getByText('Page 5 of 5', { exact: true })).toBeVisible();
      await captureHelp('swipe-final', 'winners');
      expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
      await touch.detach();
    } else {
      await page.getByRole('button', { name: 'Show step 5', exact: true }).click();
    }
    await page.getByRole('button', { name: "Got it, let's play", exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open how to play instructions' }).click();
    await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto(`${baseUrl}/?help=splash`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2 of 5', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close help' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open how to play instructions' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open how to play instructions' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('presentation').click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    report.targets.push({ name: target.name, metrics, helpStates, errors });
    await context.close();
  }

  await fs.writeFile(path.join(artifactDir, 'inspection-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const errors = report.targets.flatMap((target) => target.errors.map((error) => `${target.name}: ${error}`));
  if (errors.length) throw new Error(`Browser errors detected:\n${errors.join('\n')}`);
} finally {
  await browser.close();
}
