import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.UI_BASE_URL;
const artifactDir = process.env.UI_ARTIFACT_DIR;

if (!baseUrl || !artifactDir) throw new Error('UI_BASE_URL and UI_ARTIFACT_DIR are required. Use npm run inspect:ui.');

const targets = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];
const report = { baseUrl, capturedAt: new Date().toISOString(), targets: [] };
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });

try {
  await fs.mkdir(artifactDir, { recursive: true });
  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const errors = [];

    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('requestfailed', (request) => errors.push(`request: ${request.method()} ${request.url()} (${request.failure()?.errorText})`));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
    });

    const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
    expect(response?.ok()).toBeTruthy();
    const closeHelp = page.getByRole('button', { name: 'Close help' });
    if (await closeHelp.isVisible().catch(() => false)) await closeHelp.click();

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
    report.targets.push({ name: target.name, metrics, errors });
    await context.close();
  }

  await fs.writeFile(path.join(artifactDir, 'inspection-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const errors = report.targets.flatMap((target) => target.errors.map((error) => `${target.name}: ${error}`));
  if (errors.length) throw new Error(`Browser errors detected:\n${errors.join('\n')}`);
} finally {
  await browser.close();
}
