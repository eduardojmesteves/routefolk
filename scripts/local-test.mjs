#!/usr/bin/env node
// ============================================================
// routefolk — local static validation
// Run from repo root: node scripts/local-test.mjs
// This is intentionally dependency-free. It catches broken local
// references, stale migration artifacts, bad module import paths,
// and service-worker cache drift. It does not replace manual UI QA.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const result = {
  passed: [],
  warnings: [],
  failed: [],
};

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}
function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}
function pass(message) { result.passed.push(message); }
function warn(message) { result.warnings.push(message); }
function fail(message) { result.failed.push(message); }
function listFiles(dir = ROOT) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    if (['.git', 'node_modules', '.cache', 'dist', 'build'].includes(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) entries.push(...listFiles(full));
    else entries.push(full);
  }
  return entries;
}
function stripQuery(asset) {
  return asset.split('?')[0].replace(/^\.\//, '');
}
function localAssetFromUrl(url) {
  if (/^(https?:|data:|mailto:|tel:|#)/.test(url)) return null;
  return stripQuery(url).replace(/^\//, '');
}

const files = listFiles();
const textFiles = files.filter((file) => /\.(html|js|mjs|css|json|sql)$/i.test(file));

function checkRequiredFiles() {
  const required = [
    'index.html',
    'app.js',
    'sw.js',
    'manifest.json',
    'screens/app-renderer.js',
    'screens/app-actions.js',
    'screens/wizards.js',
    'screens/extra-writes.js',
    'screens/gpx-panel.js',
    'screens/archive-map.js',
    'screens/production-fixes.js',
    'styles/shell.css',
    'styles/app-ui.css',
    'styles/cleanup.css',
    'styles/wizards.css',
    'styles/refinements.css',
    'lib/items.js',
    'migrations/014_items.sql',
  ];
  for (const file of required) {
    if (exists(file)) pass(`Required file exists: ${file}`);
    else fail(`Missing required file: ${file}`);
  }
}

function checkNoStaleMigrationRefs() {
  const banned = [
    'app-v2.js',
    'screens/v2',
    'styles/v2-',
    'vendor/leaflet',
  ];
  for (const file of textFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const token of banned) {
      if (content.includes(token)) fail(`Stale migration reference '${token}' in ${rel(file)}`);
    }
  }
  pass('No stale app-v2/screens-v2/styles-v2/vendor-leaflet references found.');
}

function checkHtmlAssets() {
  const html = read('index.html');
  const refs = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)) {
    const asset = localAssetFromUrl(match[1]);
    if (asset) refs.push(asset);
  }
  for (const asset of refs) {
    if (exists(asset)) pass(`HTML asset exists: ${asset}`);
    else fail(`HTML references missing asset: ${asset}`);
  }
  if (!html.includes('styles/refinements.css')) fail('index.html does not load styles/refinements.css');
  else pass('index.html loads styles/refinements.css.');
}

function checkModuleImports() {
  const jsFiles = files.filter((file) => /\.js$/i.test(file));
  const importRe = /(?:import\s+(?:[^'";]+?\s+from\s+)?|import\s*\()\s*["']([^"']+)["']/g;
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(importRe)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), spec);
      const candidates = [target, `${target}.js`, `${target}.json`];
      if (!candidates.some(fs.existsSync)) fail(`Broken import in ${rel(file)}: ${spec}`);
    }
  }
  pass('Local JavaScript import paths checked.');
}

function checkCssImportsAndUrls() {
  const cssFiles = files.filter((file) => /\.css$/i.test(file));
  for (const file of cssFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)) {
      const asset = localAssetFromUrl(match[1]);
      if (asset) fail(`CSS import still present in ${rel(file)}: ${asset}`);
    }
    for (const match of content.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      const asset = localAssetFromUrl(match[1]);
      if (!asset || asset.startsWith('data:')) continue;
      const target = path.resolve(path.dirname(file), asset);
      if (!fs.existsSync(target)) warn(`CSS url may be external or missing in ${rel(file)}: ${asset}`);
    }
  }
  pass('CSS import/url scan completed.');
}

function checkServiceWorkerCache() {
  const sw = read('sw.js');
  const cached = [...sw.matchAll(/'\.\/([^']+)'/g)].map((match) => stripQuery(match[1])).filter(Boolean);
  for (const asset of cached) {
    if (asset === '') continue;
    if (!exists(asset)) fail(`Service worker caches missing asset: ${asset}`);
  }
  const html = read('index.html');
  const htmlAssets = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => localAssetFromUrl(match[1]))
    .filter(Boolean);
  for (const asset of htmlAssets) {
    if (!cached.includes(asset) && asset !== 'manifest.json' && !asset.startsWith('https://')) {
      warn(`HTML asset is not explicitly cached by sw.js: ${asset}`);
    }
  }
  if (!sw.includes('routefolk-shell-v90-refinements-01')) fail('Service worker cache name was not bumped to v90 refinements.');
  else pass('Service worker cache name is current.');
}

function checkCriticalUiHooks() {
  const renderer = read('screens/app-renderer.js');
  const fixes = read('screens/production-fixes.js');
  const archiveMap = read('screens/archive-map.js');
  const requiredTokens = [
    ['renderer', renderer, 'function dSummary'],
    ['renderer', renderer, 'function dArchive'],
    ['renderer', renderer, 'function dAccount'],
    ['fixes', fixes, 'patchTodayLabels'],
    ['fixes', fixes, 'patchStageCostsAdd'],
    ['fixes', fixes, 'patchAccount'],
    ['fixes', fixes, 'rf-v2-add-stage-expense'],
    ['archive map', archiveMap, 'drawSvgFallback'],
    ['archive map', archiveMap, 'OpenStreetMap'],
  ];
  for (const [label, content, token] of requiredTokens) {
    if (content.includes(token)) pass(`Critical UI hook present in ${label}: ${token}`);
    else fail(`Missing critical UI hook in ${label}: ${token}`);
  }
}

function printSummary() {
  const ok = result.failed.length === 0;
  console.log('\nroutefolk local validation');
  console.log('='.repeat(32));
  console.log(`Passed:   ${result.passed.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Failed:   ${result.failed.length}`);

  if (result.warnings.length) {
    console.log('\nWarnings');
    for (const item of result.warnings) console.log(`- ${item}`);
  }
  if (result.failed.length) {
    console.log('\nFailures');
    for (const item of result.failed) console.log(`- ${item}`);
  }

  console.log(`\nResult: ${ok ? 'PASS' : 'FAIL'}`);
  process.exitCode = ok ? 0 : 1;
}

checkRequiredFiles();
checkNoStaleMigrationRefs();
checkHtmlAssets();
checkModuleImports();
checkCssImportsAndUrls();
checkServiceWorkerCache();
checkCriticalUiHooks();
printSummary();
