#!/bin/sh
set -eu
[ ! -e .env ] || { echo '.env already exists; refusing to overwrite it.' >&2; exit 1; }
base64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() {
  role="$1"; secret="$2"
  header=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64url)
  now=$(date +%s); exp=$((now + 315360000))
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$now" "$exp" | base64url)
  signature=$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$secret" -binary | base64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}
secret=$(openssl rand -hex 32)
cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$secret
ANON_KEY=$(jwt anon "$secret")
SERVICE_ROLE_KEY=$(jwt service_role "$secret")
AGENT_API_KEY=$(openssl rand -hex 32)
AGENT_USER_ID=00000000-0000-4000-8000-000000000001
API_EXTERNAL_URL=http://127.0.0.1:18080
SITE_URL=http://localhost:8788
BIND_ADDRESS=127.0.0.1
PORT=18080
GOOGLE_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MAILER_AUTOCONFIRM=true
DISABLE_SIGNUP=false
ENV
chmod 600 .env
echo 'Created .env. Run: docker compose up --build'
