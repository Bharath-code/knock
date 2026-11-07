#!/usr/bin/env bash
# Stores a Turnstile widget's secret as a Worker secret without printing it (Cloudflare "existing widget" flow).
# Needs a Wrangler 4.109+ installed OUTSIDE this project (e.g. npm i -g wrangler), never npx or node_modules.
# Usage: WORKER_NAME=doorbell-staging SITEKEY=... EXPECTED_DOMAINS_JSON='["host"]' bash scripts/turnstile-secret.sh
set -euo pipefail
: "${WORKER_NAME:?}" "${SITEKEY:?}" "${EXPECTED_DOMAINS_JSON:?}"
SECRET_NAME="${SECRET_NAME:-TURNSTILE_SECRET}"
ACCOUNT_ID="${ACCOUNT_ID:-29ecbeded44feedc7d9d49041b04c829}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
WRANGLER_BIN="$(python3 -I -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$(command -v wrangler || true)")"
[[ -x "$WRANGLER_BIN" && "$WRANGLER_BIN" != "$PROJECT_ROOT"/* ]] || { echo "Install wrangler outside the project first (npm i -g wrangler)." >&2; exit 1; }
WRANGLER_VERSION="$("$WRANGLER_BIN" --version | python3 -I -c 'import re,sys; m=re.search(r"\b(\d+\.\d+\.\d+)\b", sys.stdin.read()); print(m.group(1) if m else "")')"
python3 -I -c 'import sys; v=tuple(map(int,sys.argv[1].split("."))); raise SystemExit(0 if v >= (4,109,0) else 1)' "$WRANGLER_VERSION" || { echo "Wrangler $WRANGLER_VERSION is too old (need 4.109+)." >&2; exit 1; }
echo "Will store the secret of widget $SITEKEY (must list $EXPECTED_DOMAINS_JSON) as $SECRET_NAME on Worker $WORKER_NAME, account $ACCOUNT_ID, using $WRANGLER_BIN $WRANGLER_VERSION."
read -r -p "Type yes to continue: " ok; [[ "$ok" == "yes" ]] || exit 1
(
  set +x
  export WRANGLER_WRITE_LOGS=false WRANGLER_LOG=log WRANGLER_LOG_SANITIZE=true CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
  target_args=(--name "$WORKER_NAME")
  "$WRANGLER_BIN" secret list "${target_args[@]}" >/dev/null
  secret="$(
    "$WRANGLER_BIN" turnstile widget get "$SITEKEY" --json |
      jq -er --arg sitekey "$SITEKEY" --argjson expected "$EXPECTED_DOMAINS_JSON" '
        . as $widget
        | select(
            ($widget.sitekey == $sitekey) and
            (($widget.clearance_level | type) == "string") and
            (["no_clearance", "interactive", "managed", "jschallenge"] | index($widget.clearance_level) != null) and
            (($widget.domains | type) == "array") and
            (($widget.secret | type) == "string") and
            ($widget.secret | test("^\\S+$")) and
            (all($expected[]; . as $domain | $widget.domains | index($domain) != null))
          )
        | $widget.secret'
  )" || { echo "Widget check failed: wrong sitekey, missing domain, or no secret." >&2; exit 1; }
  if ! printf '%s' "$secret" |
    python3 -I -c 'import sys,urllib.parse; print(urllib.parse.urlencode({"secret":sys.stdin.read(),"response":"XXXX.DUMMY.TOKEN.XXXX"}),end="")' |
    curl --disable -sS https://challenges.cloudflare.com/turnstile/v0/siteverify -H "Content-Type: application/x-www-form-urlencoded" --data-binary @- |
    python3 -I -c 'import json,sys; d=json.load(sys.stdin); c=d.get("error-codes") or []; raise SystemExit(0 if d.get("success") is False and "invalid-input-response" in c and "invalid-input-secret" not in c else 1)'
  then echo "Secret failed the siteverify check." >&2; exit 1; fi
  printf '%s' "$secret" | "$WRANGLER_BIN" secret put "$SECRET_NAME" "${target_args[@]}"
  "$WRANGLER_BIN" secret list "${target_args[@]}" | jq -e --arg n "$SECRET_NAME" 'any(.[]; .name == $n)' >/dev/null
  unset secret
  echo "Stored $SECRET_NAME on $WORKER_NAME."
)
