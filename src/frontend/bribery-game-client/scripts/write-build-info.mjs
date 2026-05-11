import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..', 'src', 'app');
const outputPath = resolve(appDir, 'build-info.generated.ts');

const commitHash = process.env.COMMIT_HASH || 'local';
const deployedAt = process.env.DEPLOYED_AT || '';
const shortCommitHash = commitHash === 'local' ? 'local' : commitHash.slice(0, 7);

mkdirSync(appDir, { recursive: true });
writeFileSync(
  outputPath,
  `export const buildInfo = ${JSON.stringify({
    commitHash,
    shortCommitHash,
    deployedAt,
  }, null, 2)} as const;\n`,
);
