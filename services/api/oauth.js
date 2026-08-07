import express from 'express';
import crypto from 'node:crypto';

const OAUTH_CLIENT_ID = 'routefolk-mcp';
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Only Claude's own hosted-surfaces callback is a legitimate destination for
// an authorization code. Accepting an arbitrary redirect_uri here would let
// an attacker redirect a real user's authorization code to a URL they
// control (this client has no secret, so nothing else stops that).
const ALLOWED_REDIRECT_URIS = ['https://claude.ai/api/mcp/auth_callback'];

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

export function createOAuthRouter(pool) {
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
    if (!ALLOWED_REDIRECT_URIS.includes(redirectUri)) return res.status(400).send('redirect_uri is not allowed.');
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

    let email;
    try {
      email = (await userResponse.json())?.email;
    } catch {
      return res.status(401).json({ error: 'invalid_grant' });
    }
    if (!email) return res.status(401).json({ error: 'invalid_grant' });

    // Completing GoTrue's Google sign-in only proves the person has a real
    // Google account -- it does not prove they're an approved Routefolk
    // member (GOTRUE_DISABLE_SIGNUP does not restrict who can sign in). The
    // real membership boundary is public.app_members, the same allowlist
    // migration 010 introduced for exactly this reason. Without this check,
    // any Google account could obtain a full-access session.
    //
    // This runs in an async handler on Express 4, which does not forward
    // rejected promises to the error middleware -- an unhandled rejection
    // here would take down the whole (publicly reachable) API process, so a
    // database blip must be caught and answered explicitly. Fail closed: if
    // membership cannot be confirmed, no authorization code is issued.
    let memberResult;
    try {
      memberResult = await pool.query(
        'select 1 from public.app_members where lower(email) = lower($1) and active limit 1',
        [email],
      );
    } catch (error) {
      console.error('app_members membership check failed', error);
      return res.status(503).json({ error: 'temporarily_unavailable' });
    }
    if (memberResult.rows.length === 0) return res.status(401).json({ error: 'invalid_grant' });

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
