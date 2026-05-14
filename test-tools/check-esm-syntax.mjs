#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const files = [
  'app.js',
  'sw.js',
  'components/action-modals.js',
  'components/content-events.js',
  'components/stage-form.js',
  'components/expense-form.js',
  'state/data-loaders.js',
  'utils/state-selectors.js',
];

let failed = 0;

for (const file of files) {
  if (!existsSync(file)) {
    console.warn(`skip ${file} — file not found`);
    continue;
  }

  try {
    if (file.endsWith('.js') && file !== 'sw.js') {
      const code = await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8'));
      execFileSync('node', ['--input-type=module', '--check'], { input: code, stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      execFileSync('node', ['--check', file], { stdio: ['pipe', 'pipe', 'pipe'] });
    }
    console.log(`ok ${file}`);
  } catch (err) {
    failed += 1;
    console.error(`failed ${file}`);
    console.error(err.stderr?.toString() || err.message);
  }
}

if (failed) {
  console.error(`${failed} syntax check(s) failed.`);
  process.exit(1);
}

console.log('All syntax checks passed.');
