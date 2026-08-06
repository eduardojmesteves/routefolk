# Google Sign-In for the MCP OAuth Shim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OAuth shim's "paste your API key" login page with the existing self-hosted GoTrue Google sign-in, so connecting Claude from a phone needs nothing beyond a normal Google login.

**Architecture:** `GET /authorize` now redirects straight to GoTrue's existing Google sign-in instead of rendering a form, stashing Claude's original request in a new in-memory `pendingAuthorizations` map. A new static callback page reads the session token GoTrue returns (in the URL fragment, browser-only) and posts it to a new verification endpoint, which confirms it's real by asking GoTrue directly, then completes the same authorization-code issuance the old flow used. `/token` is completely unchanged.

**Tech Stack:** Node's built-in `fetch` (Node 22, no new dependency) to call GoTrue's `/auth/v1/user` endpoint for verification.

## Global Constraints

- No new npm dependencies.
- Tests run via `node --test`; test files are never committed.
- No "agent," "AI," "assistant," or model-name branding in product-facing code, config, or docs.
- Everything here runs against the existing self-hosted stack only (GoTrue, Postgres, gateway, all already in `docker-compose.yml`) — no hosted Supabase involvement of any kind.
- Google sign-in **replaces** the API-key login step entirely — `/authorize` never shows a key-paste form again, and `POST /authorize` (the old key-check route) is removed.
- Every new route this plan adds must have a matching `nginx.conf` `location` block before the live-verification task — two separate live 404s already happened earlier in this project from routes added without one.
- `GOTRUE_URI_ALLOW_LIST` must include the API's own origin (confirmed against GoTrue's actual docs: comma-separated multiple entries are supported) alongside the existing `SITE_URL` entry — GoTrue rejects a `redirect_to` outside this list.

---

## File Structure

```
services/api/
├── oauth.js          (REWRITTEN — Google redirect instead of key form, 2 new routes, new pending-auth map)
├── server.js          (MODIFIED — createOAuthRouter() call site, auth-exemption list)
└── test/
    ├── oauth.test.mjs        (REWRITTEN — old key-form/POST-authorize tests replaced)
    └── server.test.mjs        (MODIFIED — OAuth-flow-through-/mcp test updated to the new login path)

docker-compose.yml                     (MODIFIED — GOTRUE_URI_ALLOW_LIST gains the API origin)
infrastructure/docker/nginx.conf       (MODIFIED — 2 new location blocks)
docs/deployment/self-hosting.md        (MODIFIED — login instructions updated)
```

---

### Task 1: Rewrite `oauth.js` — Google redirect, callback page, verification endpoint

**Files:**
- Modify: `services/api/oauth.js` (full rewrite)
- Test: `services/api/test/oauth.test.mjs` (full rewrite)

**Interfaces:**
- Consumes: Node's built-in `fetch`; everything else unchanged from the previous task
- Produces: `createOAuthRouter(): { router: express.Router, isValidAccessToken: (token: string) => boolean }` — **note the signature changed: no longer takes an `apiKey` parameter**, since the API key is no longer used anywhere in this module. `oauthIssuerUrl(req)` is unchanged.

This task changes `GET /authorize`'s behavior, removes `POST /authorize` entirely, and adds two new routes. `POST /token` is untouched — read it in the current file to confirm you're not modifying it.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `services/api/test/oauth.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { createOAuthRouter } from '../oauth.js';

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

const VALID_GOOGLE_TOKEN = 'valid-google-session-token';

async function withOAuthApp(run) {
  const { router, isValidAccessToken } = createOAuthRouter();
  const app = express();
  app.use(express.json());
  app.use(router);
  // Fake GoTrue /auth/v1/user, mounted on the SAME app/port so oauth.js's
  // internal fetch(`${issuer}/auth/v1/user`) — which infers the issuer from
  // the request's own host — hits this mock, not a real GoTrue instance.
  app.get('/auth/v1/user', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (token === VALID_GOOGLE_TOKEN) return res.json({ id: 'user-1', email: 'rider@example.com' });
    res.status(401).json({ error: 'invalid token' });
  });
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}`, isValidAccessToken);
  } finally {
    server.close();
  }
}

function extractPendingId(locationHeader) {
  const googleUrl = new URL(locationHeader);
  const redirectTo = googleUrl.searchParams.get('redirect_to');
  const callbackUrl = new URL(redirectTo);
  return callbackUrl.searchParams.get('pending');
}

