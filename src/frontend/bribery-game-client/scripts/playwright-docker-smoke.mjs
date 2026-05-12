import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:5080';
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
  return { context, page, name };
}

async function waitForVisible(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
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
  await player.page.getByPlaceholder('Your real name').fill(player.name);
  await player.page.getByRole('button', { name: 'Create a new room' }).click();
  await expect(player.page).toHaveURL(/\/game\/[A-Z0-9]+/, { timeout: 15000 });
  await waitForVisible(player.page, 'Room code');
  const gameId = new URL(player.page.url()).pathname.split('/').pop();
  if (!gameId) throw new Error('Could not extract game id from URL.');
  return gameId;
}

async function joinGame(player, gameId) {
  await player.page.goto(`${baseUrl}/game/${gameId}`);
  await player.page.getByPlaceholder('Your real name').fill(player.name);
  await player.page.getByRole('button', { name: 'Join room' }).click();
  await waitForVisible(player.page, 'Room code');
}

async function toggleReady(player) {
  await player.page.getByRole('button', { name: 'I am ready' }).click();
  await expect(player.page.getByRole('button', { name: 'I need a moment' })).toBeVisible({ timeout: 10000 });
}

async function submitPrompt(player, prompt) {
  await waitForVisible(player.page, 'Write your prompt');
  await player.page.getByPlaceholder('What should people bribe you for?').fill(prompt);
  await player.page.getByRole('button', { name: 'Submit prompt' }).click();
  await waitForAnyText(player.page, ['Prompt submitted', 'Send your bribes']);
}

async function submitTextBribes(player) {
  await waitForVisible(player.page, 'Send your bribes');

  const textareas = player.page.getByPlaceholder('Write a tempting little bribe');
  const textareaCount = await textareas.count();

  for (let index = 0; index < textareaCount; index += 1) {
    await textareas
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

  const option = player.page.locator('label.soft-card').first();
  if ((await option.count()) > 0) {
    await option.click();
    await player.page.getByRole('button', { name: 'Submit vote' }).click();
    await waitForAnyText(player.page, ['Vote submitted', 'Round 1 wrapped']);
  } else {
    await waitForVisible(player.page, 'Voting is only for players who received bribes this round');
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

    const duplicate = await makePlayer(browser, 'Duplicate Alice');
    await duplicate.page.goto(`${baseUrl}/game/${gameId}`);
    await duplicate.page.getByPlaceholder('Your real name').fill('Alice');
    await duplicate.page.getByRole('button', { name: 'Join room' }).click();
    await waitForVisible(duplicate.page, 'Another player with that name is already in the game');
    await duplicate.context.close();
    console.log('Verified duplicate-name join error flow.');

    await Promise.all(roster.map(toggleReady));
    await roster[0].page.getByRole('button', { name: 'Start game' }).click();
    await waitForVisible(roster[0].page, 'Write your prompt');
    console.log('Started the game from the host lobby.');

    await Promise.all(
      roster.map((player, index) =>
        submitPrompt(player, [
          'best snack for a secret meeting',
          'most dramatic excuse for being late',
          'least suspicious disguise',
          'best bribe for a tired judge',
        ][index]),
      ),
    );
    console.log('Submitted prompts for all players.');

    await submitMixedBribes(roster[0], imagePath);
    await Promise.all(roster.slice(1).map(submitTextBribes));
    console.log('Submitted bribes, including one image upload.');

    await Promise.all(roster.map(submitVotes));
    await waitForVisible(roster[0].page, 'Round 1 wrapped');
    await waitForVisible(roster[0].page, 'Scoreboard');
    console.log('Completed voting and reached results.');

    await roster[0].page.getByRole('button', { name: 'Start next round' }).click();
    await waitForVisible(roster[0].page, 'Round 2');
    console.log('Started round 2 from results.');

    for (const player of roster) {
      await expect(player.page.locator('body')).toContainText(player.name, { timeout: 10000 });
    }

    if (notes.length > 0) {
      console.log('Browser notes:');
      for (const note of notes) console.log(`- ${note}`);
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
