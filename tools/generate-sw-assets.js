#!/usr/bin/env node
// tools/generate-sw-assets.js
// -----------------------------------------------------------------------
// Compares index.html entrypoints against sw.js SHELL_ASSETS and reports:
//   - Files in index.html missing from SHELL_ASSETS (not cached)
//   - Files in SHELL_ASSETS that don't exist on disk (stale entries)
//   - Files that are present in both (healthy)
//
// Usage:  node tools/generate-sw-assets.js
// -----------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Parsers
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

function parseIndexHtmlAssets() {
  const src = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const assets = [];

  // <script src="...">
  const scriptPattern = /<script[^>]+\bsrc=["']([^"']+)["']/g;
  let m;
  while ((m = scriptPattern.exec(src)) !== null) {
    assets.push(m[1]);
  }

  // <link rel="stylesheet" href="...">
  const linkPattern = /<link[^>]+>/g;
  while ((m = linkPattern.exec(src)) !== null) {
    const tag = m[0];
    if (/rel=["']stylesheet["']/.test(tag)) {
      const hrefMatch = tag.match(/href=["']([^"']+)["']/);
      if (hrefMatch) assets.push(hrefMatch[1]);
    }
  }

  // Local paths only
  return assets.filter((a) => !/^https?:\/\//.test(a));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripQuery(p) {
  return p.split('?')[0];
}

/** Normalise to bare path without leading "./" for comparison */
function normalise(p) {
  return stripQuery(p).replace(/^\.\//, '');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(projectRoot, normalise(relPath)));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const shellAssets = parseShellAssets();
const htmlAssets = parseIndexHtmlAssets();

const shellNormalised = new Set(shellAssets.map(normalise));
const htmlNormalised = new Set(htmlAssets.map(normalise));

// 1. Files in index.html but NOT in SHELL_ASSETS
const missingFromCache = htmlAssets.filter((a) => !shellNormalised.has(normalise(a)));

// 2. Files in SHELL_ASSETS that don't exist on disk (skip "./" sentinel)
const staleInCache = shellAssets.filter((a) => {
  if (a === './') return false; // "./" maps to index.html — checked separately
  return !fileExists(a);
});

// 3. Files that are good (in both and exist on disk)
const healthy = shellAssets.filter((a) => {
  if (a === './') return true;
  return fileExists(a);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('='.repeat(60));
console.log('  routefolk — SW shell asset drift report');
console.log('='.repeat(60));

if (missingFromCache.length === 0) {
  console.log('\n[OK] All index.html entrypoints are in SHELL_ASSETS.');
} else {
  console.log(`\n[MISSING FROM SHELL_ASSETS] (${missingFromCache.length} file(s)):`);
  console.log('  These are referenced by index.html but not cached by the SW.');
  for (const f of missingFromCache) {
    console.log(`  - ${f}`);
  }
}

if (staleInCache.length === 0) {
  console.log('\n[OK] All SHELL_ASSETS entries exist on disk.');
} else {
  console.log(`\n[STALE — FILE NOT FOUND] (${staleInCache.length} entry/entries):`);
  console.log('  These are listed in SHELL_ASSETS but the file does not exist.');
  for (const f of staleInCache) {
    console.log(`  - ${f}`);
  }
}

console.log(`\n[HEALTHY] ${healthy.length} asset(s) present in both SHELL_ASSETS and on disk.`);

// ---------------------------------------------------------------------------
// Reviewed list output
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60));
console.log('  Reviewed SHELL_ASSETS list (paste into sw.js if needed)');
console.log('='.repeat(60));
console.log('\nconst SHELL_ASSETS = [');
for (const a of shellAssets) {
  const exists = a === './' || fileExists(a);
  const tag = exists ? '' : ' // STALE — file missing';
  console.log(`  '${a}',${tag}`);
}
// Append any index.html assets that are missing from the current list
for (const a of missingFromCache) {
  console.log(`  // UNCACHED ENTRYPOINT — add: './${normalise(a)}',`);
}
console.log('];');

console.log('');

const hasIssues = missingFromCache.length > 0 || staleInCache.length > 0;
process.exit(hasIssues ? 1 : 0);
