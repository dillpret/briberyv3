import { chromium, firefox, webkit, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:5080';
const artifactDir = process.env.UI_ARTIFACT_DIR;
const headless = process.env.HEADED !== '1';
const browserName = process.env.UI_BROWSER ?? 'chromium';
const players = ['Alice', 'Bob', 'Carol', 'Dana'];
const notes = [];
const flowMetrics = [];

// Use a real, valid artwork asset; the former one-pixel PNG had a bad CRC in Firefox.
const pngBase64 = (await fs.readFile(path.resolve(import.meta.dirname, '../public/brand/bribery-mascot.png'))).toString('base64');
let failure = null;
let foregroundHost = null;

async function makePlayer(browser, name, options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const player = { context, page, name, state: null, completed: [] };
  // Observe real SignalR messages to assert persistence, without replacing the backend.
  page.on('websocket', (socket) => {
    const invocations = new Map();
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      for (const frame of payload.split('\u001e').filter(Boolean)) {
        const message = JSON.parse(frame);
        if (message.invocationId && message.target) invocations.set(message.invocationId, message);
      }
    });
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      for (const frame of payload.split('\u001e').filter(Boolean)) {
        const message = JSON.parse(frame);
        if (message.target === 'GameStateUpdated') player.state = message.arguments[0];
        if (message.target === 'ActionFailed' || message.target === 'StartFailed') notes.push(`${name}: ${message.target}: ${message.arguments[0]}`);
        if (message.type === 3 && invocations.has(message.invocationId)) {
          const invocation = invocations.get(message.invocationId);
          invocations.delete(message.invocationId);
          if (!message.error) player.completed.push(invocation);
        }
      }
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') notes.push(`${name} console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => notes.push(`${name} page error: ${error.message}`));
  page.on('requestfailed', (request) => notes.push(
    `${name} failed request: ${request.method()} ${request.url()} (${request.failure()?.errorText})`));
  page.on('response', (response) => {
    if (response.status() >= 400) notes.push(`${name} HTTP ${response.status()}: ${response.url()}`);
  });
  return player;
}

async function waitForVisible(page, text, timeout = 15000) {
  await page.bringToFront();
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

async function forPlayers(roster, action) {
  // Each isolated context represents a separate person's foreground device.
  // WebKit suspends painting idle background pages, so drive those sequentially.
  if (browserName === 'webkit') {
    for (const [index, player] of roster.entries()) {
      await player.page.bringToFront();
      await action(player, index);
    }
    if (foregroundHost && !foregroundHost.isClosed()) await foregroundHost.bringToFront();
  } else {
    await Promise.all(roster.map(action));
  }
}

async function closeIntroIfVisible(page) {
  const closeButton = page.getByRole('button', { name: 'Close help' });
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible())) await closeButton.click();
}

async function capture(page, name) {
  await page.bringToFront();
  if (!name.includes('scrolled')) await page.evaluate(() => window.scrollTo(0, 0));
  // Wait for entry transitions so before/after captures show settled screens.
  await page.getByRole('main').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})));
  });
  const metrics = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    headings: [...document.querySelectorAll('h1,h2')].map((element) => element.textContent.trim()),
    buttons: [...document.querySelectorAll('button')].filter((element) => element.getClientRects().length).map((element) => element.textContent.trim()),
  }));
  expect(metrics.document.width, `${name}: horizontal overflow`).toBeLessThanOrEqual(metrics.viewport.width);
  // Flattened gameplay sections must not retain the old cards' clipping boundaries.
  await expect.poll(() => page.locator('.game-layout .soft-panel, .game-layout .soft-card, .game-layout .prompt-card').evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).overflowX !== 'visible' || getComputedStyle(element).overflowY !== 'visible')
      .map((element) => element.className)), { message: `${name}: invisible clipping containers` }).toEqual([]);
  flowMetrics.push({ name, ...metrics });
  if (!artifactDir) return;
  await fs.mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, `flow-${name}-viewport.png`) });
  await page.screenshot({ path: path.join(artifactDir, `flow-${name}-full.png`), fullPage: true });
}

async function captureResponsive(page, name) {
  await capture(page, name);
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, `${name}-mobile`);
  await page.setViewportSize({ width: 320, height: 568 });
  await capture(page, `${name}-mobile-small`);
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, `${name}-tablet`);
  if (originalViewport) await page.setViewportSize(originalViewport);
}

async function waitForAnyText(page, texts, timeout = 15000) {
  await expect
    .poll(async () => {
      const body = await page.locator('body').innerText();
      return texts.find((text) => body.toLowerCase().includes(text.toLowerCase())) ?? '';
    }, { timeout })
    .not.toBe('');
}