async function obtainAuthorizationCode(baseUrl, { redirectUri, codeChallenge, state, accessToken = VALID_GOOGLE_TOKEN }) {
  const authorizeResponse = await fetch(
    `${baseUrl}/authorize?client_id=routefolk-mcp&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`,
    { redirect: 'manual' },
  );
  const pending = extractPendingId(authorizeResponse.headers.get('location'));
  const verifyResponse = await fetch(`${baseUrl}/google-verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pending, access_token: accessToken }),
  });
  return verifyResponse;
}

test('GET /.well-known/oauth-protected-resource points at /mcp on this origin', async () => {
  await withOAuthApp(async baseUrl => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.resource, `${baseUrl}/mcp`);
    assert.deepEqual(body.authorization_servers, [baseUrl]);
  });
});

test('GET /.well-known/oauth-authorization-server advertises S256 PKCE and no registration endpoint', async () => {
  await withOAuthApp(async baseUrl => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    const body = await response.json();
    assert.deepEqual(body.code_challenge_methods_supported, ['S256']);
    assert.equal(body.registration_endpoint, undefined);
  });
});

test('GET /authorize rejects an unknown client_id', async () => {
  await withOAuthApp(async baseUrl => {
    const { challenge } = pkcePair();
    const response = await fetch(`${baseUrl}/authorize?client_id=someone-else&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`);
    assert.equal(response.status, 400);
  });
});

test('GET /authorize redirects to GoTrue Google sign-in, carrying a pending id back to our own callback', async () => {
  await withOAuthApp(async baseUrl => {
    const { challenge } = pkcePair();
    const response = await fetch(
      `${baseUrl}/authorize?client_id=routefolk-mcp&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`,
      { redirect: 'manual' },
    );
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, baseUrl);
    assert.equal(location.pathname, '/auth/v1/authorize');
    assert.equal(location.searchParams.get('provider'), 'google');
    const redirectTo = new URL(location.searchParams.get('redirect_to'));
    assert.equal(redirectTo.pathname, '/google-callback');
    assert.ok(redirectTo.searchParams.get('pending'));
  });
});

test('GET /google-callback serves a page that posts the fragment token to /google-verify', async () => {
  await withOAuthApp(async baseUrl => {
    const response = await fetch(`${baseUrl}/google-callback`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /\/google-verify/);
    assert.match(html, /access_token/);
  });
});

test('the full flow — /authorize then /google-verify — issues a working authorization code, redeemable at /token', async () => {
  await withOAuthApp(async (baseUrl, isValidAccessToken) => {
    const { verifier, challenge } = pkcePair();
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';

    const verifyResponse = await obtainAuthorizationCode(baseUrl, { redirectUri, codeChallenge: challenge, state: 'xyz' });
    assert.equal(verifyResponse.status, 200);
    const { redirect } = await verifyResponse.json();
    const redirectUrl = new URL(redirect);
    assert.equal(`${redirectUrl.origin}${redirectUrl.pathname}`, redirectUri);
    assert.equal(redirectUrl.searchParams.get('state'), 'xyz');
    const code = redirectUrl.searchParams.get('code');
    assert.ok(code);

    const tokenResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }),
    });
    assert.equal(tokenResponse.status, 200);
    const tokens = await tokenResponse.json();
    assert.equal(isValidAccessToken(tokens.access_token), true);
  });
});

test('/google-verify rejects an invalid GoTrue access token', async () => {
  await withOAuthApp(async baseUrl => {
    const { challenge } = pkcePair();
    const verifyResponse = await obtainAuthorizationCode(baseUrl, {
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      codeChallenge: challenge,
      state: 'xyz',
      accessToken: 'not-a-real-google-token',
    });
    assert.equal(verifyResponse.status, 401);
  });
});

test('/google-verify rejects an unknown or expired pending id', async () => {
  await withOAuthApp(async baseUrl => {
    const response = await fetch(`${baseUrl}/google-verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pending: 'made-up-pending-id', access_token: VALID_GOOGLE_TOKEN }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_grant' });
  });
});

