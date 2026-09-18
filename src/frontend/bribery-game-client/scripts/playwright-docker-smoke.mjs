import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:5080';
const artifactDir = process.env.UI_ARTIFACT_DIR;
const headless = process.env.HEADED !== '1';
const players = ['Alice', 'Bob', 'Carol', 'Dana'];
const notes = [];

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lkQ7qwAAAABJRU5ErkJggg==';

async function makePlayer(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') notes.push(`${name} console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => notes.push(`${name} page error: ${error.message}`));
  page.on('requestfailed', (request) => notes.push(
    `${name} failed request: ${request.method()} ${request.url()} (${request.failure()?.errorText})`));
  page.on('response', (response) => {
    if (response.status() >= 400) notes.push(`${name} HTTP ${response.status()}: ${response.url()}`);
  });
  return { context, page, name };
}

async function waitForVisible(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
}

async function closeIntroIfVisible(page) {
  const closeButton = page.getByRole('button', { name: 'Close help' });
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible())) await closeButton.click();
}

async function capture(page, name) {
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
  if (originalViewport) await page.setViewportSize(originalViewport);
}

async function waitForAnyText(page, texts, timeout = 15000) {
  await expect
    .poll(async () => {
      const body = await page.locator('body').innerText();
      return texts.find((text) => body.includes(text)) ?? '';
    }, { timeout })
    .not.toBe('');
}

async function createGame(player) {
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
  await openGameSettings(host);
  const selector = host.page.getByRole('combobox', { name: 'Prompts answered per player' });
  await selector.selectOption({ label: String(count) });
  await expect(selector).toHaveValue(String(count), { timeout: 10000 });
  await expect(host.page.getByText(`${count} prompts each`, { exact: false })).toBeVisible({ timeout: 10000 });
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
    await Promise.all(miniRoster.slice(1).map((player) => joinGame(player, gameId)));
    await configureMissingBribes(miniRoster[0], mode);
    await Promise.all(miniRoster.map(toggleReady));
    await miniRoster[0].page.getByRole('button', { name: 'Start game' }).click();
    await Promise.all(miniRoster.map((player, index) => submitPrompt(player, `${mode} prompt ${index + 1}`)));

    await waitForVisible(miniRoster[0].page, 'Pick your favourite bribe');
    if (mode === 'AutoFill') {
      await expect(miniRoster[0].page.locator('label.soft-card')).toHaveCount(2, { timeout: 10000 });
      await expect(miniRoster[0].page.getByText('Unavailable', { exact: true })).toHaveCount(0);
      await captureResponsive(miniRoster[0].page, 'auto-fill-voting');
      await Promise.all(miniRoster.map(async (player) => {
        await player.page.locator('label.soft-card').first().click();
        await player.page.getByRole('button', { name: 'Submit vote' }).click();
      }));
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
      await Promise.all(miniRoster.map((player) => player.page.getByRole('button', { name: 'Continue' }).click()));
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
    await player.page.getByRole('button', { name: 'Submit vote' }).click();
    await waitForAnyText(player.page, ['Vote submitted', 'Round 1 results']);
  } else {
    await waitForVisible(player.page, 'Voting is only for players who received bribes this round');
  }
}

async function submitAppreciation(player) {
  await waitForVisible(player.page, 'Round 1 results');
  const doneButton = player.page.getByRole('button', { name: 'Done reviewing round results' });
  if ((await doneButton.count()) > 0) {
    await doneButton.click();
  }
}

async function main() {
  const imagePath = path.join(os.tmpdir(), `bribery-smoke-${process.pid}.png`);
  await fs.writeFile(imagePath, Buffer.from(pngBase64, 'base64'));

  const browser = await chromium.launch({ headless });
  const roster = [];

  try {
    for (const name of players) roster.push(await makePlayer(browser, name));

    const gameId = await createGame(roster[0]);
    console.log(`Created room ${gameId}`);

    await Promise.all(roster.slice(1).map((player) => joinGame(player, gameId)));
    console.log('Joined four isolated browser contexts.');
    await capture(roster[0].page, 'lobby');

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
    console.log('Configured three prompts per player and enabled the prompt timer from the host lobby.');

    await Promise.all(roster.map(toggleReady));
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
    await captureResponsive(roster[0].page, 'prompt-editing');

    await Promise.all(roster.slice(1).map((player, index) => submitPrompt(player, prompts[index + 1])));
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
    await Promise.all(roster.slice(1).map(submitTextBribes));
    await expect(roster[0].page.getByText('11 of 12 bribes sent', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(roster[0].page.getByText('Send your bribes', { exact: true })).toBeVisible();

    const finalEditedBribe = 'Final edited bribe that blocks progression';
    await roster[0].page.getByRole('textbox').first().fill(finalEditedBribe);
    await roster[0].page.getByRole('button', { name: 'Resubmit bribe' }).click();
    await waitForVisible(roster[0].page, 'Pick your favourite');
    await expect(editedTarget.page.locator('body')).toContainText(finalEditedBribe, { timeout: 10000 });
    await Promise.all(roster.map((player) => expect(player.page.locator('label.soft-card')).toHaveCount(3, { timeout: 10000 })));
    await captureResponsive(roster[0].page, 'voting-three-bribes');
    console.log('Submitted 12 bribes, including one image upload, and verified three choices per player.');

    await Promise.all(roster.map(submitVotes));
    await capture(roster[0].page, 'appreciation');
    await Promise.all(roster.map(submitAppreciation));
    await waitForVisible(roster[0].page, 'Scoreboard');
    await capture(roster[0].page, 'scoreboard');
    console.log('Completed voting and reached results.');

    const nextRoundButton = roster[0].page.getByRole('button', { name: 'Start next round' });
    await setPromptsAnsweredPerPlayer(roster[0], 4);
    await expect(nextRoundButton).toBeDisabled();
    await expect(roster[0].page.getByText('At least 5 connected players are needed')).toBeVisible();

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

    for (const player of roster.filter((candidate) => candidate !== disconnectedPlayer)) {
      await expect(player.page.locator('body')).toContainText(player.name, { timeout: 10000 });
    }

    await verifyMissingBribeMode(browser, 'AutoFill');
    await verifyMissingBribeMode(browser, 'NoFallback');
    console.log('Verified Auto-fill and No fallback missing-submission flows.');

    if (notes.length > 0) {
      throw new Error(`Browser errors detected:\n${notes.map((note) => `- ${note}`).join('\n')}`);
    }
  } finally {
    await Promise.allSettled(roster.map((player) => player.context.close()));
    await browser.close();
    await fs.rm(imagePath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
