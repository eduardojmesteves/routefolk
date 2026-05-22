import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(new URL('.', import.meta.url).pathname, '../..');

// ---------------------------------------------------------------------------
// Parse SHELL_ASSETS from sw.js
// ---------------------------------------------------------------------------
function parseShellAssets() {
  const swPath = path.join(projectRoot, 'sw.js');
  const src = fs.readFileSync(swPath, 'utf8');

  // Match the array literal assigned to SHELL_ASSETS
  const match = src.match(/const\s+SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not find SHELL_ASSETS array in sw.js');

  const arrayContents = match[1];

  // Extract every quoted string (single or double quotes)
  const entries = [];
  const stringPattern = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = stringPattern.exec(arrayContents)) !== null) {
    entries.push(m[1]);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Parse local scripts and stylesheets from index.html
// ---------------------------------------------------------------------------
function parseIndexHtmlAssets() {
  const htmlPath = path.join(projectRoot, 'index.html');
  const src = fs.readFileSync(htmlPath, 'utf8');

  const assets = [];

  // <script src="...">
  const scriptPattern = /<script[^>]+\bsrc=["']([^"']+)["']/g;
  let m;
  while ((m = scriptPattern.exec(src)) !== null) {
    assets.push(m[1]);
  }

  // <link rel="stylesheet" href="...">  (order of attributes varies)
  const linkPattern = /<link[^>]+>/g;
  while ((m = linkPattern.exec(src)) !== null) {
    const tag = m[0];
    if (/rel=["']stylesheet["']/.test(tag)) {
      const hrefMatch = tag.match(/href=["']([^"']+)["']/);
      if (hrefMatch) assets.push(hrefMatch[1]);
    }
  }

  // Keep only local paths (not http:// / https://)
  return assets.filter((a) => !/^https?:\/\//.test(a));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip query-string from a URL path so we can check the file on disk.
 * e.g. "./style.css?v=123" → "./style.css"
 */
function stripQuery(p) {
  return p.split('?')[0];
}

/**
 * Normalise a SHELL_ASSETS path to the same form used in index.html.
 * sw.js uses "./" prefix; index.html typically omits it.
 * We normalise both sides to the bare path without leading "./".
 */
function normalise(p) {
  return stripQuery(p).replace(/^\.\//, '');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('service-worker asset consistency', () => {
  const shellAssets = parseShellAssets();

  it('SHELL_ASSETS array is non-empty', () => {
    expect(shellAssets.length).toBeGreaterThan(0);
  });

  it('every file listed in SHELL_ASSETS exists on disk', () => {
    const missing = [];

    for (const asset of shellAssets) {
      // "./" maps to index.html at project root
      if (asset === './') {
        const indexPath = path.join(projectRoot, 'index.html');
        if (!fs.existsSync(indexPath)) missing.push(asset + ' (→ index.html)');
        continue;
      }

      const filePath = path.join(projectRoot, stripQuery(asset).replace(/^\.\//, ''));
      if (!fs.existsSync(filePath)) {
        missing.push(asset);
      }
    }

    expect(missing, `Missing files on disk:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every local asset in index.html is covered by SHELL_ASSETS', () => {
    const htmlAssets = parseIndexHtmlAssets();
    const shellNormalised = new Set(shellAssets.map(normalise));

    const uncached = [];
    for (const asset of htmlAssets) {
      if (!shellNormalised.has(normalise(asset))) {
        uncached.push(asset);
      }
    }

    expect(
      uncached,
      `Local assets in index.html not found in SHELL_ASSETS:\n${uncached.join('\n')}`,
    ).toEqual([]);
  });
});