test('a pending id can only be redeemed once', async () => {
  await withOAuthApp(async baseUrl => {
    const { challenge } = pkcePair();
    const authorizeResponse = await fetch(
      `${baseUrl}/authorize?client_id=routefolk-mcp&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`,
      { redirect: 'manual' },
    );
    const pending = extractPendingId(authorizeResponse.headers.get('location'));
    const verify = () => fetch(`${baseUrl}/google-verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pending, access_token: VALID_GOOGLE_TOKEN }),
    });
    const first = await verify();
    assert.equal(first.status, 200);
    const second = await verify();
    assert.equal(second.status, 400);
  });
});

test('refresh_token rotation still works end to end after a Google-based login', async () => {
  await withOAuthApp(async baseUrl => {
    const { verifier, challenge } = pkcePair();
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
    const verifyResponse = await obtainAuthorizationCode(baseUrl, { redirectUri, codeChallenge: challenge, state: 'xyz' });
    const { redirect } = await verifyResponse.json();
    const code = new URL(redirect).searchParams.get('code');

    const firstTokens = await (await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }),
    })).json();

    const refreshResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: firstTokens.refresh_token }),
    });
    assert.equal(refreshResponse.status, 200);
    const secondTokens = await refreshResponse.json();
    assert.notEqual(secondTokens.refresh_token, firstTokens.refresh_token);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test services/api/test/oauth.test.mjs`
Expected: FAIL — the new routes (`/google-callback`, `/google-verify`) don't exist, and `GET /authorize` still renders the old form instead of redirecting.

- [ ] **Step 3: Rewrite `services/api/oauth.js`**

```js
import express from 'express';
import crypto from 'node:crypto';

const OAUTH_CLIENT_ID = 'routefolk-mcp';
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function oauthIssuerUrl(req) {
  const configured = process.env.API_EXTERNAL_URL?.replace(/\/+$/, '');
  const inferred = `${req.protocol}://${req.get('host')}`;
  return configured || inferred;
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken() {
  return base64url(crypto.randomBytes(32));
}

function verifyPkce(codeVerifier, codeChallenge) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64url(hash) === codeChallenge;
}

function googleCallbackHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Connecting to Routefolk</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 420px; margin: 4rem auto; padding: 0 1rem;">
  <p id="status">Completing sign-in&hellip;</p>
  <script>
    (function () {
      var statusEl = document.getElementById('status');
      var params = new URLSearchParams(window.location.search);
      var pending = params.get('pending');
      var hashParams = new URLSearchParams(window.location.hash.slice(1));
      var accessToken = hashParams.get('access_token');
      if (!pending || !accessToken) {
        statusEl.textContent = 'Sign-in was not completed. You can close this tab and try again.';
        return;
      }
      fetch('/google-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pending: pending, access_token: accessToken }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error('verification failed');
          return response.json();
        })
        .then(function (data) {
          window.location.href = data.redirect;
        })
        .catch(function () {
          statusEl.textContent = 'Sign-in could not be completed. You can close this tab and try again.';
        });
    })();
  </script>
</body>
</html>`;
}

function issueTokenPair(accessTokens, refreshTokens) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  accessTokens.set(accessToken, { expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS });
  refreshTokens.set(refreshToken, { expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS });
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: 'mcp',
  };
}

export function createOAuthRouter() {
  const pendingAuthorizations = new Map();
  const authorizationCodes = new Map();
  const accessTokens = new Map();
  const refreshTokens = new Map();
  const router = express.Router();

  router.get('/.well-known/oauth-protected-resource', (req, res) => {
    const issuer = oauthIssuerUrl(req);
    res.json({ resource: `${issuer}/mcp`, authorization_servers: [issuer] });
  });

  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    const issuer = oauthIssuerUrl(req);
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
    });
  });

  router.get('/authorize', (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod, state } = req.query;
    if (clientId !== OAUTH_CLIENT_ID) return res.status(400).send('Unknown client_id.');
    if (!redirectUri) return res.status(400).send('redirect_uri is required.');
    if (codeChallengeMethod !== 'S256' || !codeChallenge) return res.status(400).send('PKCE code_challenge with S256 is required.');

    const pendingId = randomToken();
    pendingAuthorizations.set(pendingId, { redirectUri, codeChallenge, state, expiresAt: Date.now() + AUTH_CODE_TTL_MS });

    const issuer = oauthIssuerUrl(req);
    const callbackUrl = `${issuer}/google-callback?pending=${encodeURIComponent(pendingId)}`;
    const googleAuthUrl = `${issuer}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(callbackUrl)}`;
    res.redirect(googleAuthUrl);
  });

  router.get('/google-callback', (req, res) => {
    res.set('content-type', 'text/html').send(googleCallbackHtml());
  });

  router.post('/google-verify', async (req, res) => {
    const { pending, access_token: accessToken } = req.body || {};
    const entry = pendingAuthorizations.get(pending);
    if (!entry || entry.expiresAt < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
    pendingAuthorizations.delete(pending);

    const issuer = oauthIssuerUrl(req);
    let userResponse;
    try {
      userResponse = await fetch(`${issuer}/auth/v1/user`, { headers: { authorization: `Bearer ${accessToken}` } });
    } catch {
      return res.status(401).json({ error: 'invalid_grant' });
    }
    if (!userResponse.ok) return res.status(401).json({ error: 'invalid_grant' });

    const code = randomToken();
    authorizationCodes.set(code, { codeChallenge: entry.codeChallenge, redirectUri: entry.redirectUri, expiresAt: Date.now() + AUTH_CODE_TTL_MS });
    const redirectUrl = new URL(entry.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (entry.state) redirectUrl.searchParams.set('state', entry.state);
    res.json({ redirect: redirectUrl.toString() });
  });

  router.post('/token', express.urlencoded({ extended: false }), (req, res) => {
    const { grant_type: grantType } = req.body;

    if (grantType === 'authorization_code') {
      const { code, code_verifier: codeVerifier, redirect_uri: redirectUri } = req.body;
      const entry = authorizationCodes.get(code);
      if (!entry || entry.expiresAt < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
      if (entry.redirectUri !== redirectUri) return res.status(400).json({ error: 'invalid_grant' });
      if (!verifyPkce(codeVerifier || '', entry.codeChallenge)) return res.status(400).json({ error: 'invalid_grant' });
      authorizationCodes.delete(code);
      return res.json(issueTokenPair(accessTokens, refreshTokens));
    }

    if (grantType === 'refresh_token') {
      const { refresh_token: suppliedRefreshToken } = req.body;
      const entry = refreshTokens.get(suppliedRefreshToken);
      if (!entry || entry.expiresAt < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
      refreshTokens.delete(suppliedRefreshToken);
      return res.json(issueTokenPair(accessTokens, refreshTokens));
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  });

  function isValidAccessToken(token) {
    const entry = accessTokens.get(token);
    return Boolean(entry && entry.expiresAt >= Date.now());
  }

  return { router, isValidAccessToken };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test services/api/test/oauth.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add services/api/oauth.js
git commit -m "feat(api): replace the OAuth login page with GoTrue Google sign-in"
```

---

### Task 2: Wire up the new routes and infrastructure

**Files:**
- Modify: `services/api/server.js`
- Modify: `docker-compose.yml`
- Modify: `infrastructure/docker/nginx.conf`
- Modify: `docs/deployment/self-hosting.md`
- Test: `services/api/test/server.test.mjs` (update)

**Interfaces:**
- Consumes: `createOAuthRouter()` (no longer takes `apiKey`) from `oauth.js`

- [ ] **Step 1: Update the failing test**

In `services/api/test/server.test.mjs`, find the test `'a token minted through the full OAuth flow authenticates against /mcp'` and replace its body:

```js
test('a token minted through a real Google login authenticates against /mcp', async () => {
  const { pool } = createFakePool();
  // This test needs a route this app doesn't have in production (GoTrue's
  // /auth/v1/user lives on a separate real service) — mount a fake one
  // directly on the app instance before listening, bypassing the shared
  // withServer helper for just this one test.
  const app = createApp({ pool, apiKey: 'test-key', apiUserId: 'user-1' });
  app.get('/auth/v1/user', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (token === 'valid-google-token') return res.json({ id: 'user-1', email: 'rider@example.com' });
    res.status(401).json({ error: 'invalid token' });
  });
  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const crypto = await import('node:crypto');
    const base64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';

    const authorizeResponse = await fetch(
      `${baseUrl}/authorize?client_id=routefolk-mcp&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`,
      { redirect: 'manual' },
    );
    const location = new URL(authorizeResponse.headers.get('location'));
    const redirectTo = new URL(location.searchParams.get('redirect_to'));
    const pending = redirectTo.searchParams.get('pending');

    const verifyResponse = await fetch(`${baseUrl}/google-verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pending, access_token: 'valid-google-token' }),
    });
    assert.equal(verifyResponse.status, 200);
    const { redirect } = await verifyResponse.json();
    const code = new URL(redirect).searchParams.get('code');

    const tokenResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }),
    });
    const { access_token: accessToken } = await tokenResponse.json();

    const mcpResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.equal(mcpResponse.status, 200);
  } finally {
    server.close();
  }
});

