// Usage: node scripts/optimise-instructions.mjs <directory of commissioned PNGs>
// Keep full resolution for text legibility; Chromium strips metadata and encodes WebP.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Provide the directory containing Bribery_Instructions_*.png');
const destination = path.resolve(import.meta.dirname, '../public/instructions');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [input, output] of [['Main', 'overview'], ['Pg01', 'ask'], ['Pg02', 'answer'], ['Pg03', 'choose'], ['Pg04', 'winners']]) {
    const original = await fs.readFile(path.join(source, `Bribery_Instructions_${input}.png`));
    const result = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const encoded = canvas.toDataURL('image/webp', 0.86);
      if (!encoded.startsWith('data:image/webp;')) throw new Error('WebP encoding unavailable');
      return { width: canvas.width, height: canvas.height, data: encoded.split(',')[1] };
    }, `data:image/png;base64,${original.toString('base64')}`);
    const encoded = Buffer.from(result.data, 'base64');
    await fs.writeFile(path.join(destination, `${output}.webp`), encoded);
    console.log(`${output}: ${result.width}x${result.height}, ${original.length} -> ${encoded.length} bytes`);
  }
} finally {
  await browser.close();
}
