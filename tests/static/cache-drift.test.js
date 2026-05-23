import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Cache-drift tests
//
// Complements service-worker-assets.test.js.
// That file already checks:
//   - SHELL_ASSETS is non-empty
//   - Every SHELL_ASSETS entry exists on disk
//   - Every local index.html asset is in SHELL_ASSETS
//
// This file adds guards for known-critical file groups so that adding a new
// file to lib/ (or other dirs) without updating sw.js is caught immediately.
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(new URL('.', import.meta.url).pathname, '../..');

// ---------------------------------------------------------------------------
// Shared parsers (kept local to avoid coupling to the other test file)
// ---------------------------------------------------------------------------

function parseShellAssets() {
  const src = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8');
  const match = src.match(/const\s+SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not find SHELL_ASSETS array in sw.js');

  const entries = [];
  const pattern = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = pattern.exec(match[1])) !== null) {
    entries.push(m[1]);
  }
  return entries;
}

function normalise(p) {
  return p.split('?')[0].replace(/^\.\//, '');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('service-worker cache drift', () => {
  const shellAssets = parseShellAssets();
  const shellNormalised = new Set(shellAssets.map(normalise));

  it('every lib/*.js file on disk is listed in SHELL_ASSETS', () => {
    const libDir = path.join(projectRoot, 'lib');
    const libFiles = fs
      .readdirSync(libDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => `lib/${f}`);

    const uncached = libFiles.filter((f) => !shellNormalised.has(f));

    expect(
      uncached,
      `lib/ files not found in SHELL_ASSETS (add them to sw.js):\n${uncached.join('\n')}`,
    ).toEqual([]);
  });

  it('lib/trip-members.js is explicitly in SHELL_ASSETS', () => {
    expect(
      shellNormalised.has('lib/trip-members.js'),
      'lib/trip-members.js must be listed in SHELL_ASSETS — it was previously missing',
    ).toBe(true);
  });
});