test('/google-callback and /google-verify are reachable without any credential', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const callbackResponse = await fetch(`${baseUrl}/google-callback`);
    assert.equal(callbackResponse.status, 200);

    const verifyResponse = await fetch(`${baseUrl}/google-verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pending: 'unknown', access_token: 'x' }),
    });
    // Reaches the route logic (400 invalid_grant for an unknown pending id)
    // rather than being stopped by the auth middleware (401) — proves
    // /google-verify is correctly in the exemption list, not just that it
    // returns *some* non-500 status.
    assert.equal(verifyResponse.status, 400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test services/api/test/server.test.mjs`
Expected: FAIL — `createOAuthRouter(apiKey)` in `server.js` still passes an argument the rewritten function no longer accepts (harmless positionally, but the real failure is that this specific test doesn't exist yet under its new name/body — confirm by running and reading the output).

- [ ] **Step 3: Update `services/api/server.js`**

Change:
```js
  const { router: oauthRouter, isValidAccessToken } = createOAuthRouter(apiKey);
```
to:
```js
  const { router: oauthRouter, isValidAccessToken } = createOAuthRouter();
```

Change the auth middleware's exempt-paths list:
```js
    const exemptPaths = ['/health', '/openapi.json', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/authorize', '/token'];
```
to:
```js
    const exemptPaths = ['/health', '/openapi.json', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/authorize', '/google-callback', '/google-verify', '/token'];
```

- [ ] **Step 4: Widen GoTrue's redirect allowlist in `docker-compose.yml`**

Find the `auth` service's `GOTRUE_URI_ALLOW_LIST` line:
```yaml
      GOTRUE_URI_ALLOW_LIST: ${SITE_URL:-http://localhost:8788}/*
```
Replace it with:
```yaml
      GOTRUE_URI_ALLOW_LIST: ${SITE_URL:-http://localhost:8788}/*,${API_EXTERNAL_URL:-http://127.0.0.1:18080}/*
```

- [ ] **Step 5: Proxy the 2 new routes through the gateway**

In `infrastructure/docker/nginx.conf`, add these two blocks right after the existing `location = /token { ... }` block, before the final `location / { return 404; }`:

```nginx
  location = /google-callback {
    proxy_pass http://api:3001/google-callback;
    proxy_set_header Host $host;
  }
  location = /google-verify {
    limit_req zone=routefolk_api burst=$ROUTEFOLK_API_RATE_LIMIT_BURST nodelay;
    limit_req_status 429;
    access_log /dev/stdout routefolk_api;

    proxy_pass http://api:3001/google-verify;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $routefolk_forwarded_proto;
  }
```

(`/google-callback` just serves a static page — no rate limiting needed, matching `/health`'s plain-proxy pattern. `/google-verify` is rate-limited like `/authorize`/`/token`, since it's still part of the auth surface.)

- [ ] **Step 6: Update the login instructions in `docs/deployment/self-hosting.md`**

Find the paragraph documenting the OAuth Client ID (added in the previous plan) and replace it:

```markdown
Connecting Claude's remote MCP connector requires OAuth (Claude's connector
UI has no plain bearer-token field). When adding the connector in Claude,
enter `routefolk-mcp` as the OAuth Client ID (leave the Client Secret
blank). Clicking through takes you to the same Google sign-in the Routefolk
PWA itself uses — no separate credential to retrieve or paste, and it works
from a phone with nothing but a Google account already approved for the
group. This issues Claude a short-lived session that refreshes itself
automatically; restarting the `api` container invalidates active sessions,
requiring one more Google sign-in.
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
node --test services/api/test/server.test.mjs
node --test services/api/test/*.test.mjs
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add services/api/server.js docker-compose.yml infrastructure/docker/nginx.conf docs/deployment/self-hosting.md
git commit -m "feat(api): wire the Google sign-in flow through server.js, nginx, and GoTrue's allowlist"
```

---

### Task 3: Live verification against real Claude

**Files:** none (manual — no automated substitute for a real Google sign-in and a real Claude client)

- [ ] **Step 1: Regenerate the deployed `.env`'s allowlist value**

The `GOTRUE_URI_ALLOW_LIST` change in Task 2 only takes effect for containers that read the updated `docker-compose.yml`. On the home server:

```bash
cd /opt/routefolk
git pull
docker compose up -d --build --force-recreate api auth gateway
```

(`auth` needs recreating too this time, since its `GOTRUE_URI_ALLOW_LIST` environment value changed.)

- [ ] **Step 2: Disconnect the existing Claude connector**

In Claude's connector settings, disconnect the current Routefolk connector — its existing session was issued under the old login flow and won't reflect the new one.

- [ ] **Step 3: Reconnect**

Add the connector again with the same URL and OAuth Client ID (`routefolk-mcp`, blank secret) as before.

Expected: instead of a key-paste form, you land on a Google sign-in screen.

- [ ] **Step 4: Sign in with Google**

Complete the Google sign-in with the same account already approved for Routefolk.

Expected: redirected back to Claude, connector shows connected — no API key involved anywhere in this step.

- [ ] **Step 5: Confirm it actually works**

```
List my Routefolk trips.
```
Expected: works exactly as before.

- [ ] **Step 6: Report the result**

Report what happened at each step, especially whether the Google sign-in screen appeared correctly and whether the connection completed without any manual key entry.
