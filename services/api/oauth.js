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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function authorizeFormHtml({ redirectUri, codeChallenge, state, error }) {
  const errorHtml = error ? `<p style="color:#b91c1c">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Connect to Routefolk</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 420px; margin: 4rem auto; padding: 0 1rem;">
  <h1>Connect to Routefolk</h1>
  <p>Enter your Routefolk API key to allow this connection.</p>
  ${errorHtml}
  <form method="POST" action="/authorize">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri || '')}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge || '')}">
    <input type="hidden" name="state" value="${escapeHtml(state || '')}">
    <input type="password" name="api_key" placeholder="Routefolk API key" required style="width:100%; padding:0.5rem; font-size:1rem;">
    <button type="submit" style="margin-top:1rem; padding:0.5rem 1rem; font-size:1rem;">Connect</button>
  </form>
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

export function createOAuthRouter(apiKey) {
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
    res.set('content-type', 'text/html').send(authorizeFormHtml({ redirectUri, codeChallenge, state, error: null }));
  });

  router.post('/authorize', express.urlencoded({ extended: false }), (req, res) => {
    const { redirect_uri: redirectUri, code_challenge: codeChallenge, state, api_key: suppliedKey } = req.body;
    if (suppliedKey !== apiKey) {
      return res.status(401).set('content-type', 'text/html').send(authorizeFormHtml({ redirectUri, codeChallenge, state, error: 'Incorrect API key.' }));
    }
    const code = randomToken();
    authorizationCodes.set(code, { codeChallenge, redirectUri, expiresAt: Date.now() + AUTH_CODE_TTL_MS });
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);
    res.redirect(redirectUrl.toString());
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
