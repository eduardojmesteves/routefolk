#!/usr/bin/env node
// ============================================================
// routefolk — local static validation
// Run from repo root: node scripts/local-test.mjs
// Dependency-free checks for broken local references, stale UI
// artifacts, module import drift, and service-worker cache drift.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REMOVED_FIXES_FILE = ['production', 'fixes.js'].join('-');
const REMOVED_FIXES_PATH = ['screens', REMOVED_FIXES_FILE].join('/');

const result = { passed: [], warnings: [], failed: [] };
const pass = (message) => result.passed.push(message);
const warn = (message) => result.warnings.push(message);
const fail = (message) => result.failed.push(message);
const rel = (file) => path.relative(ROOT, file).replaceAll(path.sep, '/');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const stripQuery = (asset) => asset.split('?')[0].replace(/^\.\//, '');

function listFiles(dir = ROOT) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (['.git', 'node_modules', '.cache', 'dist', 'build'].includes(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}
function localAssetFromUrl(url) {
  if (/^(https?:|data:|mailto:|tel:|#)/.test(url)) return null;
  return stripQuery(url).replace(/^\//, '');
}

const files = listFiles();
const textFiles = files.filter((file) => /\.(html|js|mjs|css|json|sql)$/i.test(file));

function checkRequiredFiles() {
  const required = [
    'index.html', 'app.js', 'sw.js', 'manifest.json',
    'screens/app-renderer.js', 'screens/app-actions.js', 'screens/ui-enhancements.js',
    'screens/wizards.js', 'screens/extra-writes.js', 'screens/gpx-panel.js', 'screens/archive-map.js',
    'styles/shell.css', 'styles/app-ui.css', 'styles/cleanup.css', 'styles/wizards.css', 'styles/refinements.css',
    'lib/items.js', 'migrations/014_items.sql', 'state/ui-state.js',
  ];
  for (const file of required) exists(file) ? pass(`Required file exists: ${file}`) : fail(`Missing required file: ${file}`);
}

function checkNoStaleRefs() {
  const banned = ['app-v2.js', 'screens/v2', 'styles/v2-', REMOVED_FIXES_FILE];
  for (const file of textFiles) {
    if (rel(file) === 'scripts/local-test.mjs') continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const token of banned) if (content.includes(token)) fail(`Stale reference '${token}' in ${rel(file)}`);
  }
  if (exists(REMOVED_FIXES_PATH)) fail(`Obsolete file still exists: ${REMOVED_FIXES_PATH}`);
  else pass(`${REMOVED_FIXES_PATH} is absent.`);
}

function checkHtmlAssets() {
  const html = read('index.html');
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => localAssetFromUrl(match[1]))
    .filter(Boolean);
  for (const asset of refs) exists(asset) ? pass(`HTML asset exists: ${asset}`) : fail(`HTML references missing asset: ${asset}`);
  if (!html.includes('screens/ui-enhancements.js')) fail('index.html does not load screens/ui-enhancements.js');
  if (html.includes(REMOVED_FIXES_PATH)) fail(`index.html still loads ${REMOVED_FIXES_PATH}`);
  if (!html.includes('styles/refinements.css')) fail('index.html does not load styles/refinements.css');
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

function checkCssUrls() {
  for (const file of files.filter((item) => /\.css$/i.test(item))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)) {
      const asset = localAssetFromUrl(match[1]);
      if (asset) fail(`CSS import still present in ${rel(file)}: ${asset}`);
    }
  }
  pass('CSS import scan completed.');
}

function checkServiceWorkerCache() {
  const sw = read('sw.js');
  const cached = [...sw.matchAll(/'\.\/([^']+)'/g)].map((match) => stripQuery(match[1])).filter(Boolean);
  for (const asset of cached) if (asset && !exists(asset)) fail(`Service worker caches missing asset: ${asset}`);
  const htmlAssets = [...read('index.html').matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => localAssetFromUrl(match[1]))
    .filter(Boolean);
  for (const asset of htmlAssets) if (!cached.includes(asset) && asset !== 'manifest.json') warn(`HTML asset is not explicitly cached by sw.js: ${asset}`);
  if (!sw.includes('routefolk-shell-v92-clean-ui-01')) fail('Service worker cache name was not bumped to v92 clean UI.');
  else pass('Service worker cache name is current.');
  if (sw.includes(REMOVED_FIXES_PATH)) fail(`Service worker still caches ${REMOVED_FIXES_PATH}`);
}

function checkCriticalUiHooks() {
  const renderer = read('screens/app-renderer.js');
  const ui = read('screens/ui-enhancements.js');
  const app = read('app.js');
  const archiveMap = read('screens/archive-map.js');
  const required = [
    ['renderer', renderer, 'function dSummary'], ['renderer', renderer, 'function dArchive'], ['renderer', renderer, 'function dAccount'],
    ['ui enhancements', ui, 'function mobileSummary'], ['ui enhancements', ui, 'function mobileCosts'], ['ui enhancements', ui, 'function mobileItems'], ['ui enhancements', ui, 'function desktopPalettePanel'], ['ui enhancements', ui, 'mobileSignature'],
    ['app state resume', app, 'resumeVisibleView'], ['app state resume', app, 'visibilitychange'],
    ['archive map', archiveMap, 'drawSvgFallback'], ['archive map', archiveMap, 'OpenStreetMap'],
  ];
  for (const [label, content, token] of required) content.includes(token) ? pass(`Critical hook present in ${label}: ${token}`) : fail(`Missing critical hook in ${label}: ${token}`);
}

function printSummary() {
  console.log('\nroutefolk local validation');
  console.log('='.repeat(32));
  console.log(`Passed:   ${result.passed.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Failed:   ${result.failed.length}`);
  if (result.warnings.length) { console.log('\nWarnings'); result.warnings.forEach((item) => console.log(`- ${item}`)); }
  if (result.failed.length) { console.log('\nFailures'); result.failed.forEach((item) => console.log(`- ${item}`)); }
  console.log(`\nResult: ${result.failed.length === 0 ? 'PASS' : 'FAIL'}`);
  process.exitCode = result.failed.length === 0 ? 0 : 1;
}

checkRequiredFiles();
checkNoStaleRefs();
checkHtmlAssets();
checkModuleImports();
checkCssUrls();
checkServiceWorkerCache();
checkCriticalUiHooks();
printSummary();
