#!/usr/bin/env bash
# Merge finanzas-mati-web into Sebastian-Tamayo/personal without destroying other content.
# Requires: GITHUB_TOKEN or GH_TOKEN (PAT with repo access), or gh auth login.
set -euo pipefail

REPO_HTTPS="https://github.com/Sebastian-Tamayo/personal.git"
APP_SRC="${APP_SRC:-/agent/finanzas-mati-web}"
WORK="${WORK:-/tmp/personal-push}"
BRANCH_DEFAULT=""

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  if gh auth status >/dev/null 2>&1; then
    TOKEN="$(gh auth token)"
  fi
fi
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: no GITHUB_TOKEN/GH_TOKEN and gh is not logged in." >&2
  exit 1
fi

AUTH_URL="https://x-access-token:${TOKEN}@github.com/Sebastian-Tamayo/personal.git"

rm -rf "$WORK"
git clone --depth 50 "$AUTH_URL" "$WORK"
cd "$WORK"

DEFAULT_BRANCH="$(git remote show origin | awk '/HEAD branch/ {print $NF}')"
git checkout "$DEFAULT_BRANCH"

# Copy app (exclude node_modules, dist, .env, .git)
mkdir -p finanzas-mati-web
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude .env \
  --exclude '.env.*' \
  --include '.env.example' \
  "$APP_SRC/" finanzas-mati-web/

# Safety: never stage secrets
if [[ -f finanzas-mati-web/.env ]]; then
  echo "ERROR: .env present — aborting" >&2
  exit 1
fi

git add finanzas-mati-web
if git diff --cached --quiet; then
  echo "Nothing to commit (finanzas-mati-web already up to date)."
  exit 0
fi

git -c user.email="agent@cursor.local" -c user.name="Cursor Agent" commit -m "$(cat <<'EOF'
feat: add Finanzas Mati Vite+Firebase SPA under finanzas-mati-web/

Shared finances MVP (Auth, Firestore, Zustand, Spanish UI).
Does not replace existing repo content.
EOF
)"

git push origin "HEAD:${DEFAULT_BRANCH}"
echo "Pushed to ${REPO_HTTPS} branch ${DEFAULT_BRANCH}"
echo "Path: https://github.com/Sebastian-Tamayo/personal/tree/${DEFAULT_BRANCH}/finanzas-mati-web"
git rev-parse HEAD