async function createGame(player) {
  foregroundHost = player.page;
  await player.page.goto(baseUrl);
  await closeIntroIfVisible(player.page);
  await player.page.getByPlaceholder('Enter your name').fill(player.name);
  await player.page.getByRole('button', { name: 'Create game' }).click();
  await expect(player.page).toHaveURL(/\/game\/[A-Z0-9]+/, { timeout: 15000 });
  await waitForVisible(player.page, 'Room code');
  const gameId = new URL(player.page.url()).pathname.split('/').pop();
  if (!gameId) throw new Error('Could not extract game id from URL.');
  return gameId;
}

async function joinGame(player, gameId, expectedScreen = 'Room code') {
  await player.page.goto(baseUrl);
  await closeIntroIfVisible(player.page);
  await player.page.getByPlaceholder('Enter your name').fill(player.name);
  await player.page.getByPlaceholder('AB12').fill(gameId);
  await player.page.getByRole('button', { name: 'Join game' }).click();
  await waitForVisible(player.page, expectedScreen);
}

async function toggleReady(player) {
  await player.page.getByRole('button', { name: 'I am ready' }).click();
  await expect(player.page.getByRole('button', { name: 'I need a moment' })).toBeVisible({ timeout: 10000 });
}

async function openGameSettings(host) {
  const settings = host.page.locator('details').filter({ hasText: 'Game settings' });
  if (!(await settings.evaluate((element) => element.hasAttribute('open')))) {
    await settings.getByText('Game settings', { exact: true }).click();
  }
  return settings;
}

async function enablePromptTimer(host) {
  await openGameSettings(host);
  const toggle = host.page.getByRole('checkbox', { name: 'Prompt time limit', exact: true });
  await host.page.getByText('Time limit', { exact: true }).first().click();
  await expect(toggle).toBeChecked({ timeout: 10000 });
  await expect(host.page.locator('input[type="number"]:enabled')).toHaveCount(1, { timeout: 10000 });
}

async function disablePromptTimer(host) {
  const settings = await openGameSettings(host);
  const toggle = settings.getByRole('checkbox', { name: 'Prompt time limit', exact: true });
  if (await toggle.isChecked()) {
    const promptSection = settings.locator('section').filter({
      has: host.page.getByText('Prompt', { exact: true }),
    }).first();
    await promptSection.getByText('Time limit', { exact: true }).click();
  }
  await expect(toggle).not.toBeChecked({ timeout: 10000 });
}

async function setPromptsAnsweredPerPlayer(host, count) {
  const settings = await openGameSettings(host);
  const selector = settings.getByRole('combobox', { name: 'Prompts answered per player' });
  await selector.selectOption({ label: String(count) });
  await expect(selector).toHaveValue(String(count), { timeout: 10000 });
  await expect(settings.getByText(`${count} prompts each`, { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(settings.getByText(
    `Requires at least ${count + 1} connected players.`, { exact: true })).toBeVisible({ timeout: 10000 });
}

async function configureMissingBribes(host, mode) {
  const settings = await openGameSettings(host);
  await settings.getByRole('combobox', { name: 'Missed bribe handling' }).selectOption(mode);

  const submission = settings.locator('section').filter({
    has: host.page.getByText('Submission', { exact: true }),
  }).first();
  const toggle = submission.getByRole('checkbox', { name: 'Submission time limit', exact: true });
  await submission.getByText('Time limit', { exact: true }).click();
  await submission.getByRole('spinbutton').fill('2');
  await submission.getByRole('spinbutton').blur();
  await expect(toggle).toBeChecked();
  await expect(submission.getByRole('spinbutton')).toHaveValue('2');
}

async function verifyMissingBribeMode(browser, mode) {
  const suffix = mode === 'AutoFill' ? 'Auto' : 'None';
  const miniRoster = [];
  try {
    for (const name of [`${suffix} Host`, `${suffix} Two`, `${suffix} Three`]) {
      miniRoster.push(await makePlayer(browser, name));
    }
    const gameId = await createGame(miniRoster[0]);
    await forPlayers(miniRoster.slice(1), (player) => joinGame(player, gameId));
    await configureMissingBribes(miniRoster[0], mode);
    await forPlayers(miniRoster, toggleReady);
    await miniRoster[0].page.getByRole('button', { name: 'Start game' }).click();
    await forPlayers(miniRoster, (player, index) => submitPrompt(player, `${mode} prompt ${index + 1}`));

    await waitForVisible(miniRoster[0].page, 'Pick your favourite bribe');
    if (mode === 'AutoFill') {
      await expect(miniRoster[0].page.locator('label.soft-card')).toHaveCount(2, { timeout: 10000 });
      await expect(miniRoster[0].page.getByText('Unavailable', { exact: true })).toHaveCount(0);
      await captureResponsive(miniRoster[0].page, 'auto-fill-voting');
      await forPlayers(miniRoster, async (player) => {
        await player.page.locator('label.soft-card').first().click();
        await player.page.getByRole('button', { name: 'Submit vote' }).click();
      });
      await waitForVisible(miniRoster[0].page, 'Round 1 results');
      await expect(miniRoster[0].page.getByText(
        'Randomly generated as player did not submit bribe — no points earned.', { exact: true }).first()).toBeVisible();
      await expect(miniRoster[0].page.getByRole('button', { name: 'Give coin' })).toHaveCount(0);
      await captureResponsive(miniRoster[0].page, 'auto-fill-appreciation');
    } else {
      await expect(miniRoster[0].page.getByText('No bribes submitted for your prompt, sorry', { exact: true })).toBeVisible();
      await expect(miniRoster[0].page.getByText('Unavailable', { exact: true })).toHaveCount(2);
      await expect(miniRoster[0].page.locator('input[type="radio"]:disabled')).toHaveCount(2);
      await captureResponsive(miniRoster[0].page, 'no-fallback-voting');
      await forPlayers(miniRoster, (player) => player.page.getByRole('button', { name: 'Continue' }).click());
      await waitForVisible(miniRoster[0].page, 'Round 1 results');
      await expect(miniRoster[0].page.getByText(
        'No bribes submitted for this prompt — no winner.', { exact: true }).first()).toBeVisible();
      await captureResponsive(miniRoster[0].page, 'no-fallback-appreciation');
    }
  } finally {
    await Promise.allSettled(miniRoster.map((player) => player.context.close()));
  }
}

async function expectCountdown(player) {
  await expect(player.page.getByText('Time remaining', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(player.page.getByText('Auto-submits when time runs out.', { exact: true })).toBeVisible({ timeout: 10000 });
}

async function submitPrompt(player, prompt) {
  await waitForVisible(player.page, 'Write your prompt');
  await player.page.getByPlaceholder('Best excuse for being late').fill(prompt);
  await player.page.getByRole('button', { name: 'Submit prompt' }).click();
  await waitForAnyText(player.page, ['Prompt submitted', 'Send your bribes']);
}

async function submitTextBribes(player) {
  await waitForVisible(player.page, 'Send your bribes');

  const composers = player.page.getByRole('textbox');
  const composerCount = await composers.count();

  for (let index = 0; index < composerCount; index += 1) {
    await composers
      .nth(index)
      .fill(`A suspiciously excellent bribe ${index + 1} from ${player.name} at ${new Date().toISOString()}`);
  }

  for (;;) {
    const submitButton = player.page.locator('button:not([disabled])').filter({ hasText: 'Submit bribe' }).first();
    if ((await submitButton.count()) === 0) break;

    const sentCount = await player.page.getByText('Sent', { exact: true }).count();
    await submitButton.click();
    await expect
      .poll(async () => {
        const body = await player.page.locator('body').innerText();
        if (body.includes('Pick your favourite')) return 'advanced';
        const nextSentCount = await player.page.getByText('Sent', { exact: true }).count();
        return nextSentCount > sentCount ? 'sent' : '';
      }, { timeout: 10000 })
      .not.toBe('');
  }

  await waitForAnyText(player.page, ['Your bribe is tucked away safely', 'Pick your favourite']);
}

async function submitMixedBribes(player, imagePath) {
  await waitForVisible(player.page, 'Send your bribes');

  const fileInput = player.page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles(imagePath);
    await expect(player.page.getByAltText('Selected bribe preview')).toBeVisible({ timeout: 10000 });
    await player.page.getByRole('button', { name: 'Submit bribe' }).first().click();
    await player.page.getByText('Sent', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
  }

  await submitTextBribes(player);
}

async function submitVotes(player) {
  await waitForVisible(player.page, 'Pick your favourite');

  await expect(player.page.locator('label.soft-card')).toHaveCount(3, { timeout: 10000 });
  const option = player.page.locator('label.soft-card').first();
  if ((await option.count()) > 0) {
    await option.click();
    if (player.name === 'Alice') await captureResponsive(player.page, 'voting-selected');
    await player.page.getByRole('button', { name: 'Submit vote' }).click();
    await waitForAnyText(player.page, ['Vote submitted', 'Round 1 results']);
  } else {
    await waitForVisible(player.page, 'Voting is only for players who received bribes this round');
  }
}

async function submitAppreciation(player) {
  await player.page.getByRole('button', { name: 'Done reviewing round results' }).waitFor();
  const doneButton = player.page.getByRole('button', { name: 'Done reviewing round results' });
  if ((await doneButton.count()) > 0) {
    await doneButton.click();
  }
}

async function main() {
  const imagePath = path.join(os.tmpdir(), `bribery-smoke-${process.pid}.png`);
  await fs.writeFile(imagePath, Buffer.from(pngBase64, 'base64'));

  const browser = await ({ chromium, firefox, webkit, edge: chromium })[browserName].launch({
    headless, ...(browserName === 'edge' ? { channel: 'msedge' } : {}),
  });
  const roster = [];

  try {
    for (const name of players) roster.push(await makePlayer(browser, name));

    const gameId = await createGame(roster[0]);
    console.log(`Created room ${gameId}`);

    await forPlayers(roster.slice(1), (player) => joinGame(player, gameId));
    console.log('Joined four isolated browser contexts.');
    const nonHostLobbySettings = roster[1].page.locator('details').filter({ hasText: 'Game settings' });
    await expect(nonHostLobbySettings.getByText('Game settings', { exact: true })).toBeVisible();
    await expect(nonHostLobbySettings.locator('select, input')).toHaveCount(0);
    await captureResponsive(roster[0].page, 'lobby');

    const duplicate = await makePlayer(browser, 'Duplicate Alice');
    await duplicate.page.goto(baseUrl);
    await closeIntroIfVisible(duplicate.page);
    await duplicate.page.getByPlaceholder('Enter your name').fill('Alice');
    await duplicate.page.getByPlaceholder('AB12').fill(gameId);
    await duplicate.page.getByRole('button', { name: 'Join game' }).click();
    await waitForVisible(duplicate.page, 'Another player with that name is already in the game');
    await duplicate.context.close();
    console.log('Verified duplicate-name join error flow.');

    const markedOfflinePlayer = roster[3];
    await roster[0].page.getByRole('button', { name: `Actions for ${markedOfflinePlayer.name}` }).click();
    await expect(roster[0].page.getByRole('menuitem', { name: 'Mark offline' })).toBeVisible();
    await capture(roster[0].page, 'lobby-player-actions');

    const hostViewport = roster[0].page.viewportSize();
    await roster[0].page.setViewportSize({ width: 390, height: 844 });
    await roster[0].page.getByRole('button', { name: 'Players' }).click();
    await roster[0].page.getByRole('button', { name: `Actions for ${markedOfflinePlayer.name}` }).click();
    await expect(roster[0].page.getByRole('menuitem', { name: 'Mark offline' })).toBeVisible();
    await capture(roster[0].page, 'lobby-player-actions-mobile');
    await roster[0].page.getByRole('button', { name: 'Close' }).click();
    if (hostViewport) await roster[0].page.setViewportSize(hostViewport);

    await roster[0].page.getByRole('button', { name: `Actions for ${markedOfflinePlayer.name}` }).click();
    roster[0].page.once('dialog', (dialog) => dialog.accept());
    await roster[0].page.getByRole('menuitem', { name: 'Mark offline' }).click();

    await waitForVisible(markedOfflinePlayer.page, 'The host marked you offline');
    const markedOfflineRosterEntry = roster[0].page
      .getByRole('complementary')
      .locator('article')
      .filter({ hasText: markedOfflinePlayer.name });
    await expect(markedOfflineRosterEntry.getByText('Disconnected', { exact: true })).toBeVisible();
    await markedOfflinePlayer.page.getByRole('button', { name: 'Join game' }).click();
    await waitForVisible(markedOfflinePlayer.page, 'Room code');
    await expect(markedOfflineRosterEntry.getByText('Disconnected', { exact: true })).toHaveCount(0);
    console.log('Verified host mark-offline and explicit same-browser rejoin flow.');

    await setPromptsAnsweredPerPlayer(roster[0], 3);
    await captureResponsive(roster[0].page, 'lobby-settings-three-prompts');
    await enablePromptTimer(roster[0]);
    const mainPromptSeconds = roster[0].page.getByRole('spinbutton').filter({ visible: true }).first();
    await mainPromptSeconds.fill('180');
    await mainPromptSeconds.blur();
    console.log('Configured three prompts per player and enabled the prompt timer from the host lobby.');

    await forPlayers(roster, toggleReady);
    await roster[0].page.getByRole('button', { name: 'Start game' }).click();
    await waitForVisible(roster[0].page, 'Write your prompt');
    await expectCountdown(roster[0]);
    console.log('Started the game from the host lobby.');

    const prompts = [
      'best snack for a secret meeting',
      'most dramatic excuse for being late',
      'least suspicious disguise',
      'best bribe for a tired judge',
    ];
    await submitPrompt(roster[0], prompts[0]);
    await captureResponsive(roster[0].page, 'prompt-submitted');
    await roster[0].page.getByRole('button', { name: 'Edit prompt' }).click();
    await expect(roster[0].page.getByRole('button', { name: 'Resubmit prompt' })).toBeVisible({ timeout: 10000 });
    await expect(roster[0].page.getByPlaceholder('Best excuse for being late')).toHaveValue(prompts[0]);
    await roster[0].page.getByPlaceholder('Best excuse for being late').focus();
    await captureResponsive(roster[0].page, 'prompt-editing');

    await forPlayers(roster.slice(1), (player, index) => submitPrompt(player, prompts[index + 1]));
    await expect(roster[0].page.getByText('3 of 4 prompts in', { exact: true })).toBeVisible({ timeout: 10000 });
    const editedPrompt = 'best snack for an edited secret meeting';
    await roster[0].page.getByPlaceholder('Best excuse for being late').fill(editedPrompt);
    await roster[0].page.getByRole('button', { name: 'Resubmit prompt' }).click();
    await waitForVisible(roster[0].page, 'Send your bribes');
    await expect(roster[0].page.getByRole('textbox')).toHaveCount(3, { timeout: 10000 });
    await expect.poll(async () => {
      const bodies = await Promise.all(roster.slice(1).map((player) => player.page.locator('body').innerText()));
      return bodies.some((body) => body.includes(editedPrompt));
    }, { timeout: 10000 }).toBe(true);
    console.log('Submitted prompts for all players.');

    await submitMixedBribes(roster[0], imagePath);
    const firstSubmittedCard = roster[0].page.locator('section.soft-card').first();
    const firstSubmittedCardText = await firstSubmittedCard.innerText();
    const editedTarget = roster.find((player) =>
      firstSubmittedCardText.toUpperCase().includes(`${player.name.toUpperCase()}'S PROMPT`));
    if (!editedTarget) throw new Error('Could not identify the recipient of the edited bribe.');

    await captureResponsive(roster[0].page, 'bribe-submitted');
    await roster[0].page.getByRole('button', { name: 'Edit bribe' }).first().click();
    await expect(roster[0].page.getByRole('button', { name: 'Resubmit bribe' })).toBeVisible({ timeout: 10000 });
    await roster[0].page.getByRole('button', { name: 'Remove' }).click();
    const firstEditedComposer = roster[0].page.getByRole('textbox').first();
    await firstEditedComposer.fill('First edited bribe from Alice');
    await captureResponsive(roster[0].page, 'bribe-editing');
    await roster[0].page.getByRole('button', { name: 'Resubmit bribe' }).click();
    await expect(roster[0].page.getByText('First edited bribe from Alice', { exact: true })).toBeVisible({ timeout: 10000 });
    await capture(roster[0].page, 'bribe-edit-saved');

    await roster[0].page.getByRole('button', { name: 'Edit bribe' }).first().click();
    await expect(roster[0].page.getByRole('button', { name: 'Resubmit bribe' })).toBeVisible({ timeout: 10000 });
    await forPlayers(roster.slice(1), submitTextBribes);
    await expect(roster[0].page.getByText('11 of 12 bribes sent', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(roster[0].page.getByText('Send your bribes', { exact: true })).toBeVisible();

    const finalEditedBribe = 'Final edited bribe that blocks progression';
    await roster[0].page.getByRole('textbox').first().fill(finalEditedBribe);
    await roster[0].page.getByRole('button', { name: 'Resubmit bribe' }).click();
    await waitForVisible(roster[0].page, 'Pick your favourite');
    await expect(editedTarget.page.locator('body')).toContainText(finalEditedBribe, { timeout: 10000 });
    await forPlayers(roster, (player) => expect(player.page.locator('label.soft-card')).toHaveCount(3, { timeout: 10000 }));
    await captureResponsive(roster[0].page, 'voting-three-bribes');
    console.log('Submitted 12 bribes, including one image upload, and verified three choices per player.');

    await forPlayers(roster, submitVotes);
    await captureResponsive(roster[0].page, 'appreciation');
    const coin = roster[0].page.getByRole('button', { name: 'Give coin', exact: true }).and(roster[0].page.locator(':enabled')).first();
    await coin.click();
    await expect(roster[0].page.getByRole('button', { name: 'Coin given', exact: true })).toBeVisible();
    await captureResponsive(roster[0].page, 'appreciation-coin-given');
    await submitAppreciation(roster[0]);
    await captureResponsive(roster[0].page, 'appreciation-done');
    await forPlayers(roster.slice(1), submitAppreciation);
    await roster[0].page.getByRole('heading', { name: 'See how you scored', exact: true }).waitFor();
    await captureResponsive(roster[0].page, 'scoreboard');
    console.log('Completed voting and reached results.');

    const nonHostScoreboardSettings = roster[1].page.locator('details').filter({ hasText: 'Game settings' });
    await expect(nonHostScoreboardSettings.getByText('Game settings', { exact: true })).toBeVisible();
    await expect(nonHostScoreboardSettings.locator('select, input')).toHaveCount(0);

    const nextRoundButton = roster[0].page.getByRole('button', { name: 'Start next round' });
    await setPromptsAnsweredPerPlayer(roster[0], 4);
    await expect(nextRoundButton).toBeDisabled();
    await expect(roster[0].page.getByText('At least 5 connected players are needed')).toBeVisible();
    await captureResponsive(roster[0].page, 'scoreboard-insufficient-players');

    const latePlayer = await makePlayer(browser, 'Evan');
    roster.push(latePlayer);
    await joinGame(latePlayer, gameId, 'Scoreboard');
    await waitForVisible(latePlayer.page, 'Scoreboard');
    await expect(latePlayer.page.getByText('Waiting next round', { exact: true })).toBeVisible();
    await expect(latePlayer.page.getByText('4 prompts each', { exact: false }).first()).toBeVisible();
    await expect(nextRoundButton).toBeEnabled({ timeout: 10000 });

    const disconnectedPlayer = roster[3];
    await disconnectedPlayer.context.close();
    await expect(nextRoundButton).toBeDisabled({ timeout: 10000 });
    const disconnectedRosterEntry = roster[0].page
      .getByRole('complementary')
      .locator('article')
      .filter({ hasText: 'Dana' });
    await expect(disconnectedRosterEntry.getByText('Dana', { exact: true })).toBeVisible();
    await expect(disconnectedRosterEntry.getByText('Disconnected', { exact: true })).toBeVisible();

    await setPromptsAnsweredPerPlayer(roster[0], 3);
    await disablePromptTimer(roster[0]);
    await expect(nextRoundButton).toBeEnabled({ timeout: 10000 });
    await expect(latePlayer.page.getByText('3 prompts each', { exact: false }).first()).toBeVisible();
    await roster[0].page.evaluate(() => window.scrollTo(0, 0));
    await captureResponsive(roster[0].page, 'scoreboard-settings-between-rounds');
    console.log('Verified between-round settings with a waiting player and a disconnected player.');

    await roster[0].page.getByRole('button', { name: 'Start next round' }).click();
    await waitForVisible(roster[0].page, 'Round 2');
    await waitForVisible(latePlayer.page, 'Round 2');
    await expect(roster[0].page.getByRole('textbox')).toHaveCount(1);
    await expect(roster[0].page.getByText('Time remaining', { exact: true })).toHaveCount(0);
    await expect(latePlayer.page.getByPlaceholder('Best excuse for being late')).toBeVisible();
    console.log('Started round 2 from results.');

    const activeRoster = roster.filter((player) => player !== disconnectedPlayer);
    const previousScores = new Map(roster[0].state.players.map((player) => [player.id, player.score]));
    await forPlayers(activeRoster, (player, index) => submitPrompt(player, `Round two prompt ${index + 1}`));
    await forPlayers(activeRoster, submitTextBribes);
    await forPlayers(activeRoster, async (player) => {
      await player.page.getByRole('radio').first().check();
      await player.page.getByRole('button', { name: 'Submit vote' }).click();
    });
    await forPlayers(activeRoster, submitAppreciation);
    await roster[0].page.getByRole('heading', { name: 'See how you scored' }).waitFor();
    const scoreboard = roster[0].state.scoreboard;
    for (const score of scoreboard.overallScores) {
      const round = scoreboard.roundScores.find((candidate) => candidate.playerId === score.playerId);
      expect(score.cumulativeScore).toBeCloseTo((previousScores.get(score.playerId) ?? 0) + (round?.totalRoundPoints ?? 0));
    }
    await roster[0].page.getByRole('button', { name: 'Overall', exact: true }).click();
    await expect(roster[0].page.getByRole('button', { name: 'Overall', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await captureResponsive(roster[0].page, 'round-two-overall-scoreboard');
    await roster[0].page.getByRole('button', { name: 'Round', exact: true }).click();
    await captureResponsive(roster[0].page, 'round-two-scoreboard');

    for (const player of roster.filter((candidate) => candidate !== disconnectedPlayer)) {
      await expect(player.page.locator('body')).toContainText(player.name, { timeout: 10000 });
    }

    await verifyMissingBribeMode(browser, 'AutoFill');
    await verifyMissingBribeMode(browser, 'NoFallback');
    console.log('Verified Auto-fill and No fallback missing-submission flows.');

    await verifyCrowdedLobby(browser);
    await verifyTimerWarning(browser);

    if (notes.length > 0) {
      throw new Error(`Browser errors detected:\n${notes.map((note) => `- ${note}`).join('\n')}`);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    if (artifactDir) {
      for (const [index, player] of roster.entries()) {
        if (!player.page.isClosed()) {
          await player.page.screenshot({ path: path.join(artifactDir, `failure-player-${index}.png`), fullPage: true });
          await fs.writeFile(path.join(artifactDir, `failure-player-${index}.json`), JSON.stringify(player.state, null, 2));
        }
      }
    }
    throw error;
  } finally {
    if (artifactDir) await fs.writeFile(path.join(artifactDir, 'flow-report.json'), JSON.stringify({ browser: browserName, failure, states: flowMetrics, errors: notes }, null, 2));
    await Promise.allSettled(roster.map((player) => player.context.close()));
    await browser.close();
    await fs.rm(imagePath, { force: true });
  }
}

async function verifyTimerWarning(browser) {
  const roster = [];
  try {
    for (const name of ['AlexandriaLongPlayerName', 'Timer Two', 'Timer Three']) roster.push(await makePlayer(browser, name,
      name.startsWith('Alexandria') ? { viewport: { width: 320, height: 568 }, hasTouch: true, ...(browserName === 'firefox' ? {} : { isMobile: true }) } : {}));
    const gameId = await createGame(roster[0]);
    await forPlayers(roster.slice(1), (player) => joinGame(player, gameId));
    await enablePromptTimer(roster[0]);
    const seconds = roster[0].page.getByRole('spinbutton').filter({ visible: true });
    await seconds.first().fill('20');
    await seconds.first().blur();
    await expect(seconds.first()).toHaveValue('20');
    const settings = await openGameSettings(roster[0]);
    for (const label of ['Submission', 'Voting', 'Appreciation']) {
      const section = settings.locator('section').filter({ has: roster[0].page.getByText(label, { exact: true }) });
      await section.getByText('Time limit', { exact: true }).click();
      await section.getByRole('spinbutton').fill(label === 'Submission' ? '30' : '20');
      await section.getByRole('spinbutton').blur();
    }
    await forPlayers(roster, toggleReady);
    await roster[0].page.getByRole('button', { name: 'Start game' }).click();
    await expectCountdown(roster[0]);
    await captureResponsive(roster[0].page, 'timer-running');
    await roster[0].page.getByPlaceholder('Best excuse for being late').fill('A prompt saved by the timer');
    await expect.poll(() => roster[0].completed.some((call) => call.target === 'SavePromptDraft' && call.arguments[0] === 'A prompt saved by the timer')).toBe(true);
    await roster[0].page.reload();
    await expect(roster[0].page.getByPlaceholder('Best excuse for being late')).toHaveValue('A prompt saved by the timer');
    await forPlayers(roster.slice(1), (player, index) => submitPrompt(player, `Timed prompt ${index}`));
    await expect(roster[0].page.locator('.phase-clock')).toHaveClass(/is-warning/, { timeout: 10000 });
    await expect(roster[0].page.getByText('Finish now', { exact: true })).toHaveCount(0);
    await captureResponsive(roster[0].page, 'timer-warning');
    await roster[0].page.setViewportSize({ width: 320, height: 568 });
    await roster[0].page.getByRole('textbox').focus();
    await roster[0].page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => roster[0].page.evaluate(() => scrollY)).toBeGreaterThan(0);
    const timer = roster[0].page.getByRole('timer');
    const bounds = await timer.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThan(568);
    await expect(timer).toBeInViewport();
    await capture(roster[0].page, 'timer-warning-scrolled-mobile-small');
    await roster[0].page.setViewportSize({ width: 320, height: 340 });
    await roster[0].page.getByRole('button', { name: 'Submit prompt', exact: true }).scrollIntoViewIfNeeded();
    await expect(timer).toBeInViewport();
    await expect(roster[0].page.getByRole('button', { name: 'Submit prompt', exact: true })).toBeInViewport();
    await capture(roster[0].page, 'timer-warning-scrolled-short-viewport');
    await roster[0].page.setViewportSize({ width: 320, height: 568 });
    await waitForVisible(roster[0].page, 'Send your bribes');
    await expectCountdown(roster[0]);
    await expect.poll(async () => (await Promise.all(roster.slice(1).map((player) => player.page.locator('body').innerText()))).some((body) => body.includes('A prompt saved by the timer'))).toBe(true);
    console.log('Verified warning, persistent mobile countdown, and real server deadline submission.');
    const longBribe = 'Joyful '.repeat(57) + 'x'.repeat(101);
    expect(longBribe.length).toBe(500);
    await roster[0].page.getByRole('textbox').first().fill(longBribe);
    await expect.poll(() => roster[0].completed.some((call) => call.target === 'SaveBribeDraft' && call.arguments[0].text === longBribe)).toBe(true);
    await roster[0].page.reload();
    await expect(roster[0].page.getByRole('textbox').first()).toHaveText(longBribe);
    await roster[0].page.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'timed-draft.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64'),
    });
    await expect.poll(() => roster[0].completed.some((call) => call.target === 'SaveBribeDraft' && call.arguments[0].media?.mediaId)).toBe(true);
    await roster[0].page.reload();
    await expect(roster[0].page.getByAltText('Selected bribe preview')).toBeVisible();
    await captureResponsive(roster[0].page, 'timer-submission-restored-long-content');
    await forPlayers(roster.slice(1), submitTextBribes);
    await waitForVisible(roster[0].page, 'Pick your favourite', 40000);
    await expectCountdown(roster[0]);
    expect(roster.slice(1).some((player) => player.state.voting.bribes.some((bribe) => bribe.media?.mediaId))).toBe(true);
    const radios = roster[0].page.getByRole('radio');
    await radios.first().check();
    await radios.first().focus();
    await roster[0].page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toBeChecked();
    await expect.poll(() => roster[0].completed.filter((call) => call.target === 'SaveVoteDraft').length).toBeGreaterThanOrEqual(2);
    const previousVersion = roster[0].completed.filter((call) => call.target === 'SaveVoteDraft').at(-1).arguments[1];
    await roster[0].page.reload();
    await expect(roster[0].page.getByRole('radio').nth(1)).toBeChecked();
    await roster[0].page.getByRole('radio').first().check();
    await expect.poll(() => roster[0].completed.filter((call) => call.target === 'SaveVoteDraft').at(-1).arguments[1]).toBeGreaterThan(previousVersion);
    const finalChoice = roster[0].completed.filter((call) => call.target === 'SaveVoteDraft').at(-1).arguments[0];
    await captureResponsive(roster[0].page, 'timer-voting-restored');
    await waitForVisible(roster[0].page, 'Round 1 results', 30000);
    const ownResult = roster[0].state.appreciation.roundResults.find((result) => result.promptOwnerPlayerId === roster[0].state.currentPlayerId);
    expect(ownResult.winningBribeId).toBe(finalChoice);
    await expectCountdown(roster[0]);
    await captureResponsive(roster[0].page, 'timer-appreciation');
    await roster[0].page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await roster[0].page.getByRole('button', { name: 'Open how to play instructions' }).click();
    await roster[0].page.getByRole('heading', { name: 'See how you scored' }).waitFor({ state: 'attached', timeout: 30000 });
    await roster[0].page.getByRole('button', { name: 'Close help' }).click();
    await expect(roster[0].page.getByRole('heading', { name: 'See how you scored' })).toBeInViewport();
    await expect(roster[0].page.getByRole('timer')).toHaveCount(0);
    expect(await roster[0].page.evaluate(() => document.body.style.position)).not.toBe('fixed');
    await captureResponsive(roster[0].page, 'timer-scoreboard-after-overlay');
    console.log('Verified prompt/bribe/vote refresh persistence, keyboard voting, all four deadline transitions, and overlay scroll recovery.');
  } finally {
    await Promise.allSettled(roster.map((player) => player.context.close()));
  }
}

async function verifyCrowdedLobby(browser) {
  const roster = [];
  try {
    const names = ['AlexandriaLongPlayerName', ...Array.from({ length: 9 }, (_, index) => `Guest ${index + 1} long name`)];
    for (const name of names) roster.push(await makePlayer(browser, name));
    const gameId = await createGame(roster[0]);
    await forPlayers(roster.slice(1), (player) => joinGame(player, gameId));
    await roster[0].page.setViewportSize({ width: 1024, height: 768 });
    await capture(roster[0].page, 'crowded-lobby-desktop');
    const panel = roster[0].page.getByRole('complementary', { name: 'Players', exact: true });
    let bounds = await panel.boundingBox();
    expect(bounds.y + bounds.height, 'Entire desktop roster container must fit the viewport').toBeLessThanOrEqual(768);
    await roster[0].page.setViewportSize({ width: 768, height: 1024 });
    await roster[0].page.getByRole('button', { name: 'Players', exact: true }).click();
    await capture(roster[0].page, 'crowded-lobby-tablet-panel');
    bounds = await panel.boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1024);
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(panel.locator('article').last()).toBeInViewport();
    await roster[0].page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toBeHidden();
    await roster[0].page.setViewportSize({ width: 1280, height: 800 });
    await setPromptsAnsweredPerPlayer(roster[0], 5);
    await forPlayers(roster, toggleReady);
    await roster[0].page.getByRole('button', { name: 'Start game' }).click();
    const longPrompt = 'A joyful prompt '.repeat(12) + 'x'.repeat(8);
    expect(longPrompt.length).toBe(200);
    await forPlayers(roster, (player) => submitPrompt(player, longPrompt));
    await expect(roster[0].page.getByRole('textbox')).toHaveCount(5);
    await captureResponsive(roster[0].page, 'five-assignments-long-prompts');
    await forPlayers(roster, submitTextBribes);
    await expect(roster[0].page.getByRole('radio')).toHaveCount(5);
    await captureResponsive(roster[0].page, 'five-voting-choices');
    await forPlayers(roster, async (player) => {
      await player.page.getByRole('radio').first().check();
      await player.page.getByRole('button', { name: 'Submit vote' }).click();
    });
    await captureResponsive(roster[0].page, 'ten-player-appreciation');
    await forPlayers(roster, submitAppreciation);
    await roster[0].page.getByRole('heading', { name: 'See how you scored' }).waitFor();
    await expect(roster[0].page.getByRole('button', { name: 'Show all scores' })).toBeVisible();
    await roster[0].page.getByRole('button', { name: 'Show all scores' }).click();
    await captureResponsive(roster[0].page, 'ten-player-scoreboard');
    console.log('Verified a ten-player roster, long names, 200-character prompts, and five assignments per player.');
  } finally {
    await Promise.allSettled(roster.map((player) => player.context.close()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
